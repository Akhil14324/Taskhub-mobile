// How long a task took and when it was last worked on, in whole calendar days, for the Gantt charts:
// a finished task reads "Done in 3 days", an open one "Last worked 2 days ago".

const DAY = 86400000;
const ms = (v) => {
  if (!v) return NaN;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : NaN;
};
// Whole calendar days between two moments, in the viewer's own time zone.
const midnight = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const calendarDays = (a, b) => Math.max(0, Math.round((midnight(b) - midnight(a)) / DAY));
const plural = (n) => `${n} day${n === 1 ? '' : 's'}`;

/** The latest moment anything happened to the task: an edit, a status change, a finished step. */
export function lastWorkedAt(todo, lastStepAt) {
  const times = [todo.last_worked_at, todo.updated_at, todo.status_since, todo.started_at, lastStepAt, todo.created_at]
    .map(ms).filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

/**
 * { done, days, text, stale } for one task. `lastStepAt` is the newest finished sub-task (utils/progress.js),
 * so ticking a step counts as work. `stale` is an open task untouched for 3 days or more.
 */
export function workDays(todo, { lastStepAt = null, now = Date.now() } = {}) {
  if (todo.is_done) {
    const end = ms(todo.done_at);
    const start = [ms(todo.started_at), ms(todo.created_at)].find((t) => Number.isFinite(t) && (!Number.isFinite(end) || t <= end));
    if (!Number.isFinite(end) || !Number.isFinite(start)) return { done: true, days: null, text: 'Done', stale: false };
    const days = calendarDays(start, end);
    return { done: true, days, text: days === 0 ? 'Done the same day' : `Done in ${plural(days)}`, stale: false };
  }
  const last = lastWorkedAt(todo, lastStepAt);
  if (!Number.isFinite(last)) return { done: false, days: null, text: '', stale: false };
  const days = calendarDays(Math.min(last, now), now);
  return { done: false, days, text: days === 0 ? 'Worked on today' : `Last worked ${plural(days)} ago`, stale: days >= 3 };
}
