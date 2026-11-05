// Spreadsheets in: cells copied from Excel / Google Sheets (tab separated on the clipboard), .xlsx files and
// .csv / .tsv files, all read in the browser into rows of text. The server reads each cell for the column it
// lands in (backend utils/sheetImport.js), so this file only has to get the text right: an .xlsx date becomes
// 'YYYY-MM-DD' here because the file stores it as a day number with a date format.
import { unzipSync, strFromU8 } from 'fflate';
import { parseCsv } from './csv';

/** Clipboard text from Excel / Sheets -> rows. Excel quotes a cell that holds a tab, a quote or a new line. */
export function parseClipboard(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!src) return [];
  // One column copied: one task per line (commas in a name stay in the name).
  if (!src.includes('\t')) return src.split('\n').map((l) => [l.trim()]).filter((r) => r[0]);
  return parseCsv(src, '\t');
}

/** Does pasted text look like cells (more than one cell), not a sentence? */
export function looksLikeCells(text) {
  const s = String(text || '').trim();
  return s.includes('\t') || (s.includes('\n') && s.split('\n').filter((l) => l.trim()).length >= 2);
}

// ---- .xlsx -----------------------------------------------------------------------------------------------

const els = (node, name) => (node ? Array.from(node.getElementsByTagNameNS('*', name)) : []);
const xml = (files, path) => {
  const f = files[path];
  return f ? new DOMParser().parseFromString(strFromU8(f), 'application/xml') : null;
};
const colIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref || '')?.[0] || '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const pad = (n) => String(n).padStart(2, '0');

// Built-in number formats that are dates / times (ECMA-376 18.8.30).
const DATE_IDS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58]);
const TIME_IDS = new Set([18, 19, 20, 21, 32, 33, 45, 46, 47, 55, 56]);

/** 'date' | 'time' | 'datetime' | null for a number format. */
function formatKind(id, code) {
  if (DATE_IDS.has(id)) return id === 22 ? 'datetime' : 'date';
  if (TIME_IDS.has(id)) return 'time';
  if (!code) return null;
  const c = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '').toLowerCase();
  if (/general|^[#0.,%\s]*$/.test(c)) return null;
  const date = /[dy]/.test(c) || /(^|[^h:])m{3,}/.test(c);
  const time = /[hs]/.test(c);
  if (date && time) return 'datetime';
  if (date) return 'date';
  if (time) return 'time';
  return null;
}

function serialToText(n, kind, date1904) {
  const ms = Math.round((n + (date1904 ? 1462 : 0)) * 86400000) + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (kind === 'time') return time;
  if (kind === 'datetime') return time === '00:00' ? day : `${day} ${time}`;
  return day;
}

/** A number as Excel shows it in General (no 0.30000000000000004). */
const numText = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return String(Number(n.toPrecision(15)));
};

/** An .xlsx file (ArrayBuffer) -> [{ name, rows }] (hidden sheets left out unless all are hidden). */
export function readXlsx(buffer) {
  const files = unzipSync(new Uint8Array(buffer), { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/i.test(f.name) });
  const wb = xml(files, 'xl/workbook.xml');
  if (!wb) throw new Error('That is not an Excel workbook');
  const date1904 = els(wb, 'workbookPr').some((p) => ['1', 'true'].includes(p.getAttribute('date1904')));

  const rels = new Map(els(xml(files, 'xl/_rels/workbook.xml.rels'), 'Relationship').map((r) => {
    let t = r.getAttribute('Target') || '';
    t = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
    return [r.getAttribute('Id'), t.replace(/\/\.\//g, '/')];
  }));

  const shared = els(xml(files, 'xl/sharedStrings.xml'), 'si').map((si) => {
    // Rich text has several runs; phonetic hints (rPh) are not part of the text.
    const ts = els(si, 't').filter((t) => !(t.parentNode && t.parentNode.localName === 'rPh'));
    return ts.map((t) => t.textContent).join('');
  });

  const styles = xml(files, 'xl/styles.xml');
  const fmtCode = new Map(els(styles, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode')]));
  const cellXfs = els(styles, 'cellXfs')[0];
  const xfKind = cellXfs ? Array.from(cellXfs.childNodes).filter((n) => n.localName === 'xf').map((xf) => {
    const id = Number(xf.getAttribute('numFmtId') || 0);
    return formatKind(id, fmtCode.get(id));
  }) : [];

  const sheets = els(wb, 'sheet').map((s) => ({
    name: s.getAttribute('name') || 'Sheet',
    hidden: !!s.getAttribute('state') && s.getAttribute('state') !== 'visible',
    path: rels.get(s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id')),
  }));

  const out = sheets.map((s) => {
    const doc = xml(files, s.path);
    const rows = [];
    for (const row of els(doc, 'row')) {
      const r = Number(row.getAttribute('r') || rows.length + 1) - 1;
      const cells = [];
      let next = 0;
      for (const c of Array.from(row.childNodes).filter((n) => n.localName === 'c')) {
        const ref = c.getAttribute('r');
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const t = c.getAttribute('t') || 'n';
        const v = els(c, 'v')[0]?.textContent;
        let text = '';
        if (t === 's') text = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') text = els(c, 't').map((x) => x.textContent).join('');
        else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') text = '';
        else if (t === 'str' || t === 'd') text = v ?? '';
        else if (v !== undefined && v !== '') {
          const kind = xfKind[Number(c.getAttribute('s') || 0)];
          text = kind ? serialToText(Number(v), kind, date1904) : numText(v);
        }
        cells[ci] = text;
      }
      for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = '';
      rows[r] = cells;
    }
    const filled = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i] || [];
      if (r.some((x) => String(x).trim() !== '')) filled.push(r);
    }
    return { name: s.name, hidden: s.hidden, rows: trimColumns(filled) };
  }).filter((s) => s.rows.length);
  const visible = out.filter((s) => !s.hidden);
  return visible.length ? visible : out;
}

/** Drop columns that are empty in every row (Excel files often carry a used range wider than the data). */
function trimColumns(rows) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const keep = [];
  for (let c = 0; c < width; c += 1) if (rows.some((r) => String(r[c] ?? '').trim() !== '')) keep.push(c);
  return rows.map((r) => keep.map((c) => (r[c] === undefined ? '' : String(r[c]))));
}

// ---- files -----------------------------------------------------------------------------------------------

export const SHEET_ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

/** A File (from the picker or a drop) -> [{ name, rows }]. Throws with a readable message. */
export async function readSheetFile(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0x50 && head[1] === 0x4b) return readXlsx(buf);
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new Error('This is an old .xls file. Open it in Excel and save it as .xlsx, or copy the cells and paste them here.');
  }
  let text = new TextDecoder('utf-8').decode(buf);
  if ((text.match(/�/g) || []).length > 3) text = new TextDecoder('windows-1252').decode(buf);
  const rows = /\.tsv$/i.test(file.name) || (text.split('\n', 1)[0] || '').includes('\t') ? parseCsv(text, '\t') : parseCsv(text);
  return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: trimColumns(rows) }];
}

/** Ask for a spreadsheet file (web). Resolves to a File or null. */
export function pickSheetFile() {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SHEET_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

// ---- guessing --------------------------------------------------------------------------------------------

const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DATE_RES = [
  /^\d{4}-\d{1,2}-\d{1,2}([ t]\d{1,2}:\d{2}.*)?$/i,
  /^\d{1,2}[/.-]\d{1,2}[/.-](\d{2}|\d{4})( \d{1,2}:\d{2}.*)?$/,
  new RegExp(`^\\d{1,2}(st|nd|rd|th)?[ -]${MONTH}\\.?[ ,-]*(\\d{2}|\\d{4})?$`, 'i'),
  new RegExp(`^${MONTH}\\.? \\d{1,2}(st|nd|rd|th)?,? *(\\d{4})?$`, 'i'),
];
const isDate = (s) => DATE_RES.some((re) => re.test(s));
const isRange = (s) => {
  const p = s.split(/\s+(?:-|–|—|to)\s+|\s*[–—]\s*/i);
  return p.length === 2 && p.every((x) => isDate(x.trim()) || /^\d{1,2}[ -][a-z]{3,}$/i.test(x.trim()));
};
const isNumber = (s) => /^\(?[-+]?\s*(₹|rs\.?|\$|€|£)?\s*[\d,]*\.?\d+\s*(%|k|l|lakhs?|cr|crores?)?\)?$/i.test(s);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s) => /^\+?[\d ()-]{7,20}$/.test(s) && (s.match(/\d/g) || []).length >= 7 && !/^\d{1,6}$/.test(s);
const isLink = (s) => /^(https?:\/\/|www\.)\S+$/i.test(s);
const BOOL = new Set(['yes', 'no', 'y', 'n', 'true', 'false', '✓', '✔', 'x']);
const isTime = (s) => /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i.test(s) || /^\d{1,2}\s*(am|pm)$/i.test(s);

/** A column type for a new board column, from the values in that sheet column. */
export function guessKind(values) {
  const vals = values.map((v) => String(v ?? '').trim()).filter(Boolean).slice(0, 300);
  if (!vals.length) return 'text';
  const all = (fn) => vals.every(fn);
  // Real sheets are messy: a typed column may have a few odd cells ("abc", "TBD"); those are reported, not guessed from.
  const most = (fn) => vals.filter(fn).length >= Math.max(1, Math.ceil(vals.length * 0.8));
  if (most(isEmail)) return 'email';
  if (most(isLink)) return 'link';
  if (all((s) => BOOL.has(s.toLowerCase()))) return 'checkbox';
  if (most(isDate)) return 'date';
  if (most(isRange)) return 'timeline';
  if (most(isTime)) return 'hour';
  if (most(isPhone) && vals.some((s) => (s.match(/\d/g) || []).length >= 10)) return 'phone';
  if (most(isNumber)) return 'numbers';
  if (vals.some((s) => s.length > 120 || s.includes('\n'))) return 'long_text';
  const distinct = new Set(vals.map((s) => s.toLowerCase()));
  if (vals.length >= 4 && distinct.size <= 8 && distinct.size <= vals.length / 2 && all((s) => s.length <= 30)) return 'status';
  if (vals.length >= 6 && distinct.size <= 25 && distinct.size <= vals.length / 3 && all((s) => s.length <= 40)) return 'dropdown';
  return 'text';
}

const WORDS = {
  name: ['name', 'task', 'task name', 'title', 'item', 'item name', 'to-do', 'todo', 'to do', 'subject', 'activity', 'work', 'particulars', 'description of work'],
  group: ['group', 'section', 'phase', 'group name'],
  person: ['owner', 'assignee', 'assigned to', 'assigned', 'person', 'responsible', 'who', 'responsibility', 'in charge', 'incharge', 'done by', 'owner name'],
  status: ['status', 'state', 'stage', 'current status'],
  date: ['due', 'due date', 'date', 'end date', 'target date', 'finish date', 'completion date', 'by when', 'target'],
  deadline: ['deadline'],
  timeline: ['timeline', 'dates', 'schedule', 'period'],
  priority: ['priority', 'importance', 'urgency'],
  labels: ['labels', 'tags', 'label'],
  estimate: ['estimate', 'time needed', 'hours', 'effort'],
};
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[_:*]+/g, ' ').replace(/\s+/g, ' ').replace(/\s*\(.*\)$/, '');

/**
 * Where each sheet column goes, guessed from its header and its values: the task name, the group, a board
 * column of the same title (or a built-in one by meaning), else a new column of a guessed type (people who
 * run the board) or left out.
 */
export function autoMap(headers, body, columns, { canManage }) {
  const used = new Set();
  const out = headers.map(() => ({ to: 'skip' }));
  const take = (i, m) => { out[i] = m; if (m.column_id) used.add(m.column_id); };
  const H = headers.map(norm);
  const sample = (i) => body.map((r) => r[i]);
  const usable = columns.filter((c) => !['files', 'board_relation', 'vote', 'formula', 'mirror', 'button', 'auto_number', 'creation_log', 'last_updated', 'dependency', 'sprint', 'item_type', 'approval', 'time_tracking'].includes(c.kind) && !['item_id', 'created', 'updated', 'points'].includes(c.system_key));

  let nameAt = H.findIndex((h) => WORDS.name.includes(h));
  if (nameAt < 0) nameAt = H.findIndex((h, i) => guessKind(sample(i)) === 'text' || guessKind(sample(i)) === 'long_text');
  if (nameAt < 0) nameAt = 0;
  take(nameAt, { to: 'name' });
  const groupAt = H.findIndex((h, i) => i !== nameAt && WORDS.group.includes(h));
  if (groupAt >= 0) take(groupAt, { to: 'group' });

  H.forEach((h, i) => {
    if (i === nameAt || i === groupAt) return;
    let col = usable.find((c) => !used.has(c.id) && norm(c.title) === h);
    if (!col) {
      const key = Object.keys(WORDS).find((k) => k !== 'name' && k !== 'group' && WORDS[k].includes(h));
      if (key) col = usable.find((c) => !used.has(c.id) && c.system_key === key);
      if (!col && key === 'deadline') col = usable.find((c) => !used.has(c.id) && c.system_key === 'date');
    }
    if (col) { take(i, { to: 'column', column_id: col.id }); return; }
    if (!h && !sample(i).some((v) => String(v ?? '').trim())) return;
    if (canManage) take(i, { to: 'new', title: String(headers[i] || '').trim() || `Column ${i + 1}`, kind: guessKind(sample(i)) });
  });
  return out;
}

/** Is the first row a header? Yes when it names board columns / known words, or is all text over typed values. */
export function looksLikeHeader(rows, columns) {
  if (rows.length < 2) return false;
  const first = rows[0].map(norm);
  const titles = new Set(columns.map((c) => norm(c.title)));
  const known = new Set(Object.values(WORDS).flat());
  if (first.some((h) => h && (titles.has(h) || known.has(h)))) return true;
  const typed = (s) => isNumber(s) || isDate(s) || isEmail(s);
  const rest = rows.slice(1, 20);
  return first.some((h, i) => h && !typed(h) && rest.length && rest.every((r) => !String(r[i] ?? '').trim() || typed(String(r[i]).trim())));
}

/** Rows of text -> clipboard text Excel pastes as cells. */
export function toTsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[\t"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join('\t')).join('\r\n');
}
