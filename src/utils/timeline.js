// Time tracking for to-dos: statuses, "is it on track" colours and timeline wording.
//
// todoHealth() mirrors vgrand-taskhub-backend/src/utils/timeline.js so rows can recolour live as
// time passes without a request. Keep the two in step (the backend one has the unit tests).

const HOUR = 3600;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Health colours. The UI is red-only EXCEPT here: time status uses green / orange / red so
// "fine / watch it / late" reads at a glance. Do not use these colours for anything else.
// ---------------------------------------------------------------------------
export const HEALTH = {
  green: { label: 'On track', light: '#16a34a', dark: '#4ade80', icon: 'checkmark-circle' },
  orange: { label: 'Watch', light: '#d97706', dark: '#fbbf24', icon: 'alert-circle' },
  red: { label: 'Late', light: '#dc2626', dark: '#f87171', icon: 'flame' },
  none: { label: '', light: '#9ca3af', dark: '#6b7280', icon: 'ellipse-outline' },
};

export function healthColor(level, theme = 'light') {
  const h = HEALTH[level] || HEALTH.none;
  return theme === 'dark' ? h.dark : h.light;
}

/** Soft background tint of a health colour. */
export function healthTint(level, theme = 'light', alpha = 0.14) {
  const hex = healthColor(level, theme).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Statuses & blockers
// ---------------------------------------------------------------------------
export const STATUS = {
  todo: { label: 'To do', icon: 'ellipse-outline' },
  in_progress: { label: 'In progress', icon: 'play-circle' },
  blocked: { label: 'Stuck', icon: 'hand-left' },
  in_review: { label: 'In review', icon: 'eye' },
  on_hold: { label: 'On hold', icon: 'pause-circle' },
  done: { label: 'Done', icon: 'checkmark-circle' },
};

/** Board / grouping order of the statuses. */
export const STATUS_ORDER = ['todo', 'in_progress', 'in_review', 'blocked', 'on_hold', 'done'];

export const BLOCKER_KINDS = {
  // `waiting_on` is the stored value; people see it as "Needs a decision".
  dependency: { label: 'Dependency', short: 'Dependency', icon: 'git-merge-outline', hint: 'Something has to be finished first: another to-do, or a person doing their part.' },
  waiting_on: { label: 'Needs a decision', short: 'Decision', icon: 'ribbon-outline', hint: 'You need an approval, a decision or a suggestion from anyone, senior or not, before you can go on.' },
  issue: { label: 'Issue', short: 'Issue', icon: 'bug-outline', hint: 'Something went wrong while doing this. Tag who or what is involved so they are told.' },
  dead_stop: { label: 'Dead stop', short: 'Dead stop', icon: 'stop-circle-outline', hint: 'Work cannot continue at all because of this. Say what stopped it and tag what it is about.' },
};

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------
/** 3d 4h · 2h 15m · 40m · <1m   (null → –) */
export function formatSeconds(s) {
  if (s === null || s === undefined || Number.isNaN(Number(s))) return '–';
  const v = Math.round(Number(s));
  if (v < 60) return '<1m';
  const d = Math.floor(v / DAY);
  const h = Math.floor((v % DAY) / HOUR);
  const m = Math.floor((v % HOUR) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** 0.8 → "80%"; silly values stay readable (">999%"). */
export function formatRatio(ratio) {
  if (ratio === null || ratio === undefined) return '–';
  const pct = Math.round(Number(ratio) * 100);
  return pct > 999 ? '>999%' : `${pct}%`;
}

/** Short form for tight spaces: 3d · 5h · 40m */
export function formatSecondsShort(s) {
  if (s === null || s === undefined) return '–';
  const v = Math.round(Number(s));
  if (v < 60) return '<1m';
  if (v >= DAY) return `${Math.floor(v / DAY)}d`;
  if (v >= HOUR) return `${Math.floor(v / HOUR)}h`;
  return `${Math.floor(v / 60)}m`;
}

// ---------------------------------------------------------------------------
// Health (mirror of the backend)
// ---------------------------------------------------------------------------
const ms = (v) => (v == null ? null : new Date(v).getTime());
const secs = (a, b) => Math.max(0, Math.round((b - a) / 1000));
const RANK = { none: 0, green: 1, orange: 2, red: 3 };

export function statusSeconds(todo, now = Date.now()) {
  const acc = { todo: 0, in_progress: 0, blocked: 0, in_review: 0, on_hold: 0, ...(todo.status_seconds || {}) };
  for (const k of Object.keys(acc)) acc[k] = Math.round(Number(acc[k]) || 0);
  if (!todo.is_done && acc[todo.status] !== undefined && todo.status_since) acc[todo.status] += secs(ms(todo.status_since), now);
  return acc;
}

/** lead / response / cycle / blocked / active, in seconds. */
export function todoMetrics(todo, now = Date.now()) {
  const end = todo.is_done && todo.done_at ? ms(todo.done_at) : now;
  const created = ms(todo.created_at);
  const assigned = ms(todo.assigned_at) ?? created;
  const started = ms(todo.started_at);
  const st = statusSeconds(todo, now);
  const cycle = secs(started ?? assigned, end);
  return {
    lead_s: secs(created, end),
    response_s: started ? secs(assigned, started) : null,
    cycle_s: cycle,
    blocked_s: st.blocked,
    active_s: Math.max(0, cycle - st.blocked - st.on_hold - st.in_review),
    status_s: st,
    estimate_s: todo.duration_minutes ? todo.duration_minutes * 60 : null,
  };
}

/** → { level: 'none'|'green'|'orange'|'red', reasons: string[] } */
export function todoHealth(todo, now = Date.now()) {
  let level = 'none';
  const reasons = [];
  const mark = (l, reason) => {
    if (RANK[l] > RANK[level]) level = l;
    if (reason) reasons.push(reason);
  };
  const m = todoMetrics(todo, now);

  if (todo.is_done) {
    const doneAt = ms(todo.done_at);
    if (todo.due_at && doneAt) {
      const late = secs(ms(todo.due_at), doneAt);
      if (doneAt <= ms(todo.due_at)) mark('green', 'Finished on time');
      else if (late <= DAY) mark('orange', 'Finished a little late');
      else mark('red', 'Finished late');
    }
    if (m.estimate_s) {
      const ratio = m.active_s / m.estimate_s;
      if (ratio > 1.5) mark('red', 'Took much longer than estimated');
      else if (ratio > 1) mark('orange', 'Took longer than estimated');
      else mark('green', 'Within the estimate');
    }
    return { level, reasons };
  }

  const dueAt = ms(todo.due_at);
  const start = ms(todo.assigned_at) ?? ms(todo.created_at);
  if (dueAt) {
    if (now > dueAt) mark('red', 'Overdue');
    else if (dueAt - now <= 2 * HOUR * 1000) mark('orange', 'Due within 2 hours');
    else if (dueAt - start > 0 && (now - start) / (dueAt - start) >= 0.75) mark('orange', 'Most of the time is used up');
    else mark('green');
  }
  const deadlineAt = ms(todo.deadline_at);
  if (deadlineAt) {
    if (now > deadlineAt) mark('red', 'Deadline passed');
    else if (deadlineAt - now <= DAY * 1000) mark('orange', 'Deadline within a day');
    else mark('green');
  }
  if (todo.status === 'blocked') {
    if (m.status_s.blocked >= DAY) mark('red', 'Blocked for over a day');
    else mark('orange', 'Stuck');
  }
  if (m.estimate_s && todo.started_at) {
    const ratio = m.status_s.in_progress / m.estimate_s;
    if (ratio > 1) mark('red', 'Over the estimate');
    else if (ratio >= 0.8) mark('orange', 'Close to the estimate');
    else mark('green');
  }
  if (!dueAt && !deadlineAt && todo.status === 'todo') {
    const age = secs(ms(todo.assigned_at) ?? ms(todo.created_at), now);
    if (age > 7 * DAY) mark('red', 'Untouched for over a week');
    else if (age > 3 * DAY) mark('orange', 'Untouched for days');
  }
  return { level, reasons };
}

// ---------------------------------------------------------------------------
// Timeline wording
// ---------------------------------------------------------------------------
const WHEN = (v) => (v ? String(v) : 'no date');

/** { icon, title, detail?, tone } for one timeline entry. `who` is the actor's display name. */
export function describeEntry(entry, who = 'Someone') {
  const e = entry;
  switch (e.kind) {
    case 'created': return { icon: 'add-circle', title: `${who} created this`, tone: 'neutral' };
    case 'assigned': return { icon: 'person-add', title: `${who} assigned it to ${e.to_value || 'someone'}`, detail: e.from_value ? `was ${e.from_value}` : null, tone: 'neutral' };
    case 'moved': return { icon: 'briefcase', title: `${who} moved it to a business`, detail: e.note, tone: 'neutral' };
    case 'shared': return { icon: 'people', title: `${who} added ${e.to_value || 'someone'}`, tone: 'neutral' };
    case 'status': return { icon: STATUS[e.to_value]?.icon || 'swap-horizontal', title: `${who} moved it to ${STATUS[e.to_value]?.label || e.to_value}`, detail: e.note || (e.from_value ? `from ${STATUS[e.from_value]?.label || e.from_value}` : null), tone: e.to_value === 'blocked' ? 'bad' : 'neutral' };
    case 'blocker_raised': return { icon: 'hand-left', title: `${who} raised a blocker: ${e.to_value || ''}`.trim(), detail: e.note, tone: 'bad' };
    case 'blocker_cleared': return { icon: 'checkmark-done', title: `${who} cleared a blocker${e.to_value ? `: ${e.to_value}` : ''}`, detail: e.note, tone: 'good' };
    case 'update': return { icon: 'document-text', title: `${who} posted an update`, detail: e.note, progress: e.meta?.progress ?? null, tone: 'neutral' };
    case 'due_changed': return { icon: 'calendar', title: e.from_value ? `${who} moved the due date` : `${who} set a due date`, detail: e.from_value ? `${WHEN(e.from_value)} → ${WHEN(e.to_value)}` : WHEN(e.to_value), tone: e.from_value ? 'warn' : 'neutral' };
    case 'deadline_changed': return { icon: 'alert-circle', title: `${who} changed the deadline`, detail: `${WHEN(e.from_value)} → ${WHEN(e.to_value)}`, tone: 'warn' };
    case 'priority_changed': return { icon: 'flag', title: `${who} changed priority`, detail: `${e.from_value} → ${e.to_value}`, tone: 'neutral' };
    case 'completed': return { icon: 'checkmark-circle', title: `${who} completed it`, detail: e.meta?.recurring ? 'Repeats — next round started' : null, tone: 'good' };
    case 'reopened': return { icon: 'refresh-circle', title: `${who} reopened it`, detail: e.note, tone: 'warn' };
    case 'left': return { icon: 'exit', title: `${who} left this to-do`, tone: 'warn' };
    case 'edited': return { icon: 'create', title: `${who} edited it`, detail: e.note, tone: 'neutral' };
    case 'submitted': return { icon: 'eye', title: `${who} finished it and sent it for review`, tone: 'neutral' };
    case 'approved': return { icon: 'ribbon', title: `${who} approved the work`, detail: e.note, tone: 'good' };
    case 'changes_requested': return { icon: 'arrow-undo', title: `${who} asked for changes`, detail: e.note, tone: 'warn' };
    case 'proposal_accepted': return { icon: 'checkmark-circle', title: `${who} accepted it`, detail: e.note, tone: 'good' };
    case 'proposal_rejected': return { icon: 'close-circle', title: `${who} declined it`, detail: e.note, tone: 'bad' };
    case 'warning': return { icon: 'warning', title: `${who} sent a warning`, detail: e.note, tone: 'bad' };
    case 'delete_requested': return { icon: 'trash-outline', title: `${who} asked to delete it`, detail: e.note, tone: 'warn' };
    case 'delete_rejected': return { icon: 'shield-checkmark', title: `${who} declined the deletion`, detail: e.note, tone: 'neutral' };
    case 'deleted': return { icon: 'trash', title: `${who} deleted it`, tone: 'bad' };
    case 'question': return { icon: 'help-circle', title: `${who} asked`, detail: e.note, tone: 'question' };
    case 'comment': return { icon: 'chatbubble', title: `${who} commented`, detail: e.note, tone: 'neutral' };
    default: return { icon: 'ellipse', title: `${who} · ${e.kind}`, detail: e.note, tone: 'neutral' };
  }
}
