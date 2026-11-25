// A sheet note can hold several sheets. The server stores one grid of rows per note and drops anything else, so the
// sheets are laid one after another in that grid: each starts with a marker row (an invisible prefix plus its name).
// A note with one sheet called "Sheet1" is saved exactly as before, so older notes open unchanged.
const MARK = '\u200bSHEET';
export const DEFAULT_NAME = 'Sheet1';

let counter = 0;
export const newSheetId = () => { counter += 1; return `s${Date.now().toString(36)}${counter}`; };

const isMark = (row) => Array.isArray(row) && typeof row[0] === 'string' && row[0].startsWith(MARK);

/** Saved rows -> [{ id, name, rows }] (each sheet's rows still carry its own column-name row). */
export function unpackBook(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  if (!isMark(rows[0])) return [{ id: newSheetId(), name: DEFAULT_NAME, rows: rows.map((r) => [...r]) }];
  const sheets = [];
  for (const row of rows) {
    if (isMark(row)) sheets.push({ id: newSheetId(), name: String(row[1] || '').trim() || `Sheet${sheets.length + 1}`, rows: [] });
    else sheets[sheets.length - 1].rows.push([...row]);
  }
  return sheets;
}

/** [{ name, rows }] -> the rows to save. */
export function packBook(sheets) {
  if (sheets.length === 1 && sheets[0].name === DEFAULT_NAME) return sheets[0].rows;
  return sheets.flatMap((s) => [[MARK, s.name], ...s.rows]);
}

/** "Sheet2" style name that no other sheet has. */
export function freshName(sheets) {
  const have = new Set(sheets.map((s) => s.name.toLowerCase()));
  let n = sheets.length + 1;
  while (have.has(`sheet${n}`)) n += 1;
  return `Sheet${n}`;
}

/** A name nobody else has: "Budget" -> "Budget 2". */
export function uniqueName(sheets, wanted, exceptId) {
  const base = String(wanted || '').trim().slice(0, 31) || 'Sheet';
  const have = new Set(sheets.filter((s) => s.id !== exceptId).map((s) => s.name.toLowerCase()));
  let name = base; let k = 2;
  while (have.has(name.toLowerCase())) { name = `${base.slice(0, 28)} ${k}`; k += 1; }
  return name;
}
