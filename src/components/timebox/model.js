// Timebox planner: the slot maths the screen needs. It mirrors the backend's utils/timebox.js (that one is tested):
// half-hour blocks that never overlap, at most three top priorities.

export const STEP = 30;
export const MAX_PRIORITIES = 3;
export const DAY_START = 7 * 60; // the schedule shows 07:00 to 21:00 unless a block lies outside
export const DAY_END = 21 * 60;
// One colour per top priority (label palette names), so a block shows which priority it serves.
export const PRIORITY_COLORS = ['blue', 'purple', 'dark_orange'];

export const toMin = (hm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const emptyBox = () => ({ priorities: [], brain_dump: [], blocks: [], reflection: '' });

const sorted = (blocks) => [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start));

/** The visible range: the default day, stretched to hold every block. */
export function rangeOf(blocks, { early = false, late = false } = {}) {
  let from = early ? 5 * 60 : DAY_START;
  let to = late ? 24 * 60 - STEP : DAY_END;
  for (const b of blocks) {
    from = Math.min(from, toMin(b.start));
    to = Math.max(to, toMin(b.end));
  }
  return { from, to };
}

/** Is [start, end) free of every block (except the one at index `skip`)? */
export function isFree(blocks, start, end, skip = -1) {
  return blocks.every((b, i) => i === skip || toMin(b.end) <= start || toMin(b.start) >= end);
}

/** Add a block at `start` (30 minutes, or longer when asked and free). Returns the new blocks, or null if taken. */
export function addBlock(blocks, start, fields = {}, minutes = STEP) {
  if (!isFree(blocks, start, start + STEP)) return null;
  let end = start + STEP;
  while (end - start < minutes && end < 24 * 60 && isFree(blocks, end, end + STEP)) end += STEP;
  return sorted([...blocks, { start: toHM(start), end: toHM(end), text: '', todo_id: null, priority: null, done: null, ...fields }]);
}

/** The first free half hour from `from` (now, or the start of the day). */
export function firstFree(blocks, from, until = 24 * 60) {
  const start = Math.ceil(from / STEP) * STEP;
  for (let s = start; s + STEP <= until; s += STEP) if (isFree(blocks, s, s + STEP)) return s;
  return null;
}

/** Make a block longer or shorter by one step, never into its neighbour and never below 30 minutes. */
export function resize(blocks, index, delta) {
  const b = blocks[index];
  const start = toMin(b.start);
  const end = toMin(b.end) + delta * STEP;
  if (end - start < STEP || end > 24 * 60) return blocks;
  if (delta > 0 && !isFree(blocks, toMin(b.end), end, index)) return blocks;
  return blocks.map((x, i) => (i === index ? { ...x, end: toHM(end) } : x));
}

export function summarize(box) {
  const mins = (b) => toMin(b.end) - toMin(b.start);
  const planned = box.blocks.reduce((s, b) => s + mins(b), 0);
  const done = box.blocks.filter((b) => b.done === true).reduce((s, b) => s + mins(b), 0);
  return { planned, done, percent: planned ? Math.round((done / planned) * 100) : null };
}

export const hours = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

/** Minutes since midnight on this device (the company runs in one timezone). */
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const STATUS_LOOK = {
  sent: { label: 'Sent', color: 'green', icon: 'paper-plane' },
  planned: { label: 'Planned, not sent', color: 'orange', icon: 'create-outline' },
  none: { label: 'Not started', color: 'grey', icon: 'ellipse-outline' },
};
