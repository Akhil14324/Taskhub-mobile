// Pure helpers for boards (no React): what a cell shows, which status label stands for an item, how built-in
// columns map onto to-do fields, and filtering / grouping. Mirrors the backend's utils/columns.js.

import { PALETTE } from '../../theme/theme';
import { isDarkMode } from '../kit';
import { todayYmd, addDays, parseYmd } from '../../utils/dates';

export const STATUS_KEYS = ['todo', 'in_progress', 'blocked', 'in_review', 'on_hold', 'done'];

// How a built-in column changes its to-do field (see routes/boards.js on the server).
export const SYSTEM_FIELDS = {
  status: 'status',
  person: 'assignee_id',
  date: 'due_date',
  deadline: 'deadline_date',
  timeline: ['start_date', 'due_date'],
  priority: 'priority',
  estimate: 'duration_minutes',
  labels: 'labels',
  points: 'story_points',
  sprint: 'sprint_id',
  item_type: 'item_type',
  dependency: 'depends_on',
  item_id: 'id',
  created: 'created_at',
  updated: 'updated_at',
};

/** Built-in columns people can edit straight in the cell (the rest show, and change in the item window). */
export const EDITABLE_SYSTEM = new Set(['status', 'person', 'date', 'deadline', 'timeline', 'priority', 'estimate', 'labels', 'dependency']);

/** Custom column kinds that can be typed or picked in a cell today. */
export const EDITABLE_KINDS = new Set([
  'status', 'person', 'date', 'timeline', 'dropdown', 'tags', 'text', 'long_text', 'numbers', 'checkbox', 'link',
  'email', 'phone', 'rating', 'progress', 'hour', 'week', 'location', 'country', 'color',
  'files', 'board_relation', 'world_clock', 'ai',
]);

/** Kinds that change in the cell itself (no editor): a tick, stars, a vote. */
export const IN_CELL_KINDS = new Set(['checkbox', 'rating', 'vote']);

export function canEditColumn(column) {
  return column.system_key ? EDITABLE_SYSTEM.has(column.system_key) : EDITABLE_KINDS.has(column.kind);
}

// In dark mode the light grey ("Not started") turns slate with white text, as on a dark board.
const DARK_GREY = { hex: '#797e93', ink: '#ffffff' };
const swatch = (name) => (isDarkMode() && (name === 'grey' || !PALETTE[name]) ? DARK_GREY : PALETTE[name] || PALETTE.grey);
export const paletteHex = (name) => swatch(name).hex;
export const paletteInk = (name) => swatch(name).ink;

/** What a board calls one of its rows. Boards made before the rename still say "Item"; people say "Task". */
export function itemWordOf(board) {
  const w = board?.board?.item_word || board?.item_word || 'Task';
  return w === 'Item' ? 'Task' : w;
}

/** The earliest and latest date an item list covers on a date or timeline column, for the group summary pill. */
export function dateRange(items, column, values) {
  const days = [];
  for (const it of items) {
    const v = cellValue(it, column, values);
    if (column.kind === 'timeline') {
      const [s, e] = column.system_key ? v : v ? [v.start, v.end] : [null, null];
      if (s) days.push(s);
      if (e) days.push(e);
    } else if (column.kind === 'date') {
      const d = column.system_key ? v : v?.date;
      if (d) days.push(d);
    }
  }
  if (!days.length) return null;
  days.sort();
  return [days[0], days[days.length - 1]];
}

/** The label shown for an item on a status column. */
export function statusLabelOf(item, column, values) {
  const labels = column.labels || [];
  if (column.system_key === 'status') {
    return labels.find((l) => l.maps_to === item.status) || { label: STATUS_FALLBACK[item.status] || item.status, color: 'grey', maps_to: item.status };
  }
  const v = values?.[item.id]?.[column.id];
  return v ? labels.find((l) => l.id === v.label_id) || null : null;
}

const STATUS_FALLBACK = {
  todo: 'Not started', in_progress: 'Working on it', blocked: 'Stuck', in_review: 'In review', on_hold: 'On hold', done: 'Done',
};

/** The stored value behind a cell: a to-do field for built-in columns, item_values for custom ones. */
export function cellValue(item, column, values) {
  if (column.system_key) {
    const field = SYSTEM_FIELDS[column.system_key];
    if (Array.isArray(field)) return field.map((f) => item[f] ?? null);
    return item[field] ?? null;
  }
  return values?.[item.id]?.[column.id] ?? null;
}

/** Plain text of a cell, for search, sorting and the phone cards. */
export function cellText(item, column, values, people = []) {
  const v = cellValue(item, column, values);
  if (v === null || v === undefined) return '';
  switch (column.kind) {
    case 'status': return statusLabelOf(item, column, values)?.label || '';
    case 'person': {
      const ids = column.system_key ? [v] : v;
      return (ids || []).map((id) => people.find((p) => p.id === id)?.name || (id === item.assignee_id ? item.assignee_name : '')).filter(Boolean).join(', ');
    }
    case 'date': return column.system_key ? v : v.date + (v.time ? ` ${v.time}` : '');
    case 'timeline': return column.system_key ? (v[0] || v[1] ? `${v[0] || '?'} – ${v[1] || '?'}` : '') : `${v.start} – ${v.end}`;
    case 'dropdown': return (v || []).map((id) => (column.settings?.options || []).find((o) => o.id === id)?.label).filter(Boolean).join(', ');
    case 'tags': return (v || []).join(', ');
    case 'link': return v.text || v.url;
    case 'location': return v.address || '';
    case 'checkbox': return v ? 'Yes' : '';
    case 'priority': return v ? `P${v}` : '';
    case 'dependency': return (v || []).map((d) => d.title).join(', ');
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

/** Items of one group, top level first with sub-items right after their parent (depth for indenting). */
export function itemsInGroup(items, groupId) {
  const top = items.filter((t) => !t.parent_id && (t.business_section_id || null) === (groupId || null));
  const byParent = new Map();
  for (const t of items) if (t.parent_id) {
    if (!byParent.has(t.parent_id)) byParent.set(t.parent_id, []);
    byParent.get(t.parent_id).push(t);
  }
  return { top, children: byParent };
}

/**
 * The blocks a board shows: one per group, plus "No group" first for items with no group or whose group was
 * archived (an archived group hides itself, never its items).
 */
export function groupBlocks(groups, items) {
  const ids = new Set(groups.map((g) => g.id));
  const homeless = items.map((t) => (!t.parent_id && t.business_section_id && !ids.has(t.business_section_id)
    ? { ...t, business_section_id: null } : t));
  const out = groups.map((g) => ({ group: g, ...itemsInGroup(homeless, g.id) }));
  const loose = itemsInGroup(homeless, null);
  if (loose.top.length) out.unshift({ group: { id: null, name: 'No group', color: 'grey' }, ...loose });
  return out;
}

/** Text search across the item name and every visible cell. */
export function matchesSearch(item, query, columns, values, people) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  return columns.some((c) => cellText(item, c, values, people).toLowerCase().includes(q));
}

/** Count of items per status label, for the group summary bar. */
export function statusBreakdown(items, column, values) {
  const out = new Map();
  for (const it of items) {
    const l = statusLabelOf(it, column, values);
    const key = l ? (l.id || l.maps_to) : 'none';
    const cur = out.get(key) || { label: l?.label || '', color: l?.color || 'grey', count: 0 };
    cur.count += 1;
    out.set(key, cur);
  }
  return [...out.values()];
}

/** Sum / average of a numbers column across items (custom or built-in). */
export function numberSummary(items, column, values) {
  const nums = items.map((it) => cellValue(it, column, values)).filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return column.settings?.summary === 'average' ? sum / nums.length : sum;
}

export function formatNumber(n, settings = {}) {
  if (n === null || n === undefined || n === '') return '';
  const decimals = Number.isInteger(settings.decimals) ? settings.decimals : (Number.isInteger(n) ? 0 : 2);
  const text = Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!settings.unit) return text;
  return settings.unit_side === 'right' || /^[a-z%]/i.test(settings.unit) ? `${text} ${settings.unit}` : `${settings.unit}${text}`;
}

// ---- Excel-style column filters ------------------------------------------------------------------------
// A filter is { [columnId]: [valueKey, ...] }: an item stays when, for every filtered column, one of its value
// keys is picked. `none` is the empty cell. The same keys feed the Filter panel's lists and their counts.

const NAME_COL = 'name';
export const NAME_FILTER = NAME_COL;

function ymdOf(item, column, values) {
  const v = cellValue(item, column, values);
  if (column.kind === 'timeline') return (column.system_key ? v?.[1] : v?.end) || null;
  if (column.kind === 'date') return (column.system_key ? v : v?.date) || null;
  return null;
}

/** The date buckets a due date can fall in (the Due date filter list). */
export const DATE_BUCKETS = [
  ['overdue', 'Overdue'], ['done_on_time', 'Done on time'], ['done_overdue', 'Done overdue'], ['today', 'Today'],
  ['tomorrow', 'Tomorrow'], ['this_week', 'This week'], ['next_week', 'Next week'], ['this_month', 'This month'],
  ['future', 'Future dates'], ['past', 'Past dates'], ['none', 'Blank'],
];

function dateKeys(item, column, values) {
  const d = ymdOf(item, column, values);
  if (!d) return ['none'];
  const today = todayYmd();
  const keys = [];
  const done = !!item.is_done;
  const doneOn = (item.completed_at || item.done_at || '').slice(0, 10);
  if (!done && d < today) keys.push('overdue');
  if (done && doneOn && doneOn > d) keys.push('done_overdue');
  if (done && (!doneOn || doneOn <= d)) keys.push('done_on_time');
  if (d === today) keys.push('today');
  if (d === addDays(today, 1)) keys.push('tomorrow');
  const dow = (parseYmd(today).getDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  if (d >= weekStart && d <= addDays(weekStart, 6)) keys.push('this_week');
  if (d >= addDays(weekStart, 7) && d <= addDays(weekStart, 13)) keys.push('next_week');
  if (d.slice(0, 7) === today.slice(0, 7)) keys.push('this_month');
  keys.push(d > today ? 'future' : d < today ? 'past' : 'today_exact');
  return keys;
}

/** [{ key, label }] an item has on a column (the name column is `name`). */
export function valueKeysOf(item, column, values, people = []) {
  if (column === NAME_COL) return [{ key: `t:${item.title}`, label: item.title }];
  const v = cellValue(item, column, values);
  const blank = [{ key: 'none', label: 'Blank' }];
  switch (column.kind) {
    case 'status': {
      const l = statusLabelOf(item, column, values);
      return l ? [{ key: `l:${l.id || l.maps_to}`, label: l.label, color: l.color }] : blank;
    }
    case 'person': {
      const ids = column.system_key ? (v ? [v] : []) : (v || []);
      if (!ids.length) return [{ key: 'none', label: 'Unassigned' }];
      return ids.map((id) => ({ key: `p:${id}`, label: people.find((p) => p.id === id)?.name || (id === item.assignee_id ? item.assignee_name : '') || `User ${id}`, person: id }));
    }
    case 'date': case 'timeline': return dateKeys(item, column, values).map((k) => ({ key: `d:${k}`, label: (DATE_BUCKETS.find((b) => b[0] === k) || [k, k])[1] }));
    case 'dependency': return (v || []).length ? v.map((d) => ({ key: `t:${d.title}`, label: d.title })) : blank;
    case 'files': return values?.[item.id]?.[column.id]?.length || (v && v.length) ? [{ key: 'has', label: 'Has files' }] : [{ key: 'none', label: 'No files' }];
    case 'checkbox': return [{ key: v ? 'yes' : 'no', label: v ? 'Checked' : 'Unchecked' }];
    default: {
      const t = cellText(item, column, values, people).trim();
      return t ? [{ key: `t:${t.slice(0, 80)}`, label: t.slice(0, 80) }] : blank;
    }
  }
}

/** The list a column's filter shows: every value in use with its count, date buckets in their fixed order. */
export function filterOptions(items, column, values, people = []) {
  const map = new Map();
  for (const it of items) {
    for (const o of valueKeysOf(it, column, values, people)) {
      if (o.key === 'd:today_exact') continue;
      const cur = map.get(o.key) || { ...o, count: 0 };
      cur.count += 1;
      map.set(o.key, cur);
    }
  }
  const out = [...map.values()];
  if (column !== NAME_COL && (column.kind === 'date' || column.kind === 'timeline')) {
    const order = DATE_BUCKETS.map((b) => `d:${b[0]}`);
    out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else if (column !== NAME_COL && column.kind === 'status') {
    const order = (column.labels || []).map((l) => `l:${l.id || l.maps_to}`);
    out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else out.sort((a, b) => (a.key === 'none') - (b.key === 'none') || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  return out;
}

/** Does an item pass every column filter in `cols` ({ columnId | 'name': [keys] })? */
export function passesColumnFilters(item, columns, values, people, cols) {
  for (const [id, keys] of Object.entries(cols || {})) {
    if (!keys?.length) continue;
    const column = id === NAME_COL ? NAME_COL : columns.find((c) => String(c.id) === String(id));
    if (!column) continue;
    const have = valueKeysOf(item, column, values, people).map((o) => o.key);
    if (!keys.some((k) => have.includes(k))) return false;
  }
  return true;
}
