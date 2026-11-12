import { parseYmd } from './dates';

/** The day's verdict as shown: the animal and the word. */
export const VERDICTS = {
  goat: { emoji: '🐐', word: 'Failed', color: '#ef4444' },
  pottelu: { emoji: '🐏', word: 'Pottelu', color: '#22c55e' },
};

export const emptyReport = () => ({
  items: [], impact: '', productivity: 1, scale: 1,
  time_saved: { minutes_per_person: 0, people: 0, total_hours: 0, note: '' },
  status: 'goat', status_line: 'Failed today — driving execution to hit Pottelu standards tomorrow.',
});

/** '11 Nov 2026' */
export function reportDate(ymd) {
  const d = parseYmd(ymd);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Keeps total hours in step with people x minutes whenever one of them is edited. */
export function withTotals(report) {
  const ts = report.time_saved || {};
  const people = Number(ts.people) || 0;
  const per = Number(ts.minutes_per_person) || 0;
  return { ...report, time_saved: { ...ts, total_hours: people && per ? Math.round((per * people / 60) * 10) / 10 : 0 } };
}

export function timeSavedLine(report) {
  const ts = report.time_saved || {};
  if (!ts.minutes_per_person || !ts.people) return 'Nothing shipped today that saves time yet.';
  const per = ts.minutes_per_person >= 60 ? `${Math.round((ts.minutes_per_person / 60) * 10) / 10} h` : `${ts.minutes_per_person} min`;
  return `~${per} per person per week across ${ts.people} ${ts.people === 1 ? 'person' : 'people'} (~${ts.total_hours} h a week in total)${ts.note ? `. ${ts.note}` : ''}`;
}

/** The closing line, with the ram in front of "Pottelu" like the original format. */
function closing(report) {
  const v = VERDICTS[report.status] || VERDICTS.goat;
  let line = report.status_line || '';
  if (line.includes('Pottelu') && !line.includes('🐏')) line = line.replace('Pottelu', '🐏 Pottelu');
  return `${v.emoji} (${line.replace(/[.\s]+$/, '')})`;
}

/**
 * The message to paste or send (WhatsApp bold = *text*).
 *
 *   📋 *DAILY REPORT* | 11 Nov 2026 🐐 (Failed)
 *   👤 Name
 *   ...
 */
export function reportText(report, { name, date }) {
  const v = VERDICTS[report.status] || VERDICTS.goat;
  const out = [`📋 *DAILY REPORT* | ${reportDate(date)} ${v.emoji} (${v.word})`];
  if (name) out.push(`👤 ${name}`);
  out.push('');
  if (report.items.length) {
    out.push('*📌 What happened*');
    for (const it of report.items) out.push(` * ${it.title ? `*${it.title}:* ` : ''}${it.text}`.trimEnd());
    out.push('');
  }
  if (report.impact) out.push('*🎯 Impact & Delegation*', ` * ${report.impact}`, '');
  out.push('*⏱️ Time saved*', ` * ${timeSavedLine(report)}`, '');
  out.push(
    '*📊 Ratings*',
    ` * ⚙️ Productivity: ${report.productivity}/10`,
    ` * 📈 Scale Contribution: ${report.scale}/10`,
    '',
    `*Status:* ${closing(report)}.`,
  );
  return out.join('\n');
}
