// CSV in and out for boards (F-IMP-01, F-EXP-01). Comma or semicolon separated, quotes as Excel writes them.

/** Text of a CSV file -> rows of cells. The separator is guessed from the first line. */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') && !first.includes(',') ? '\t' : ',');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

/** Rows of cells -> CSV text (with a BOM so Excel reads Telugu and the rupee sign). */
export function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(esc).join(',')).join('\r\n')}`;
}

/** Save text as a file in the browser. */
export function downloadText(name, text, type = 'text/csv;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ask for a file and read it as text (web). */
export function pickTextFile(accept = '.csv,text/csv') {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result || '') });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
