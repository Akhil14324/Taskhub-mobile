// Board dashboards: a dashboard is a view tab whose settings hold `widgets`. Everything here is pure: it turns the
// board's own items, columns and values into what each widget draws, so the dashboard always matches the table.
// The widget shape is validated again on the server (backend utils/boardDashboard.js): keep both in step.
import { cellValue, valueKeysOf, statusLabelOf } from '../components/board/model';
import { todayYmd, addDays } from './dates';

export const WIDGET_TYPES = ['number', 'chart', 'table', 'progress', 'list', 'text'];
export const AGGS = [['count', 'Count'], ['sum', 'Sum'], ['avg', 'Average'], ['min', 'Smallest'], ['max', 'Largest']];
export const FILTERS = [['all', 'All'], ['open', 'Open'], ['done', 'Done'], ['overdue', 'Overdue'], ['mine', 'Mine'], ['this_week', 'Due this week'],
  ['due_today', 'Due today'], ['working', 'Being worked on'], ['stuck', 'Stuck'], ['unassigned', 'Nobody on it'], ['no_date', 'No date'], ['done_week', 'Finished in 7 days']];
// Ready-made measures for a number widget: [key, label, what it says].
export const METRICS = [
  ['on_time', 'Finished on time', 'Share of finished tasks done by their due date'],
  ['finish_days', 'Days to finish', 'Average days from added to done'],
  ['late_days', 'Days late', 'Average days the late tasks are overdue'],
  ['done_7', 'Finished in 7 days', 'Tasks finished in the last 7 days'],
  ['new_7', 'Added in 7 days', 'Tasks added in the last 7 days'],
  ['steps', 'Steps done', 'Share of all steps that are finished'],
  ['load', 'Open tasks per person', 'Open tasks divided by the people who have any'],
];
export const CHARTS = ['column', 'bar', 'line', 'smooth_line', 'stacked_column', 'stacked_bar', 'pct_stacked_column', 'pie', 'donut'];
export const BUILTIN_DIMS = [['status', 'Status'], ['person', 'Person'], ['group', 'Group'], ['priority', 'Priority'], ['due_bucket', 'When it is due'], ['age', 'How old it is'], ['on_time', 'On time or late'], ['due_week', 'Due week'], ['due_month', 'Due month'], ['created_week', 'Added week'], ['done_week', 'Finished week'], ['flow', 'Added and finished, by week']];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PRIORITY = { 1: ['Urgent', 'red'], 2: ['High', 'orange'], 3: ['Normal', 'blue'], 4: ['Low', 'grey'] };
const COLORS = ['dark_orange', 'aquamarine', 'purple', 'green', 'blue', 'yellow', 'pink', 'indigo', 'red', 'grass'];
const dueOf = (t) => t.due_date || t.deadline_date || null;
const uid = () => Math.random().toString(36).slice(2, 9);

function weekStart(d) {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
const shortDay = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** Top-level items a widget's filter keeps. */
export function scopeItems(items, filter, meId) {
  const today = todayYmd();
  const top = items.filter((t) => !t.parent_id);
  switch (filter) {
    case 'open': return top.filter((t) => !t.is_done);
    case 'done': return top.filter((t) => t.is_done);
    case 'overdue': return top.filter((t) => !t.is_done && dueOf(t) && dueOf(t) < today);
    case 'mine': return top.filter((t) => t.assignee_id === meId);
    case 'this_week': return top.filter((t) => dueOf(t) && dueOf(t) >= today && dueOf(t) <= addDays(today, 7));
    case 'due_today': return top.filter((t) => !t.is_done && dueOf(t) === today);
    case 'working': return top.filter((t) => !t.is_done && t.status === 'in_progress');
    case 'stuck': return top.filter((t) => !t.is_done && t.status === 'blocked');
    case 'unassigned': return top.filter((t) => !t.is_done && !t.assignee_id);
    case 'no_date': return top.filter((t) => !t.is_done && !dueOf(t));
    case 'done_week': return top.filter((t) => t.is_done && t.done_at && t.done_at.slice(0, 10) >= addDays(today, -6));
    default: return top;
  }
}

/** A column a widget can sum: numbers, formulas, and the estimate. */
export const numericColumns = (board) => board.columns.filter((c) => c.kind === 'numbers' || c.kind === 'formula' || c.kind === 'rating');

/** Every column or built-in a chart can be split by: [key, label]. */
export function dimensionsOf(board) {
  const cols = board.columns.filter((c) => !['files', 'long_text', 'updates', 'dependency', 'ai'].includes(c.kind) && !c.system_key)
    .map((c) => [`col:${c.id}`, c.title]);
  return [...BUILTIN_DIMS, ...cols];
}

/** [key, label, color, sort] of an item along one dimension (an item can have several on a multi-value column). */
function dimOf(dim, t, ctx) {
  const { board, people } = ctx;
  if (dim === 'status') {
    const col = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
    const l = col ? statusLabelOf(t, col, board.values) : null;
    const order = col ? (col.labels || []).findIndex((x) => (x.id || x.maps_to) === (l?.id || l?.maps_to)) : 0;
    return [[l?.id || l?.maps_to || 'none', l?.label || 'No status', l?.color || 'grey', String(order).padStart(3, '0')]];
  }
  if (dim === 'person') return [[t.assignee_id || 0, t.assignee_name || people.find((p) => p.id === t.assignee_id)?.name || 'Nobody', null, null]];
  if (dim === 'group') {
    const g = board.groups.find((x) => x.id === t.business_section_id);
    return [[g?.id || 0, g?.name || 'No group', g?.color || 'grey', null]];
  }
  if (dim === 'priority') { const p = PRIORITY[t.priority] || PRIORITY[4]; return [[t.priority || 4, p[0], p[1], t.priority || 4]]; }
  if (dim === 'due_bucket') {
    if (t.is_done) return [['done', 'Done', 'green', '6']];
    const d = dueOf(t);
    const today = todayYmd();
    if (!d) return [['none', 'No date', 'grey', '5']];
    if (d < today) return [['late', 'Overdue', 'red', '0']];
    if (d === today) return [['today', 'Today', 'orange', '1']];
    if (d <= addDays(today, 7)) return [['week', 'Next 7 days', 'yellow', '2']];
    if (d <= addDays(today, 30)) return [['month', 'Next 30 days', 'aquamarine', '3']];
    return [['later', 'Later', 'purple', '4']];
  }
  if (dim === 'age') {
    if (t.is_done) return [['done', 'Done', 'green', '9']];
    const days = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);
    const b = days < 3 ? ['0', 'Under 3 days', 'green'] : days < 8 ? ['1', '3 to 7 days', 'aquamarine'] : days < 15 ? ['2', '1 to 2 weeks', 'yellow'] : days < 31 ? ['3', '2 to 4 weeks', 'orange'] : ['4', 'Over a month', 'red'];
    return [[b[0], b[1], b[2], b[0]]];
  }
  if (dim === 'on_time') {
    const d = dueOf(t);
    if (!t.is_done) return d && d < todayYmd() ? [['open_late', 'Open and late', 'red', '2']] : [['open', 'Open', 'grey', '3']];
    if (!d || !t.done_at) return [['nodate', 'Done, no date', 'aquamarine', '4']];
    return t.done_at.slice(0, 10) <= d ? [['ok', 'Done on time', 'green', '0']] : [['late', 'Done late', 'orange', '1']];
  }
  const time = { due_week: () => dueOf(t), due_month: () => dueOf(t), created_week: () => (t.created_at || '').slice(0, 10) || null, done_week: () => (t.is_done && t.done_at ? t.done_at.slice(0, 10) : null) }[dim];
  if (time) {
    const d = time();
    if (!d) return [['none', dim === 'done_week' ? 'Not finished' : 'No date', 'grey', '￿']];
    if (dim === 'due_month') return [[d.slice(0, 7), `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`, 'blue', d.slice(0, 7)]];
    const w = weekStart(d);
    return [[w, `Week of ${shortDay(w)}`, 'blue', w]];
  }
  if (dim.startsWith('col:')) {
    const col = board.columns.find((c) => String(c.id) === dim.slice(4));
    if (!col) return [['none', 'Blank', 'grey', '￿']];
    if (col.kind === 'date' || col.kind === 'timeline') {
      const v = cellValue(t, col, board.values);
      const d = col.kind === 'timeline' ? (col.system_key ? v?.[1] : v?.end) : (col.system_key ? v : v?.date);
      return d ? [[d.slice(0, 7), `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`, 'blue', d.slice(0, 7)]] : [['none', 'No date', 'grey', '￿']];
    }
    if (col.kind === 'dropdown') {
      const opts = col.settings?.options || [];
      const ids = cellValue(t, col, board.values) || [];
      if (!ids.length) return [['none', 'Blank', 'grey', '￿']];
      return ids.map((id) => { const o = opts.find((x) => x.id === id); return [id, o?.label || String(id), o?.color || null, String(opts.findIndex((x) => x.id === id)).padStart(3, '0')]; });
    }
    return valueKeysOf(t, col, board.values, people).map((o) => [o.key, o.label, o.color || null, o.key === 'none' ? '￿' : null]);
  }
  return [['none', 'All', 'blue', null]];
}

function numberOf(t, col, board) {
  if (!col) return null;
  const v = cellValue(t, col, board.values);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (col.kind === 'formula' && typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Combine numbers the way a widget asks. `count` counts items (or filled cells when a column is chosen). */
export function aggregate(list, agg, col, board) {
  if (agg === 'count' || !col) return agg === 'count' && col ? list.filter((t) => numberOf(t, col, board) !== null).length : list.length;
  const nums = list.map((t) => numberOf(t, col, board)).filter((n) => n !== null);
  if (!nums.length) return 0;
  if (agg === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (agg === 'min') return Math.min(...nums);
  return Math.max(...nums);
}

/** categories along the axis and one series per split value; values[i] belongs to categories[i]. */
export function matrix(list, w, ctx) {
  const by = w.by || 'status';
  const seriesBy = w.series && w.series !== by ? w.series : null;
  const valueCol = w.value ? ctx.board.columns.find((c) => String(c.id) === String(w.value)) : null;
  const agg = valueCol ? (w.agg || 'sum') : 'count';
  const timeAxis = ['due_week', 'due_month', 'created_week', 'done_week'].includes(by) || by.startsWith('col:') && ['date', 'timeline'].includes(ctx.board.columns.find((c) => String(c.id) === by.slice(4))?.kind);
  const cats = new Map();
  const sers = new Map();
  const cell = new Map();
  for (const t of list) {
    for (const [ck, cl, cc, cs] of dimOf(by, t, ctx)) {
      const c = cats.get(ck) || { key: ck, label: cl, color: cc, sort: cs, total: 0 };
      c.total += 1; cats.set(ck, c);
      for (const [sk, sl, sc] of seriesBy ? dimOf(seriesBy, t, ctx) : [['all', valueCol ? valueCol.title : 'Tasks', 'dark_orange']]) {
        if (!sers.has(sk)) sers.set(sk, { key: sk, label: sl, color: sc, total: 0 });
        sers.get(sk).total += 1;
        const k = `${ck}|${sk}`;
        if (!cell.has(k)) cell.set(k, []);
        cell.get(k).push(t);
      }
    }
  }
  let categories = [...cats.values()];
  const sorted = timeAxis || ['status', 'priority'].includes(by) || categories.some((c) => c.sort !== null && c.sort !== undefined);
  categories.sort(sorted ? (a, b) => String(a.sort ?? '').localeCompare(String(b.sort ?? '')) : (a, b) => b.total - a.total);
  categories = categories.slice(0, timeAxis ? 24 : 14);
  const series = [...sers.values()].sort((a, b) => b.total - a.total).slice(0, 8)
    .map((s, i) => ({ ...s, color: s.color || COLORS[i % COLORS.length] }));
  const num = (c, s) => Math.round(aggregate(cell.get(`${c.key}|${s.key}`) || [], agg, valueCol, ctx.board) * 100) / 100;
  return {
    categories: categories.map(({ key, label, color }) => ({ key, label, color })),
    series: series.map((s) => ({ key: s.key, label: s.label, color: s.color, values: categories.map((c) => num(c, s)) })),
  };
}

// ---- formulas: =SUM(Budget) / COUNT() -------------------------------------------------------------------
// A tiny safe evaluator (no JavaScript is ever run): numbers, + - * / ( ), and COUNT(), OPEN(), DONE(), OVERDUE(),
// SUM(col), AVG(col), MIN(col), MAX(col), PERCENT(a, b). A column is named by its heading, with or without quotes.
function tokenize(src) {
  const out = [];
  const re = /\s*(\d+(?:\.\d+)?|"[^"]*"|[A-Za-z_][A-Za-z0-9_ ]*|[()+\-*/,])/gy;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1].trim());
  return out;
}

export function evalFormula(src, ctx, items) {
  const toks = tokenize(String(src || '').replace(/^=/, ''));
  let i = 0;
  const today = todayYmd();
  const top = items.filter((t) => !t.parent_id);
  const col = (name) => ctx.board.columns.find((c) => c.title.toLowerCase() === String(name).replace(/"/g, '').trim().toLowerCase());
  const expr = () => { let v = term(); while (toks[i] === '+' || toks[i] === '-') { const op = toks[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = factor(); while (toks[i] === '*' || toks[i] === '/') { const op = toks[i++]; const r = factor(); v = op === '*' ? v * r : (r === 0 ? 0 : v / r); } return v; };
  const factor = () => {
    const t = toks[i++];
    if (t === undefined) throw new Error('unfinished');
    if (t === '-') return -factor();
    if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error('missing )'); return v; }
    if (/^\d/.test(t)) return Number(t);
    if (toks[i] === '(') {
      i += 1;
      const args = [];
      while (toks[i] !== ')') {
        if (toks[i] === undefined) throw new Error('missing )');
        if (toks[i] === ',') { i += 1; continue; }
        // A bare or quoted heading is a column; anything else is an expression.
        if (col(toks[i]) && (toks[i + 1] === ')' || toks[i + 1] === ',')) args.push(col(toks[i++])); else args.push(expr());
      }
      i += 1;
      const fn = t.toUpperCase();
      if (fn === 'COUNT') return top.length;
      if (fn === 'OPEN') return top.filter((x) => !x.is_done).length;
      if (fn === 'DONE') return top.filter((x) => x.is_done).length;
      if (fn === 'OVERDUE') return top.filter((x) => !x.is_done && dueOf(x) && dueOf(x) < today).length;
      if (fn === 'PERCENT') return args[1] ? (Number(args[0]) / Number(args[1])) * 100 : 0;
      const c = args[0];
      if (c && typeof c === 'object' && ['SUM', 'AVG', 'MIN', 'MAX'].includes(fn)) return aggregate(top, { SUM: 'sum', AVG: 'avg', MIN: 'min', MAX: 'max' }[fn], c, ctx.board);
      throw new Error(`unknown ${t}`);
    }
    throw new Error(`unknown ${t}`);
  };
  try {
    const v = expr();
    if (i < toks.length) return { error: 'Could not read the formula' };
    return { value: Math.round(v * 100) / 100 };
  } catch (e) {
    return { error: `Formula: ${e.message}` };
  }
}

/** Added against finished, week by week, for the last eight weeks: is the board keeping up? */
function flow(items) {
  const top = items.filter((t) => !t.parent_id);
  const first = weekStart(addDays(todayYmd(), -49));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(first, i * 7));
  const count = (pick) => weeks.map((w) => top.filter((t) => { const d = pick(t); return d && d >= w && d < addDays(w, 7); }).length);
  return {
    categories: weeks.map((w) => ({ key: w, label: shortDay(w), color: 'dark_orange' })),
    series: [
      { key: 'new', label: 'Added', color: 'dark_orange', values: count((t) => (t.created_at || '').slice(0, 10)) },
      { key: 'done', label: 'Finished', color: 'green', values: count((t) => (t.is_done && t.done_at ? t.done_at.slice(0, 10) : null)) },
    ],
  };
}

/** A ready-made measure: { value, unit, note }. */
function measure(key, items) {
  const today = todayYmd();
  const top = items.filter((t) => !t.parent_id);
  const round = (n) => Math.round(n * 10) / 10;
  const dayOf = (iso) => (iso || '').slice(0, 10);
  const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
  switch (key) {
    case 'on_time': {
      const dated = top.filter((t) => t.is_done && t.done_at && dueOf(t));
      const ok = dated.filter((t) => dayOf(t.done_at) <= dueOf(t)).length;
      return { value: dated.length ? Math.round((ok / dated.length) * 100) : 0, unit: '%', note: dated.length ? `${ok} of ${dated.length} finished by their date` : 'No finished task has a date yet', tone: !dated.length ? null : ok / dated.length >= 0.8 ? 'good' : 'bad' };
    }
    case 'finish_days': {
      const done = top.filter((t) => t.is_done && t.done_at && t.created_at);
      const avg = done.length ? done.reduce((n, t) => n + Math.max(0, daysBetween(dayOf(t.created_at), dayOf(t.done_at))), 0) / done.length : 0;
      return { value: round(avg), unit: 'days', note: done.length ? `Average over ${done.length} finished tasks` : 'Nothing finished yet' };
    }
    case 'late_days': {
      const late = top.filter((t) => !t.is_done && dueOf(t) && dueOf(t) < today);
      const avg = late.length ? late.reduce((n, t) => n + daysBetween(dueOf(t), today), 0) / late.length : 0;
      return { value: round(avg), unit: 'days', note: late.length ? `Average over ${late.length} late tasks` : 'Nothing is late', tone: late.length ? 'bad' : 'good' };
    }
    case 'done_7': {
      const a = addDays(today, -6);
      const b = addDays(today, -13);
      const now = top.filter((t) => t.is_done && t.done_at && dayOf(t.done_at) >= a).length;
      const before = top.filter((t) => t.is_done && t.done_at && dayOf(t.done_at) >= b && dayOf(t.done_at) < a).length;
      return { value: now, unit: '', note: `${before} in the 7 days before`, tone: now >= before ? 'good' : null };
    }
    case 'new_7': {
      const a = addDays(today, -6);
      const added = top.filter((t) => dayOf(t.created_at) >= a).length;
      const done = top.filter((t) => t.is_done && t.done_at && dayOf(t.done_at) >= a).length;
      return { value: added, unit: '', note: `${done} finished in the same days`, tone: added > done ? 'bad' : null };
    }
    case 'steps': {
      const parents = new Set(items.filter((t) => t.parent_id).map((t) => t.parent_id));
      const steps = items.filter((t) => t.parent_id && !parents.has(t.id));
      const done = steps.filter((t) => t.is_done).length;
      return { value: steps.length ? Math.round((done / steps.length) * 100) : 0, unit: '%', note: steps.length ? `${done} of ${steps.length} steps` : 'No task has steps yet' };
    }
    case 'load': {
      const open = top.filter((t) => !t.is_done && t.assignee_id);
      const people = new Set(open.map((t) => t.assignee_id)).size;
      return { value: people ? round(open.length / people) : 0, unit: '', note: people ? `${open.length} open tasks, ${people} ${people === 1 ? 'person' : 'people'}` : 'Nobody has open tasks' };
    }
    default: return { error: 'Unknown measure' };
  }
}

/** What one widget draws. ctx = { board, people, meId }. */
export function computeWidget(w, ctx) {
  const items = ctx.board.items;
  const list = scopeItems(items, w.filter || 'all', ctx.meId);
  const valueCol = w.value ? ctx.board.columns.find((c) => String(c.id) === String(w.value)) : null;
  switch (w.type) {
    case 'number': {
      if (w.metric) return measure(w.metric, items);
      if (w.formula) return evalFormula(w.formula, ctx, list);
      const agg = valueCol ? (w.agg || 'sum') : 'count';
      return { value: Math.round(aggregate(list, agg, valueCol, ctx.board) * 100) / 100, unit: valueCol?.settings?.unit || '' };
    }
    case 'progress': {
      const top = scopeItems(items, w.filter === 'mine' ? 'mine' : 'all', ctx.meId);
      const done = top.filter((t) => t.is_done).length;
      return { done, total: top.length, percent: top.length ? Math.round((done / top.length) * 100) : 0 };
    }
    case 'chart': return w.by === 'flow' ? { ...flow(items), by: 'flow' } : { ...matrix(list, w, ctx), by: w.by || 'status' };
    case 'table': return matrix(list, w, ctx);
    case 'list': {
      const today = todayYmd();
      const rows = list.filter((t) => !t.is_done && (w.filter !== 'overdue' || dueOf(t)) && (w.filter === 'overdue' || w.filter === 'all' || w.filter === 'open' || dueOf(t)))
        .sort((a, b) => String(dueOf(a) || '￿').localeCompare(String(dueOf(b) || '￿'))).slice(0, Math.min(w.limit || 8, 20));
      return { items: rows.map((t) => ({ id: t.id, title: t.title, due: dueOf(t), late: !!(dueOf(t) && dueOf(t) < today), who: t.assignee_name || null })) };
    }
    case 'text': return { text: String(w.text || '') };
    default: return { error: 'Unknown widget' };
  }
}

/** A starting dashboard worked out from the columns the board actually has. */
export function generateWidgets(board) {
  const out = [];
  const add = (w) => out.push({ id: uid(), w: 1, ...w });
  const status = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
  const person = board.columns.find((c) => c.kind === 'person');
  const date = board.columns.find((c) => c.kind === 'date' || c.kind === 'timeline');
  const nums = numericColumns(board).filter((c) => c.kind !== 'rating').slice(0, 2);
  const dropdown = board.columns.find((c) => c.kind === 'dropdown');
  add({ type: 'number', title: 'Open tasks', filter: 'open' });
  if (date) add({ type: 'number', title: 'Overdue', filter: 'overdue' });
  if (date) add({ type: 'number', title: 'Due this week', filter: 'this_week' });
  if (status) add({ type: 'number', title: 'Stuck', filter: 'stuck' });
  add({ type: 'progress', title: 'Done' });
  if (date) add({ type: 'number', title: 'Finished on time', metric: 'on_time' });
  add({ type: 'number', title: 'Days to finish', metric: 'finish_days' });
  add({ type: 'number', title: 'Finished in 7 days', metric: 'done_7' });
  for (const c of nums) add({ type: 'number', title: `Total ${c.title}`, value: String(c.id), agg: 'sum' });
  if (status) add({ type: 'chart', title: 'Tasks by status', chart: 'donut', by: 'status', w: 1 });
  if (person) add({ type: 'chart', title: 'Open work by person', chart: 'stacked_bar', by: 'person', series: status ? 'status' : undefined, filter: 'open', w: 2 });
  add({ type: 'chart', title: 'Added and finished, by week', chart: 'line', by: 'flow', w: 2 });
  if (date) add({ type: 'chart', title: 'When open work is due', chart: 'column', by: 'due_bucket', filter: 'open', w: 1 });
  add({ type: 'chart', title: 'How old the open tasks are', chart: 'column', by: 'age', filter: 'open', w: 1 });
  if (status && person) add({ type: 'table', title: 'Who is doing what', by: 'person', series: 'status', w: 3 });
  if (date) add({ type: 'chart', title: 'Due by month', chart: 'column', by: 'due_month', w: 2 });
  if (dropdown) add({ type: 'chart', title: `By ${dropdown.title}`, chart: 'column', by: `col:${dropdown.id}`, w: 2 });
  if (board.groups.length > 1) add({ type: 'chart', title: 'Tasks by group', chart: 'bar', by: 'group', w: 2 });
  for (const c of nums) add({ type: 'chart', title: `${c.title} by status`, chart: 'column', by: 'status', value: String(c.id), agg: 'sum', w: 2 });
  if (date) add({ type: 'list', title: 'Late', filter: 'overdue', w: 1 });
  return out;
}

/** The Chart tab's starting set: charts only. */
export function generateCharts(board) {
  const out = [];
  const add = (w) => out.push({ id: uid(), type: 'chart', w: 1, ...w });
  const status = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
  const date = board.columns.find((c) => c.kind === 'date' || c.kind === 'timeline');
  if (status) add({ title: 'Tasks by status', chart: 'donut', by: 'status' });
  add({ title: 'Open work by person', chart: 'stacked_bar', by: 'person', series: status ? 'status' : undefined, filter: 'open', w: 2 });
  add({ title: 'Added and finished, by week', chart: 'line', by: 'flow', w: 2 });
  if (date) add({ title: 'When open work is due', chart: 'column', by: 'due_bucket', filter: 'open' });
  if (board.groups.length > 1) add({ title: 'Progress by group', chart: 'pct_stacked_column', by: 'group', series: status ? 'status' : undefined, w: 2 });
  add({ title: 'How old the open tasks are', chart: 'column', by: 'age', filter: 'open' });
  if (date) add({ title: 'On time or late', chart: 'pie', by: 'on_time' });
  add({ title: 'Tasks by priority', chart: 'bar', by: 'priority', filter: 'open' });
  if (date) add({ title: 'Finished each week', chart: 'column', by: 'done_week', filter: 'done', w: 2 });
  return out;
}

/** Everything that can be added with one press, grouped: [{ group, items: [{ title, hint, icon, widget }] }]. */
export function presetsOf(board) {
  const status = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
  const s = status ? 'status' : undefined;
  const n = (title, hint, widget) => ({ title, hint, icon: 'calculator-outline', widget: { type: 'number', title, w: 1, ...widget } });
  const c = (title, hint, icon, widget) => ({ title, hint, icon, widget: { type: 'chart', title, w: 2, ...widget } });
  return [
    { group: 'Numbers', items: [
      n('Open tasks', 'Everything not finished', { filter: 'open' }),
      n('Overdue', 'Past the due date', { filter: 'overdue' }),
      n('Due today', 'Must be done today', { filter: 'due_today' }),
      n('Due this week', 'The next 7 days', { filter: 'this_week' }),
      n('Being worked on', 'Marked as started', { filter: 'working' }),
      n('Stuck', 'Blocked right now', { filter: 'stuck' }),
      n('Nobody on it', 'Open and not given to anyone', { filter: 'unassigned' }),
      n('No date', 'Open without a due date', { filter: 'no_date' }),
      ...METRICS.map(([key, label, hint]) => n(label, hint, { metric: key })),
      { title: 'Share done', hint: 'A bar of finished against all', icon: 'battery-half-outline', widget: { type: 'progress', title: 'Done', w: 1 } },
    ] },
    { group: 'Who and how much', items: [
      c('Open work by person', 'Each person, split by status', 'people-outline', { chart: 'stacked_bar', by: 'person', series: s, filter: 'open' }),
      c('Late work by person', 'Who is carrying overdue tasks', 'alert-circle-outline', { chart: 'bar', by: 'person', filter: 'overdue' }),
      c('Finished by person', 'Who finished what in 7 days', 'checkmark-done-outline', { chart: 'bar', by: 'person', filter: 'done_week' }),
      { title: 'Who is doing what', hint: 'A table of people against status', icon: 'grid-outline', widget: { type: 'table', title: 'Who is doing what', by: 'person', series: s, w: 3 } },
    ] },
    { group: 'Time and planning', items: [
      c('Added and finished, by week', 'Is the board keeping up?', 'pulse-outline', { chart: 'line', by: 'flow' }),
      c('When open work is due', 'Overdue, today, this week, later', 'calendar-outline', { chart: 'column', by: 'due_bucket', filter: 'open', w: 1 }),
      c('How old the open tasks are', 'Tasks that have sat too long', 'hourglass-outline', { chart: 'column', by: 'age', filter: 'open', w: 1 }),
      c('On time or late', 'How finished work compares to its dates', 'timer-outline', { chart: 'pie', by: 'on_time', w: 1 }),
      c('Finished each week', 'Output, week by week', 'trending-up-outline', { chart: 'column', by: 'done_week', filter: 'done' }),
      c('Due by month', 'The load ahead', 'calendar-number-outline', { chart: 'column', by: 'due_month' }),
    ] },
    { group: 'Shape of the work', items: [
      c('Tasks by status', 'Where everything stands', 'pie-chart-outline', { chart: 'donut', by: 'status', w: 1 }),
      c('Progress by group', 'Each group, split by status', 'layers-outline', { chart: 'pct_stacked_column', by: 'group', series: s }),
      c('Tasks by priority', 'How much is urgent', 'flag-outline', { chart: 'bar', by: 'priority', filter: 'open', w: 1 }),
      { title: 'Late tasks', hint: 'A list, oldest first', icon: 'list-outline', widget: { type: 'list', title: 'Late', filter: 'overdue', w: 1 } },
      { title: 'Due this week', hint: 'A list of what is coming', icon: 'list-outline', widget: { type: 'list', title: 'Due this week', filter: 'this_week', w: 1 } },
      { title: 'A note', hint: 'Words between the charts', icon: 'document-text-outline', widget: { type: 'text', title: 'Note', text: '', w: 1 } },
    ] },
  ];
}
export const newId = uid;

/** A widget list made safe to draw: unknown ids drop out, sizes are clamped. */
export function cleanWidgets(raw, board) {
  const colIds = new Set(board.columns.map((c) => String(c.id)));
  const dims = new Set(dimensionsOf(board).map((d) => d[0]));
  return (Array.isArray(raw) ? raw : []).slice(0, 40).map((x) => {
    if (!x || !WIDGET_TYPES.includes(x.type)) return null;
    const w = { id: String(x.id || uid()).slice(0, 20), type: x.type, title: String(x.title || '').slice(0, 80), w: Math.min(3, Math.max(1, Number(x.w) || 1)) };
    if (FILTERS.some((f) => f[0] === x.filter)) w.filter = x.filter;
    if (AGGS.some((a) => a[0] === x.agg)) w.agg = x.agg;
    if (x.type === 'number' && METRICS.some((m) => m[0] === x.metric)) w.metric = x.metric;
    if (x.value && colIds.has(String(x.value))) w.value = String(x.value);
    if (x.by && dims.has(x.by)) w.by = x.by;
    if (x.series && dims.has(x.series)) w.series = x.series;
    if (CHARTS.includes(x.chart)) w.chart = x.chart;
    if (x.formula) w.formula = String(x.formula).slice(0, 200);
    if (x.text) w.text = String(x.text).slice(0, 2000);
    if (Number.isInteger(x.limit)) w.limit = Math.min(20, Math.max(1, x.limit));
    return w;
  }).filter(Boolean);
}

/** The board described for the AI: columns with ids, and what it may build. */
export function boardSchema(board) {
  return {
    columns: board.columns.map((c) => ({ id: String(c.id), title: c.title, kind: c.kind })),
    dimensions: dimensionsOf(board).map(([key, label]) => ({ key, label })),
    numeric_columns: numericColumns(board).map((c) => ({ id: String(c.id), title: c.title })),
    item_count: board.items.filter((t) => !t.parent_id).length,
  };
}
