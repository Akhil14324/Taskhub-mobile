// How far a task (a "process") has got, counted from its sub-tasks (its "events").
//
// Only the lowest level counts: a sub-task that has its own sub-tasks is not an event, its events are. A task
// that is itself ticked counts all of its events as done. A task whose sub-tasks are not in the list (not loaded)
// falls back to the server's counts of its direct sub-tasks. Nothing here changes a task; it only measures.

const cache = new WeakMap(); // the list array -> Map(todoId -> progress), so one list is measured once

/** { done, total, pct } for every to-do in the list that has sub-tasks. */
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
  const seen = new Set();
  const walk = (t, depth) => {
    const below = kids.get(t.id);
    if (!below || depth > 25 || seen.has(t.id)) {
      // An event, or a task whose sub-tasks are not loaded (use the server's counts when it has any).
      if (!below && (t.subtask_count || 0) > 0) {
        const total = t.subtask_count;
        const done = t.is_done ? total : Math.min(total, t.subtask_done_count || 0);
        out.set(t.id, { done, total, pct: Math.round((done / total) * 100) });
        return out.get(t.id);
      }
      return { done: t.is_done ? 1 : 0, total: 1, pct: t.is_done ? 100 : 0 };
    }
    seen.add(t.id);
    let done = 0;
    let total = 0;
    for (const c of below) {
      const r = walk(c, depth + 1);
      done += r.done;
      total += r.total;
    }
    if (t.is_done) done = total;
    const res = { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    out.set(t.id, res);
    return res;
  };
  for (const t of todos) if (!t.parent_id || !byId.has(t.parent_id)) walk(t, 0);
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
    return { done, total, pct: Math.round((done / total) * 100) };
  }
  return null;
}
