import { daysFromToday } from './dates';

/** Why this one: the strongest reason, in plain words. */
function reason(todo, days, dlDays) {
  if (days !== null && days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
  if (dlDays !== null && dlDays <= 1) return dlDays <= 0 ? 'Its deadline is today' : 'Its deadline is tomorrow';
  if (todo.priority === 1) return 'Highest priority';
  if (todo.priority === 2) return 'High priority';
  if (days === 0) return 'Due today';
  if (todo.duration_minutes && todo.duration_minutes <= 20) return `Quick win, about ${todo.duration_minutes} min`;
  return 'A fair pick from what is open';
}

function weight(todo, days, dlDays) {
  let w = 1;
  if (days !== null && days < 0) w += 3 + Math.min(-days, 7) * 0.5;
  else if (days === 0) w += 2;
  if (dlDays !== null && dlDays <= 2) w += 2;
  if (todo.priority === 1) w += 3;
  else if (todo.priority === 2) w += 1.5;
  if (todo.duration_minutes && todo.duration_minutes <= 20) w += 0.5;
  return w;
}

/**
 * Picks one open to-do for someone who cannot decide. It is random, but weighted: overdue work, close
 * deadlines and high priority are far more likely than a to-do with no date. Work that cannot move
 * (blocked, on hold, waiting for review, an undecided proposal, or sub-tasks of an open parent) is
 * never chosen. `skip` holds ids already offered this round so "another one" does not repeat.
 */
export function pickTask(todos, skip = []) {
  const skipSet = new Set(skip);
  const pool = (todos || []).filter((t) => !t.is_done && !skipSet.has(t.id)
    && !['blocked', 'on_hold', 'in_review'].includes(t.status)
    && (t.review_state || 'accepted') === 'accepted');
  if (!pool.length) return null;
  const scored = pool.map((t) => {
    const days = t.due_date ? daysFromToday(t.due_date) : null;
    const dlDays = t.deadline_date ? daysFromToday(t.deadline_date) : null;
    return { todo: t, w: weight(t, days, dlDays), why: reason(t, days, dlDays) };
  });
  const total = scored.reduce((sum, s) => sum + s.w, 0);
  let roll = Math.random() * total;
  const hit = scored.find((s) => (roll -= s.w) <= 0) || scored[scored.length - 1];
  return { todo: hit.todo, reason: hit.why, remaining: pool.length - 1 };
}
