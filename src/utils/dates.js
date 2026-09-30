// Calendar-date helpers. Dates travel as 'YYYY-MM-DD' strings and are always read as
// local calendar days (never through UTC), so nothing shifts by a day.

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmd(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function todayYmd() {
  return toYmd(new Date());
}

export function addDays(ymd, days) {
  const d = parseYmd(ymd) || new Date();
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** Whole days from today to the date (negative = past). */
export function daysFromToday(ymd) {
  const d = parseYmd(ymd);
  if (!d) return null;
  const today = parseYmd(todayYmd());
  return Math.round((d - today) / DAY_MS);
}

export function isOverdue(ymd) {
  const diff = daysFromToday(ymd);
  return diff !== null && diff < 0;
}

/** "Today", "Tomorrow", "Yesterday", "Friday", "3 Oct", "3 Oct 2027" */
export function formatDue(ymd) {
  const d = parseYmd(ymd);
  if (!d) return '';
  const diff = daysFromToday(ymd);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** "Tomorrow · Thu 2 Oct" style header for day groups. */
export function formatDayHeader(ymd) {
  const d = parseYmd(ymd);
  if (!d) return '';
  const base = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const diff = daysFromToday(ymd);
  if (diff === 0) return `Today · ${base}`;
  if (diff === 1) return `Tomorrow · ${base}`;
  return base;
}

/** '17:30' → '5:30 PM' */
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
}

export function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(value);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const RECURRENCE_LABELS = {
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
};
