import { reportDate, timeSavedLine, VERDICTS } from './dayReport';

// The report as a picture (web canvas, no libraries): a vivid poster with two rating rings, the time saved,
// planned-vs-done bars and the day's lines on cards. The page is measured first, then painted at its exact height.

const W = 1080;
const PAD = 56;
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const ACCENTS = ['#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb7185'];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function gradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
}

/** A ring gauge: value out of 10. */
function ring(ctx, cx, cy, radius, value, colors, label) {
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = gradient(ctx, cx - radius, cy - radius, cx + radius, cy + radius, [[0, colors[0]], [1, colors[1]]]);
  ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0.02, value / 10))); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(String(value), cx, cy + 14);
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('/ 10', cx, cy + 48);
  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(label, cx, cy + radius + 52);
  ctx.textAlign = 'left';
}

function bar(ctx, x, y, w, label, valueText, frac, colors) {
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(valueText, x + w, y);
  ctx.textAlign = 'left';
  rr(ctx, x, y + 14, w, 18, 9); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  const fw = Math.max(18, w * Math.min(1, Math.max(0, frac)));
  rr(ctx, x, y + 14, fw, 18, 9); ctx.fillStyle = gradient(ctx, x, 0, x + w, 0, [[0, colors[0]], [1, colors[1]]]); ctx.fill();
}

/** Paints the poster; returns its height. `stats` = { planned, done, priorities_done, priorities } from the timebox. */
function paint(ctx, report, { name, date, stats }, H) {
  const v = VERDICTS[report.status] || VERDICTS.goat;
  // Background and soft colour glows. The measuring pass (H null) only needs the height, so it skips them;
  // each glow is painted in its own small square, because a full-canvas radial fill is slow on weak devices.
  if (H) {
    ctx.fillStyle = gradient(ctx, 0, 0, W, H, [[0, '#0b1020'], [0.55, '#1b1447'], [1, '#2a0f3d']]);
    ctx.fillRect(0, 0, W, H);
    [[160, 120, 340, 'rgba(56,189,248,0.22)'], [940, 520, 380, 'rgba(244,114,182,0.18)'], [200, H - 260, 360, 'rgba(251,191,36,0.14)']].forEach(([x, y, r, c]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }

  // Header band
  rr(ctx, PAD, PAD, W - PAD * 2, 210, 36);
  ctx.fillStyle = gradient(ctx, PAD, PAD, W - PAD, PAD + 210, [[0, '#7c3aed'], [0.55, '#ec4899'], [1, '#f59e0b']]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText('DAILY REPORT', PAD + 44, PAD + 62);
  ctx.fillStyle = '#fff';
  ctx.font = `800 62px ${FONT}`;
  ctx.fillText(reportDate(date), PAD + 44, PAD + 134);
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  if (name) ctx.fillText(name, PAD + 44, PAD + 180);
  // Verdict pill
  const pillW = 270;
  rr(ctx, W - PAD - 44 - pillW, PAD + 56, pillW, 96, 48);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
  ctx.font = `46px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText(v.emoji, W - PAD - 44 - pillW + 56, PAD + 120);
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(v.word.toUpperCase(), W - PAD - 44 - pillW + 168, PAD + 118);
  ctx.textAlign = 'left';

  let y = PAD + 210 + 56;

  // Ratings: two rings and the time saved
  rr(ctx, PAD, y, W - PAD * 2, 470, 36); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  ring(ctx, PAD + 190, y + 140, 100, report.productivity, ['#22d3ee', '#3b82f6'], 'Productivity');
  ring(ctx, PAD + 190 + 330, y + 140, 100, report.scale, ['#f472b6', '#fb923c'], 'Scale');
  // Time saved block
  const tx = PAD + 190 + 330 + 190;
  const ts = report.time_saved || {};
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = `700 22px ${FONT}`; ctx.fillText('TIME SAVED', tx, y + 80);
  ctx.fillStyle = gradient(ctx, tx, 0, tx + 200, 0, [[0, '#34d399'], [1, '#a3e635']]);
  ctx.font = `800 76px ${FONT}`;
  ctx.fillText(ts.total_hours ? `${ts.total_hours}h` : '0h', tx, y + 168);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `600 24px ${FONT}`;
  ctx.fillText('a week, in total', tx, y + 204);
  if (ts.minutes_per_person && ts.people) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `500 22px ${FONT}`;
    ctx.fillText(`${ts.minutes_per_person} min x ${ts.people} people`, tx, y + 240);
  }
  // Bars from the timebox
  const planned = stats?.planned || 0;
  const done = stats?.done || 0;
  bar(ctx, PAD + 44, y + 400, 430, 'Planned time done', planned ? `${Math.round((done / planned) * 100)}%` : '-', planned ? done / planned : 0, ['#fbbf24', '#f97316']);
  const pTotal = stats?.priorities || 0;
  bar(ctx, PAD + 44 + 470, y + 400, 410, 'Top priorities', `${stats?.priorities_done || 0}/${pTotal}`, pTotal ? (stats.priorities_done || 0) / pTotal : 0, ['#a78bfa', '#ec4899']);
  y += 470 + 40;

  // Cards
  const card = (title, text, accent, icon) => {
    ctx.font = `500 29px ${FONT}`;
    const lines = wrap(ctx, text, W - PAD * 2 - 44 - 40 - 28);
    const h = 30 + (title ? 44 : 0) + lines.length * 42 + 26;
    rr(ctx, PAD, y, W - PAD * 2, h, 28); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    rr(ctx, PAD, y + 18, 10, h - 36, 5); ctx.fillStyle = accent; ctx.fill();
    let ty = y + 30;
    if (title) {
      ctx.fillStyle = accent; ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`${icon ? `${icon}  ` : ''}${title}`, PAD + 44, ty + 24);
      ty += 44;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `500 29px ${FONT}`;
    lines.forEach((l, i) => ctx.fillText(l, PAD + 44, ty + 26 + i * 42));
    y += h + 20;
  };
  report.items.forEach((it, i) => card(it.title, it.text, ACCENTS[i % ACCENTS.length]));
  if (report.impact) card('Impact & Delegation', report.impact, '#fbbf24', '🎯');
  card('Time saved', timeSavedLine(report), '#34d399', '⏱️');

  // Status banner
  y += 10;
  ctx.font = `700 30px ${FONT}`;
  const status = `${v.emoji}  ${report.status_line}`;
  const sLines = wrap(ctx, status, W - PAD * 2 - 80);
  const sh = 40 + sLines.length * 44;
  rr(ctx, PAD, y, W - PAD * 2, sh, 30);
  ctx.fillStyle = report.status === 'pottelu'
    ? gradient(ctx, PAD, y, W - PAD, y + sh, [[0, '#059669'], [1, '#84cc16']])
    : gradient(ctx, PAD, y, W - PAD, y + sh, [[0, '#dc2626'], [1, '#f97316']]);
  ctx.fill();
  ctx.fillStyle = '#fff';
  sLines.forEach((l, i) => ctx.fillText(l, PAD + 40, y + 52 + i * 44));
  y += sh + 36;

  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('VGrand Task Hub', W / 2, y + 10);
  ctx.textAlign = 'left';
  return y + 10 + PAD;
}

/** A canvas holding the finished picture (web only). */
export function renderReportImage(report, opts) {
  const scratch = document.createElement('canvas');
  scratch.width = W; scratch.height = 1; // only measured, never shown
  const height = Math.ceil(paint(scratch.getContext('2d'), report, opts, null));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = height;
  paint(canvas.getContext('2d'), report, opts, height);
  return canvas;
}

export const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
