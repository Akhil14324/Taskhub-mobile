// How far a task (a "process") has got, counted from its sub-tasks (its "events" or "steps"), and whether it has
// stalled. The backend has the same rules in services/processes.js (unit-tested there): keep the two in step.
//
// - Only the lowest level counts: a sub-task that has its own sub-tasks is not a step, its steps are.
// - A ticked task counts all of its steps as done.
// - Progress is weighted by time: a step with an estimate (duration_minutes) counts for its minutes, a step without
//   one counts for the average of the estimated ones (or 1 when none has an estimate).
// - A task whose sub-tasks are not in the list falls back to the server's counts of its direct sub-tasks.
// - Stalled: open, two or more steps, not all done, no step finished (and the task not made) for 3 days or more,
//   and its date is within a week (or past); with no date, quiet for 6 days or more.

export const STALL_DAYS = 3;
export const SOON_DAYS = 7;
const DAY = 86400000;

/** { total, done, pct, weighted, lastStepAt } for a list of steps ({ is_done, duration_minutes, done_at }). */
export function measure(leaves) {
  const known = leaves.map((l) => Number(l.duration_minutes)).filter((m) => m > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  let all = 0;
  let got = 0;
  let lastStepAt = null;
  for (const l of leaves) {
    const w = Number(l.duration_minutes) > 0 ? Number(l.duration_minutes) : avg;
    all += w;
    if (l.is_done) {
      got += w;
      if (l.done_at && (!lastStepAt || new Date(l.done_at) > new Date(lastStepAt))) lastStepAt = l.done_at;
    }
  }
  return {
    total: leaves.length,
    done: leaves.filter((l) => l.is_done).length,
    pct: all ? Math.round((got / all) * 100) : 0,
    weighted: known.length > 0,
    lastStepAt,
  };
}

/** { idleDays, stalled, daysToDue } for an open process. */
export function stallOf(m, todo, now = new Date()) {
  const since = [m.lastStepAt, todo.created_at].filter(Boolean).map((d) => new Date(d).getTime()).sort((a, b) => b - a)[0] || now.getTime();
  const idleDays = Math.max(0, Math.floor((now.getTime() - since) / DAY));
  const open = !todo.is_done && m.total >= 2 && m.done < m.total;
  if (!open || idleDays < STALL_DAYS) return { idleDays, stalled: false, daysToDue: null };
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const due = todo.due_date ? new Date(`${String(todo.due_date).slice(0, 10)}T00:00:00Z`).getTime() : null;
  const daysToDue = due === null ? null : Math.floor((due - today) / DAY);
  return { idleDays, stalled: daysToDue !== null ? daysToDue <= SOON_DAYS : idleDays >= STALL_DAYS * 2, daysToDue };
}

const cache = new WeakMap(); // the list array -> Map(todoId -> progress), so one list is measured once

/** { done, total, pct, weighted, lastStepAt, idleDays, stalled, daysToDue } for every to-do in the list that has sub-tasks. */
export function progressMapOf(todos) {
  if (!Array.isArray(todos)) return new Map();
  const hit = cache.get(todos);
  if (hit) return hit;
  const byId = new Map(todos.map((t) => [t.id, t]));
  const kids = new Map();
  for (const t of todos) {
    if (t.parent_id && byId.has(t.parent_id)) {
      if (!kids.has(t.parent_id)) kids.set(t.parent_id, []);
      kids.get(t.parent_id).push(t);
    }
  }
  const out = new Map();
  const now = new Date();
  // The steps under a to-do: its lowest-level sub-tasks (all counted done when it is itself done).
  const leavesOf = (t, depth, forceDone) => {
    const below = kids.get(t.id);
    const done = forceDone || !!t.is_done;
    if (!below || depth > 25) return { leaves: [{ is_done: done, duration_minutes: t.duration_minutes, done_at: t.done_at }], counted: null };
    const leaves = [];
    for (const c of below) leaves.push(...leavesOf(c, depth + 1, done).leaves);
    return { leaves, counted: below };
  };
  const walk = (t) => {
    const below = kids.get(t.id);
    if (!below) {
      // No sub-tasks in the list: use the server's counts when it says there are some.
      if ((t.subtask_count || 0) > 0) {
        const total = t.subtask_count;
        const done = t.is_done ? total : Math.min(total, t.subtask_done_count || 0);
        const m = { total, done, pct: Math.round((done / total) * 100), weighted: false, lastStepAt: null };
        out.set(t.id, { ...m, ...stallOf(m, t, now) });
      }
      return;
    }
    const m = measure(leavesOf(t, 0, false).leaves);
    out.set(t.id, { ...m, ...stallOf(m, t, now) });
    for (const c of below) walk(c);
  };
  for (const t of todos) if (!t.parent_id || !byId.has(t.parent_id)) walk(t);
  cache.set(todos, out);
  return out;
}

/** The progress of one to-do, or null when it has no sub-tasks. */
export function progressOf(todo, todos) {
  const hit = progressMapOf(todos).get(todo.id);
  if (hit && hit.total > 0) return hit;
  if ((todo.subtask_count || 0) > 0) {
    const total = todo.subtask_count;
    const done = todo.is_done ? total : Math.min(total, todo.subtask_done_count || 0);
    const m = { total, done, pct: Math.round((done / total) * 100), weighted: false, lastStepAt: null };
    return { ...m, ...stallOf(m, todo) };
  }
  return null;
}
