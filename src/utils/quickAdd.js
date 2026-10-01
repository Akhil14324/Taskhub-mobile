// Natural-language quick add, Todoist style:
//   "Send GST invoice to @akhil tomorrow 5pm p1 #Accounts every week"
// → title "Send GST invoice to @akhil", due tomorrow 17:00, priority 1, list "Accounts",
//   recurrence weekly, mentions ['akhil'].
import { toYmd, todayYmd, addDays } from './dates';

const WEEKDAY_INDEX = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_INDEX = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function nextWeekday(target, { skipToday = true } = {}) {
  const d = new Date();
  const diff = (target - d.getDay() + 7) % 7 || (skipToday ? 7 : 0);
  d.setDate(d.getDate() + diff);
  return toYmd(d);
}

function monthDay(month, day) {
  const now = new Date();
  let d = new Date(now.getFullYear(), month, day);
  if (d.getMonth() !== month) return null;
  if (toYmd(d) < todayYmd()) d = new Date(now.getFullYear() + 1, month, day);
  return toYmd(d);
}

// Each rule: [regex, handler(match, result)] — matched text is removed from the title.
const RULES = [
  // Recurrence (also sets a first due date). Only "every …" forms, so titles like
  // "monthly report" keep their words.
  [/\bevery ?day\b/i, (m, r) => { r.recurrence = 'daily'; }],
  [/\bevery ?weekday\b/i, (m, r) => { r.recurrence = 'weekdays'; }],
  [/\bevery ?week\b/i, (m, r) => { r.recurrence = 'weekly'; }],
  [/\bevery ?month\b/i, (m, r) => { r.recurrence = 'monthly'; }],
  [/\bevery (sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day|nesday|sday|urday|rsday)?\b/i, (m, r) => {
    r.recurrence = 'weekly';
    r.due_date = nextWeekday(WEEKDAY_INDEX[m[1].toLowerCase()], { skipToday: false });
  }],

  // Dates
  [/\bday after tomorrow\b/i, (m, r) => { r.due_date = addDays(todayYmd(), 2); }],
  [/\btoday\b/i, (m, r) => { r.due_date = todayYmd(); }],
  [/\b(tomorrow|tmrw|tmr)\b/i, (m, r) => { r.due_date = addDays(todayYmd(), 1); }],
  [/\bnext week\b/i, (m, r) => { r.due_date = nextWeekday(1); }],
  [/\b(this )?weekend\b/i, (m, r) => { r.due_date = nextWeekday(6, { skipToday: false }); }],
  [/\bin (\d{1,3}) (day|days|week|weeks)\b/i, (m, r) => {
    const n = Number(m[1]) * (m[2].toLowerCase().startsWith('week') ? 7 : 1);
    r.due_date = addDays(todayYmd(), n);
  }],
  [/\b(?:next |on )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day|nesday|sday|urday|rsday)?\b/i, (m, r) => {
    r.due_date = nextWeekday(WEEKDAY_INDEX[m[1].toLowerCase()], { skipToday: /^next/i.test(m[0]) });
  }],
  [/\b(\d{1,2})(?:st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i, (m, r) => {
    r.due_date = monthDay(MONTH_INDEX[m[2].toLowerCase()], Number(m[1])) || r.due_date;
  }],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/i, (m, r) => {
    r.due_date = monthDay(MONTH_INDEX[m[1].toLowerCase()], Number(m[2])) || r.due_date;
  }],
  [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m, r) => {
    // dd/mm[/yyyy] — Indian date order
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (m[3]) {
      const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      const d = new Date(year, month, day);
      if (d.getMonth() === month) r.due_date = toYmd(d);
    } else {
      r.due_date = monthDay(month, day) || r.due_date;
    }
  }],

  // Times: "at 5", "5pm", "5:30 pm", "17:30", "noon"
  [/\b(?:at )?(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/i, (m, r) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    r.due_time = `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
  }],
  [/\b(?:at )?([01]?\d|2[0-3]):([0-5]\d)\b/, (m, r) => {
    r.due_time = `${m[1].padStart(2, '0')}:${m[2]}`;
  }],
  [/\bat noon\b|\bnoon\b/i, (m, r) => { r.due_time = '12:00'; }],

  // Priority: p1..p4, !!1, or !!!
  [/(^|\s)p([1-4])\b/i, (m, r) => { r.priority = Number(m[2]); }],
  [/(^|\s)!!!(?=\s|$)/, (m, r) => { r.priority = 1; }],
];

/**
 * Parse quick-add text. `lists` = [{ id, name }] to resolve #List.
 * Returns { title, due_date, due_time, priority, recurrence, list, mentions, tokens }.
 * `tokens` describes what was recognised, for the chips under the input.
 */
export function parseQuickAdd(input, lists = []) {
  const result = {
    due_date: null, due_time: null, priority: null, recurrence: null, list: null, mentions: [], tokens: [],
    deadline_date: null, duration_minutes: null, labels: [],
  };
  let text = ` ${input || ''} `;

  // {deadline}: a hard deadline, separate from the due date — "Send report {15 oct}"
  const deadlineMatch = text.match(/\{([^}]{1,40})\}/);
  if (deadlineMatch) {
    const inner = parseQuickAdd(deadlineMatch[1]);
    if (inner.due_date) {
      result.deadline_date = inner.due_date;
      text = text.replace(deadlineMatch[0], ' ');
    }
  }

  // "for 2h" / "for 30 min": a time estimate
  const durationMatch = text.match(/\bfor (\d{1,3}(?:\.\d)?) ?(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const minutes = Math.round(/^h/i.test(durationMatch[2]) ? amount * 60 : amount);
    if (minutes >= 1 && minutes <= 14400) {
      result.duration_minutes = minutes;
      text = text.replace(durationMatch[0], ' ');
    }
  }

  // +label (the @ sign is taken by people)
  for (const m of text.matchAll(/(^|\s)\+([A-Za-z0-9_-]{1,30})(?=\s|$)/g)) {
    const label = m[2].toLowerCase();
    if (!result.labels.includes(label)) result.labels.push(label);
  }
  text = text.replace(/(^|\s)\+[A-Za-z0-9_-]{1,30}(?=\s|$)/g, ' ');

  // #List (longest matching list name wins so "#Home Office" works)
  const hashIndex = text.indexOf('#');
  if (hashIndex !== -1) {
    const after = text.slice(hashIndex + 1).toLowerCase();
    const match = [...lists]
      .sort((a, b) => b.name.length - a.name.length)
      .find((l) => after.startsWith(l.name.toLowerCase()));
    if (match) {
      result.list = match;
      text = text.slice(0, hashIndex) + text.slice(hashIndex + 1 + match.name.length);
      result.tokens.push({ kind: 'list', label: match.name });
    }
  }

  for (const [regex, apply] of RULES) {
    const m = text.match(regex);
    if (!m) continue;
    const before = { ...result };
    apply(m, result);
    const changed = ['due_date', 'due_time', 'priority', 'recurrence'].some((k) => result[k] !== before[k]);
    if (changed) text = text.replace(m[0], ' ');
  }

  if (result.recurrence && !result.due_date) result.due_date = todayYmd();

  // @mentions stay in the title (they read naturally) but are collected.
  for (const m of text.matchAll(/(^|\s)@([A-Za-z0-9._-]{2,30})/g)) {
    result.mentions.push(m[2].replace(/[.-]+$/, ''));
  }

  result.title = text
    .replace(/\s+/g, ' ')
    .trim()
    // "Pay rent on 5 Oct" → "Pay rent", not "Pay rent on"
    .replace(/\s+(on|by|at|due|before|from|for)$/i, '')
    .trim();
  if (result.due_date) result.tokens.push({ kind: 'date', value: result.due_date });
  if (result.due_time) result.tokens.push({ kind: 'time', value: result.due_time });
  if (result.priority) result.tokens.push({ kind: 'priority', value: result.priority });
  if (result.recurrence) result.tokens.push({ kind: 'recurrence', value: result.recurrence });
  if (result.deadline_date) result.tokens.push({ kind: 'deadline', value: result.deadline_date });
  if (result.duration_minutes) result.tokens.push({ kind: 'duration', value: result.duration_minutes });
  result.labels.forEach((label) => result.tokens.push({ kind: 'label', value: label }));
  return result;
}

/** The +label being typed at the end of the text, if any (for autocomplete). */
export function activeLabelQuery(text) {
  const m = String(text || '').match(/(^|\s)\+([A-Za-z0-9_-]{0,30})$/);
  return m ? m[2].toLowerCase() : null;
}

/** Replace the +label being typed with the chosen label. */
export function completeLabel(text, label) {
  return String(text || '').replace(/(^|\s)\+([A-Za-z0-9_-]{0,30})$/, `$1+${label} `);
}

/** Remove a +label token from the text. */
export function removeLabelToken(text, label) {
  return String(text || '').replace(new RegExp(`(^|\\s)\\+${label}(?=\\s|$)`, 'i'), '$1').replace(/\s{2,}/g, ' ');
}

/** The @query being typed at the end of the text, if any (for autocomplete). */
export function activeMentionQuery(text) {
  const m = String(text || '').match(/(^|\s)@([A-Za-z0-9._-]{0,30})$/);
  return m ? m[2] : null;
}

/** Replace the @query being typed with the chosen username. */
export function completeMention(text, username) {
  return String(text || '').replace(/(^|\s)@([A-Za-z0-9._-]{0,30})$/, `$1@${username} `);
}
