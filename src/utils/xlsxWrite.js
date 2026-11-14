// Writes a one-sheet .xlsx file from rows of cell texts (for sheet notes: typing here, working on in Excel).
// An .xlsx is a zip of small XML files; fflate (already used to read them, utils/sheet.js) makes the zip.
import { zipSync, strToU8 } from 'fflate';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML does not allow would make Excel refuse the file.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** A (0) -> "A", 26 -> "AA". */
export function columnName(index) {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/**
 * A cell is a number only when it reads as one and would survive the trip: phone numbers, codes with leading
 * zeros and very long digits stay text, so Excel does not mangle them.
 */
export function isNumberCell(text) {
  const t = String(text).trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return false;
  const digits = t.replace(/^-/, '');
  if (digits.replace('.', '').length > 15) return false;
  return !(digits.length > 1 && digits[0] === '0' && digits[1] !== '.');
}

/** rows: [[text]] -> the bytes of an .xlsx file (Uint8Array). `widths` are pixels per column, optional. */
export function toXlsx(rows, { widths = [], sheetName = 'Sheet1' } = {}) {
  const body = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const text = value === null || value === undefined ? '' : String(value);
      if (text === '') return '';
      const ref = `${columnName(c)}${r + 1}`;
      return isNumberCell(text)
        ? `<c r="${ref}"><v>${text.trim()}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(6, Math.round((Number(w) || 120) / 7))}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = {
    '[Content_Types].xml': `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31) || 'Sheet1'}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])));
}

/** Save bytes as a file in the browser. */
export function downloadBytes(name, bytes, type) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
