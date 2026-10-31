// Pure helpers for boards (no React): what a cell shows, which status label stands for an item, how built-in
// columns map onto to-do fields, and filtering / grouping. Mirrors the backend's utils/columns.js.

import { PALETTE } from '../../theme/theme';

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
  dependency: 'open_blocker_count',
  item_id: 'id',
  created: 'created_at',
  updated: 'updated_at',
};

/** Built-in columns people can edit straight in the cell (the rest show, and change in the item window). */
export const EDITABLE_SYSTEM = new Set(['status', 'person', 'date', 'deadline', 'timeline', 'priority', 'estimate', 'labels']);

/** Custom column kinds that can be typed or picked in a cell today. */
export const EDITABLE_KINDS = new Set([
  'status', 'person', 'date', 'timeline', 'dropdown', 'tags', 'text', 'long_text', 'numbers', 'checkbox', 'link',
  'email', 'phone', 'rating', 'progress', 'hour', 'week', 'location', 'country', 'color',
]);

export function canEditColumn(column) {
  return column.system_key ? EDITABLE_SYSTEM.has(column.system_key) : EDITABLE_KINDS.has(column.kind);
}

export const paletteHex = (name) => PALETTE[name]?.hex || PALETTE.grey.hex;
export const paletteInk = (name) => PALETTE[name]?.ink || '#1f1f1f';

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
