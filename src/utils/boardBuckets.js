// Custom board columns ("buckets") for status boards. A bucket has a name and a base status that decides
// what dropping a card in it does (To do / In progress / Done ...). The set, its order and which bucket a card
// sits in are the person's own choice, kept per board on this device (like the layout).
//
// Columns of Inbox and list boards are real sections on the server; see TodosScreen.

/** Statuses a custom bucket can behave like. Blocked / In review cannot be set by dropping a card. */
export const BUCKET_BASES = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

/** What a to-do counts as for the board. */
export const baseOf = (todo) => (todo.is_done ? 'done' : (todo.status || 'todo'));

export function defaultBuckets(statuses, label) {
  return statuses.map((s) => ({ id: s, name: label(s), base: s }));
}

/** Which bucket of `columns` a to-do sits in: the one it was dropped in while it still fits, else the first of its status. */
export function bucketFor(todo, columns, cards) {
  const base = baseOf(todo);
  const dropped = columns.find((c) => c.id === cards?.[todo.id]);
  if (dropped && dropped.base === base) return dropped;
  return columns.find((c) => c.base === base)
    || columns.find((c) => c.base === 'todo')
    || columns[0]
    || null;
}

export function newBucketId() {
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Insert after the column `afterId` (at the end when null / unknown). */
export function insertBucket(columns, bucket, afterId) {
  const at = columns.findIndex((c) => c.id === afterId);
  const next = [...columns];
  next.splice(at < 0 ? next.length : at + 1, 0, bucket);
  return next;
}

export function moveBucket(columns, id, dir) {
  const i = columns.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= columns.length) return columns;
  const next = [...columns];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** A bucket may go unless it is the last one of a base that cards always need a home for. */
export function canRemoveBucket(columns, id) {
  const col = columns.find((c) => c.id === id);
  if (!col) return false;
  if (col.base !== 'todo' && col.base !== 'done') return true;
  return columns.some((c) => c.id !== id && c.base === col.base);
}
