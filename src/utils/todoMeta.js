// Helpers shared by the to-do screens: durations, reminders, saved filters, sub-task grouping.
import { addDays, daysFromToday } from './dates';
import { darkestRed } from '../components/kit';

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------
export const DURATION_PRESETS = [15, 30, 60, 120, 240, 480];

/** 90 → "1h 30m", 45 → "45m", 1440 → "1d" */
export function formatDuration(minutes) {
  const m = Number(minutes);
  if (!m || m < 1) return '';
  if (m % 1440 === 0) return `${m / 1440}d`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest}m`;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Reminders (minutes before the due time; the at-time reminder always fires)
// ---------------------------------------------------------------------------
export const REMINDER_CHOICES = [
  { minutes: 10, label: '10 min before' },
  { minutes: 30, label: '30 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
];

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
/** Normalise what a person typed into a label: lower-case, no spaces or symbols. */
export function cleanLabel(value) {
  return String(value || '').toLowerCase().replace(/^[#+@]+/, '').replace(/[^a-z0-9_-]/g, '').slice(0, 30);
}

/** All labels in use with their open counts, most used first. */
export function labelsFrom(todos) {
  const counts = new Map();
  for (const t of todos) {
    for (const l of t.labels || []) {
      if (!counts.has(l)) counts.set(l, 0);
      if (!t.is_done) counts.set(l, counts.get(l) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Sub-tasks (any depth)
// ---------------------------------------------------------------------------
/**
 * Nest to-dos under their parent when both are in `items`, at any depth. A to-do whose parent
 * is not in the list (different day, filtered out, shared on its own, ...) becomes a root row and
 * carries `parent` so it can show where it belongs.
 * → [{ todo, children: [node...], parent }]
 */
export function buildTree(items, allTodos = items) {
  const ids = new Set(items.map((t) => t.id));
  const byParent = new Map();
  for (const t of items) {
    if (t.parent_id && ids.has(t.parent_id)) {
      if (!byParent.has(t.parent_id)) byParent.set(t.parent_id, []);
      byParent.get(t.parent_id).push(t);
    }
  }
  const parents = new Map(allTodos.map((t) => [t.id, t]));
  const node = (t) => ({
    todo: t,
    children: (byParent.get(t.id) || []).map(node),
    parent: t.parent_id ? parents.get(t.parent_id) || null : null,
  });
  return items.filter((t) => !(t.parent_id && ids.has(t.parent_id))).map(node);
}

/** Every to-do below one (children, their children, ...), in tree order. */
export function descendantsOf(id, allTodos) {
  const out = [];
  const walk = (parentId) => {
    for (const t of allTodos) {
      if (t.parent_id === parentId) {
        out.push(t);
        walk(t.id);
      }
    }
  };
  walk(id);
  return out;
}

/** Number of levels between a to-do and the root (a root is 0). */
export function depthOf(todo, byId) {
  let depth = 0;
  let cur = todo;
  while (cur?.parent_id && byId.get(cur.parent_id) && depth < 20) {
    cur = byId.get(cur.parent_id);
    depth += 1;
  }
  return depth;
}

/** Progress over everything below a to-do (falls back to the server's direct counts). */
export function subtaskProgress(todo, allTodos) {
  const below = descendantsOf(todo.id, allTodos);
  if (below.length) return { done: below.filter((c) => c.is_done).length, total: below.length };
  return { done: todo.subtask_done_count || 0, total: todo.subtask_count || 0 };
}

/**
 * Assigned and shared are different things. ASSIGNED: someone is accountable for it and it is not the person
 * who made it. SHARED: several people are on it and nobody was singled out.
 */
export function isAssignedTodo(todo) {
  return !todo?.business_id && !!todo?.assignee_id && todo.assignee_id !== todo.created_by;
}

export function isSharedTodo(todo) {
  return !todo?.business_id && (todo?.members || []).length > 1 && !isAssignedTodo(todo);
}

/** The business a to-do belongs to, or null for a personal one. */
export function isBusinessTodo(todo) {
  return !!todo?.business_id;
}

/** Manually ordered to-dos first (by sort_order), the rest keep their existing order. */
export function manualSort(items) {
  const ordered = items.filter((t) => t.sort_order != null).sort((a, b) => a.sort_order - b.sort_order);
  const rest = items.filter((t) => t.sort_order == null);
  return [...ordered, ...rest];
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export const FILTER_DEFAULT = { due: 'any', priorities: [], labels: [], list_id: null, assigned: 'any' };

export const FILTER_DUE_OPTIONS = [
  { key: 'any', label: 'Any date' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'nodate', label: 'No date' },
];

export const FILTER_ASSIGNED_OPTIONS = [
  { key: 'any', label: 'Anyone' },
  { key: 'mine', label: 'Created by me' },
  { key: 'others', label: 'Assigned to me' },
  { key: 'shared', label: 'Shared' },
];

// Built-in views, shown next to the saved ones.
export const BUILTIN_FILTERS = [
  { id: 'overdue', name: 'Overdue', icon: 'alert-circle', config: { ...FILTER_DEFAULT, due: 'overdue' } },
  { id: 'p1', name: 'Priority 1', icon: 'flag', config: { ...FILTER_DEFAULT, priorities: [1] } },
  { id: 'week', name: 'Next 7 days', icon: 'calendar', config: { ...FILTER_DEFAULT, due: 'week' } },
  { id: 'nodate', name: 'No date', icon: 'remove-circle', config: { ...FILTER_DEFAULT, due: 'nodate' } },
  { id: 'others', name: 'Assigned by others', icon: 'person-circle', config: { ...FILTER_DEFAULT, assigned: 'others' } },
];

/** Open to-dos that match a filter config. */
export function applyFilter(todos, config, { userId, today }) {
  const c = { ...FILTER_DEFAULT, ...(config || {}) };
  const weekEnd = addDays(today, 7);
  return todos.filter((t) => {
    if (t.is_done) return false;
    if (c.due === 'overdue' && !(t.due_date && t.due_date < today)) return false;
    if (c.due === 'today' && t.due_date !== today) return false;
    if (c.due === 'week' && !(t.due_date && t.due_date >= today && t.due_date <= weekEnd)) return false;
    if (c.due === 'nodate' && t.due_date) return false;
    if (c.priorities.length && !c.priorities.includes(t.priority)) return false;
    if (c.labels.length && !c.labels.some((l) => (t.labels || []).includes(l))) return false;
    if (c.list_id === 'inbox' && t.list_id) return false;
    if (typeof c.list_id === 'number' && t.list_id !== c.list_id) return false;
    if (c.assigned === 'mine' && t.created_by !== userId) return false;
    if (c.assigned === 'others' && !(isAssignedTodo(t) && t.assignee_id === userId)) return false;
    if (c.assigned === 'shared' && !isSharedTodo(t)) return false;
    return true;
  });
}

/** One-line description of a filter, for lists. */
export function describeFilter(config, lists = []) {
  const c = { ...FILTER_DEFAULT, ...(config || {}) };
  const parts = [];
  if (c.due !== 'any') parts.push(FILTER_DUE_OPTIONS.find((o) => o.key === c.due)?.label);
  if (c.priorities.length) parts.push(c.priorities.map((p) => `P${p}`).join(' / '));
  if (c.labels.length) parts.push(c.labels.map((l) => `+${l}`).join(' '));
  if (c.list_id === 'inbox') parts.push('Inbox');
  else if (typeof c.list_id === 'number') parts.push(lists.find((l) => l.id === c.list_id)?.name);
  if (c.assigned !== 'any') parts.push(FILTER_ASSIGNED_OPTIONS.find((o) => o.key === c.assigned)?.label);
  return parts.filter(Boolean).join(' · ') || 'Everything open';
}

/**
 * How close a to-do's deadline is. Returns null when there is no deadline to worry about (none set,
 * finished, or more than DEADLINE_SOON_DAYS away); otherwise { level: 'late' | 'today' | 'soon', label, color }.
 * Everything that is near is red; an overdue one is the darkest red.
 */
export const DEADLINE_SOON_DAYS = 2;
export function deadlineState(todo) {
  if (!todo || todo.is_done || !todo.deadline_date) return null;
  const diff = daysFromToday(todo.deadline_date);
  if (diff < 0) return { level: 'late', label: `Deadline passed ${-diff}d ago`, color: darkestRed(), diff };
  if (diff === 0) return { level: 'today', label: 'Deadline today', color: '#dc2626', diff };
  if (diff === 1) return { level: 'soon', label: 'Deadline tomorrow', color: '#dc2626', diff };
  if (diff <= DEADLINE_SOON_DAYS) return { level: 'soon', label: `Deadline in ${diff} days`, color: '#dc2626', diff };
  return null;
}
