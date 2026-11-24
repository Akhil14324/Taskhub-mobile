import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { toCsv, downloadText } from '../../utils/csv';
import { toXlsx, downloadBytes, columnName, XLSX_TYPE } from '../../utils/xlsxWrite';
import { showToast } from '../../utils/events';
import { displayValue, isFormula } from '../../utils/sheetFormula';

const MIN_ROWS = 30;
const MIN_COLS = 8;
const MAX_ROWS = 2000;
const MAX_COLS = 52;
const COL_W = 140;
const NUM_W = 44;
const ROW_H = 32;

/** The grid as it is shown: at least 30 x 8, and always a few empty rows and one empty column past the data. */
function shape(rows) {
  const usedCols = Math.max(0, ...rows.map((r) => r.length));
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, usedCols + 1));
  const count = Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows.length + 5));
  return { cols, count };
}

/** Text copied from Excel or Sheets -> rows of cells (tabs between cells, quotes around a cell with a new line). */
export function parseClipboard(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === '\t') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// Column names are kept in the first row of the saved rows, marked by an invisible prefix, so they survive
// without any change to what the server stores.
const HEAD = '​H';
function unpack(raw) {
  const rows = Array.isArray(raw) ? raw.map((r) => [...r]) : [];
  if (rows[0] && typeof rows[0][0] === 'string' && rows[0][0].startsWith(HEAD)) {
    const h = rows.shift();
    h[0] = h[0].slice(HEAD.length);
    return { headers: h, rows };
  }
  return { headers: [], rows };
}
function pack(headers, rows) {
  if (!headers.some((x) => x)) return rows;
  const width = Math.max(headers.length, 1);
  const h = Array.from({ length: width }, (_, i) => headers[i] || '');
  h[0] = HEAD + h[0];
  return [h, ...rows];
}
const CHECKED = '☑';
const UNCHECKED = '☐';
const isTick = (v) => v === CHECKED || v === UNCHECKED;

/**
 * A sheet note: a small Excel. Type in cells (Enter goes down, Tab right, arrows move, cells pasted from Excel land
 * as cells), name the columns (type in the heading), move rows and columns, add them in the middle, sort, filter,
 * tick boxes, and simple formulas (=A1+B1, =SUM(A1:A5), AVERAGE, MIN, MAX, COUNT). Saves as Excel or CSV.
 * `onChange(rows)` reports every edit (rows include the column-name row when there is one).
 */
export default function SheetGrid({ initialRows, title, onChange }) {
  const colors = useColors();
  const first = useMemo(() => unpack(initialRows), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(first.rows);
  const [headers, setHeaders] = useState(first.headers);
  const [at, setAt] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({}); // column -> text
  const [showFilters, setShowFilters] = useState(false);
  const table = useRef(null);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const headRef = useRef(headers); headRef.current = headers;
  const { cols, count } = useMemo(() => shape(rows), [rows]);

  const commit = useCallback((nextRows, nextHeaders) => {
    const h = nextHeaders || headRef.current;
    setRows(nextRows); if (nextHeaders) setHeaders(nextHeaders);
    onChange?.(pack(h, nextRows));
  }, [onChange]);

  const focusCell = (r, c) => {
    const el = table.current?.querySelector(`[data-cell="${r}:${c}"]`);
    if (el) { el.focus(); el.select?.(); }
  };
  const copyRows = () => rowsRef.current.map((row) => [...row]);
  const setCell = (r, c, value) => {
    const next = copyRows();
    while (next.length <= r) next.push([]);
    while (next[r].length <= c) next[r].push('');
    next[r][c] = value;
    commit(next);
  };
  const setHeader = (c, value) => {
    const h = [...headRef.current]; while (h.length <= c) h.push('');
    h[c] = value;
    commit(rowsRef.current, h);
  };

  // Rows that pass the filters (all of them when no filter is set).
  const active = Object.entries(filters).filter(([, v]) => v);
  const visible = useMemo(() => {
    const all = Array.from({ length: count }, (_, i) => i);
    if (!active.length) return all;
    return all.filter((r) => active.every(([c, v]) => String(displayValue(rows, r, Number(c))).toLowerCase().includes(String(v).toLowerCase())));
  }, [rows, count, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextVisible = (r, dir) => { const i = visible.indexOf(r); return visible[Math.min(visible.length - 1, Math.max(0, i + dir))] ?? r; };

  const onKeyDown = (e, r, c) => {
    if (e.key === 'Enter') { e.preventDefault(); focusCell(nextVisible(r, e.shiftKey ? -1 : 1), c); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusCell(nextVisible(r, 1), c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(nextVisible(r, -1), c); }
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length && e.target.selectionEnd === e.target.value.length) { if (c < cols - 1) { e.preventDefault(); focusCell(r, c + 1); } }
    else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0 && e.target.selectionEnd === 0) { if (c > 0) { e.preventDefault(); focusCell(r, c - 1); } }
  };

  const onPaste = (e, r, c) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    e.preventDefault(); e.stopPropagation();
    const block = parseClipboard(text);
    const next = copyRows();
    let cut = false;
    block.forEach((line, i) => {
      const rr = r + i;
      if (rr >= MAX_ROWS) { cut = true; return; }
      while (next.length <= rr) next.push([]);
      line.forEach((value, j) => {
        const cc = c + j;
        if (cc >= MAX_COLS) { cut = true; return; }
        while (next[rr].length <= cc) next[rr].push('');
        next[rr][cc] = value;
      });
    });
    commit(next);
    if (cut) showToast({ message: `A sheet holds up to ${MAX_ROWS} rows and ${MAX_COLS} columns. The rest was left out.`, icon: 'information-circle' });
  };

  // Rows and columns: add in the middle, delete, and move (which swaps places with the neighbour).
  const addRow = (below) => {
    const next = copyRows(); const i = at.r + (below ? 1 : 0);
    while (next.length < i) next.push([]);
    next.splice(i, 0, []);
    commit(next.slice(0, MAX_ROWS));
    setAt({ r: i, c: at.c });
  };
  const deleteRow = () => { if (at.r < rowsRef.current.length) commit(rowsRef.current.filter((_, i) => i !== at.r).map((row) => [...row])); };
  const moveRow = (d) => {
    const j = at.r + d; if (j < 0 || j >= MAX_ROWS) return;
    const next = copyRows(); while (next.length <= Math.max(at.r, j)) next.push([]);
    [next[at.r], next[j]] = [next[j], next[at.r]];
    commit(next); setAt({ r: j, c: at.c });
    setTimeout(() => focusCell(j, at.c), 0);
  };
  const addCol = (after) => {
    const i = at.c + (after ? 1 : 0);
    const next = rowsRef.current.map((row) => { const n = [...row]; while (n.length < i) n.push(''); n.splice(i, 0, ''); return n.slice(0, MAX_COLS); });
    const h = [...headRef.current]; while (h.length < i) h.push(''); h.splice(i, 0, '');
    commit(next, h); setAt({ r: at.r, c: i });
  };
  const deleteCol = () => commit(rowsRef.current.map((row) => row.filter((_, i) => i !== at.c)), headRef.current.filter((_, i) => i !== at.c));
  const moveCol = (d) => {
    const j = at.c + d; if (j < 0 || j >= MAX_COLS) return;
    const swap = (row) => { const n = [...row]; while (n.length <= Math.max(at.c, j)) n.push(''); [n[at.c], n[j]] = [n[j], n[at.c]]; return n; };
    commit(rowsRef.current.map(swap), swap(headRef.current));
    setAt({ r: at.r, c: j });
    setTimeout(() => focusCell(at.r, j), 0);
  };
  const sortBy = (dir) => {
    const data = rowsRef.current.map((row) => [...row]);
    while (data.length && data[data.length - 1].every((x) => !x)) data.pop();
    const key = (row) => displayValue([row], 0, at.c);
    const asNum = (v) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    data.sort((x, y) => {
      const a = key(x); const b = key(y);
      if (a === '' && b === '') return 0;
      if (a === '') return 1;
      if (b === '') return -1;
      const na = asNum(a); const nb = asNum(b);
      const cmp = na !== null && nb !== null ? na - nb : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      return dir * cmp;
    });
    commit(data);
  };
  const tickBox = () => setCell(at.r, at.c, isTick(rowsRef.current[at.r]?.[at.c]) ? '' : UNCHECKED);

  // What is saved to a file: the used part of the grid, formulas worked out, with the column names on top when set.
  const used = () => {
    const src = rowsRef.current;
    const data = src.map((row, r) => row.map((_, c) => displayValue(src, r, c)));
    while (data.length && data[data.length - 1].every((x) => !x)) data.pop();
    const width = Math.max(1, headRef.current.filter(Boolean).length ? headRef.current.length : 1, ...data.map((row) => { let n = row.length; while (n && !row[n - 1]) n -= 1; return n; }));
    const body = data.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''));
    return headRef.current.some((x) => x) ? [Array.from({ length: width }, (_, i) => headRef.current[i] || columnName(i)), ...body] : body;
  };
  const fileName = (title || 'Sheet').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Sheet';
  const exportXlsx = () => {
    const data = used();
    if (!data.length) { showToast({ message: 'The sheet is empty', icon: 'information-circle' }); return; }
    downloadBytes(`${fileName}.xlsx`, toXlsx(data, { sheetName: fileName }), XLSX_TYPE);
  };
  const exportCsv = () => {
    const data = used();
    if (!data.length) { showToast({ message: 'The sheet is empty', icon: 'information-circle' }); return; }
    downloadText(`${fileName}.csv`, toCsv(data));
  };

  useEffect(() => { if (at.r >= count) setAt((a) => ({ ...a, r: count - 1 })); }, [count, at.r]);

  const line = `1px solid ${colors.gray[200]}`;
  const headStyle = { background: colors.gray[50], color: colors.gray[600], fontSize: 12, fontWeight: 600, textAlign: 'center', borderRight: line, borderBottom: line, height: ROW_H, userSelect: 'none' };
  const tool = (icon, label, onPress, strong, on) => (
    <AnimatedPressable key={label} onPress={onPress} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.md, backgroundColor: strong ? colors.brand[600] : on ? colors.brand[100] : colors.gray[100] }}>
      <Ionicons name={icon} size={15} color={strong ? '#fff' : on ? colors.brand[700] : colors.gray[800]} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: strong ? '#fff' : on ? colors.brand[700] : colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );
  const sep = (k) => <View key={k} style={{ width: 1, height: 20, backgroundColor: colors.gray[200], marginHorizontal: 2 }} />;
  const distinct = (c) => [...new Set(rows.map((_, r) => displayValue(rows, r, c)).filter(Boolean))].slice(0, 200);

  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
        {tool('arrow-up', 'Row above', () => addRow(false))}
        {tool('arrow-down', 'Row below', () => addRow(true))}
        {tool('arrow-back', 'Column left', () => addCol(false))}
        {tool('arrow-forward', 'Column right', () => addCol(true))}
        {sep('a')}
        {tool('chevron-up', 'Move row up', () => moveRow(-1))}
        {tool('chevron-down', 'Move row down', () => moveRow(1))}
        {tool('chevron-back', 'Move column left', () => moveCol(-1))}
        {tool('chevron-forward', 'Move column right', () => moveCol(1))}
        {sep('b')}
        {tool('remove-circle-outline', 'Delete row', deleteRow)}
        {tool('remove-circle-outline', 'Delete column', deleteCol)}
        {sep('c')}
        {tool('arrow-up-circle-outline', 'Sort A-Z', () => sortBy(1))}
        {tool('arrow-down-circle-outline', 'Sort Z-A', () => sortBy(-1))}
        {tool('filter-outline', 'Filter', () => { setShowFilters((v) => !v); if (showFilters) setFilters({}); }, false, showFilters)}
        {tool('checkbox-outline', 'Tick box', tickBox)}
        <Text style={{ fontSize: 12, color: colors.gray[500], marginHorizontal: 6 }}>{columnName(at.c)}{at.r + 1}</Text>
        {tool('download-outline', 'Excel', exportXlsx, true)}
        {tool('document-outline', 'CSV', exportCsv)}
      </ScrollView>
      <View style={{ flex: 1, borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, overflow: 'hidden' }}>
        {createElement('div', { style: { overflow: 'auto', width: '100%', height: '100%', maxHeight: '70vh' } },
          createElement('table', { ref: table, style: { borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: NUM_W + cols * COL_W } },
            createElement('thead', null,
              createElement('tr', null,
                createElement('th', { style: { ...headStyle, width: NUM_W, position: 'sticky', top: 0, left: 0, zIndex: 3 } }, ''),
                Array.from({ length: cols }, (_, c) => createElement('th', { key: c, style: { ...headStyle, width: COL_W, position: 'sticky', top: 0, zIndex: 2, padding: 0 } },
                  createElement('input', {
                    'aria-label': `Name of column ${columnName(c)}`,
                    value: headers[c] || '',
                    placeholder: columnName(c),
                    onFocus: () => setAt((a) => ({ ...a, c })),
                    onChange: (e) => setHeader(c, e.target.value),
                    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focusCell(0, c); } },
                    className: 'th-cell',
                    style: { width: '100%', height: ROW_H - 1, border: 'none', background: 'transparent', textAlign: 'center', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', color: c === at.c ? colors.brand[700] : colors.gray[700], boxSizing: 'border-box', padding: '0 6px' },
                  })))),
              showFilters && createElement('tr', { key: 'filters' },
                createElement('th', { style: { ...headStyle, width: NUM_W, position: 'sticky', top: ROW_H, left: 0, zIndex: 3 } }, ''),
                Array.from({ length: cols }, (_, c) => createElement('th', { key: c, style: { ...headStyle, position: 'sticky', top: ROW_H, zIndex: 2, padding: 0 } },
                  createElement('input', {
                    'aria-label': `Filter column ${columnName(c)}`,
                    list: `th-vals-${c}`,
                    value: filters[c] || '',
                    placeholder: 'contains...',
                    onChange: (e) => setFilters((f) => ({ ...f, [c]: e.target.value })),
                    className: 'th-cell',
                    style: { width: '100%', height: ROW_H - 1, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', color: colors.gray[800], boxSizing: 'border-box', padding: '0 8px' },
                  }),
                  createElement('datalist', { id: `th-vals-${c}` }, distinct(c).map((v) => createElement('option', { key: v, value: v }))))))),
            createElement('tbody', null,
              visible.map((r) => createElement('tr', { key: r },
                createElement('td', { style: { ...headStyle, width: NUM_W, position: 'sticky', left: 0, zIndex: 1, color: r === at.r ? colors.brand[700] : colors.gray[600] } }, r + 1),
                Array.from({ length: cols }, (_, c) => {
                  const raw = rows[r]?.[c] ?? '';
                  const focused = editing && editing.r === r && editing.c === c;
                  const shown = focused || !isFormula(raw) ? raw : displayValue(rows, r, c);
                  const cellStyle = { borderRight: line, borderBottom: line, padding: 0, height: ROW_H, background: colors.white };
                  if (isTick(raw)) {
                    return createElement('td', { key: c, style: { ...cellStyle, textAlign: 'center' } },
                      createElement('input', {
                        type: 'checkbox', 'data-cell': `${r}:${c}`, 'aria-label': `${columnName(c)}${r + 1}`, checked: raw === CHECKED,
                        onChange: (e) => setCell(r, c, e.target.checked ? CHECKED : UNCHECKED),
                        onFocus: () => setAt({ r, c }),
                        onKeyDown: (e) => { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setCell(r, c, ''); } else onKeyDown(e, r, c); },
                        style: { width: 18, height: 18, accentColor: colors.brand[600], cursor: 'pointer', verticalAlign: 'middle' },
                      }));
                  }
                  return createElement('td', { key: c, style: cellStyle },
                    createElement('input', {
                      'data-cell': `${r}:${c}`,
                      'aria-label': `${columnName(c)}${r + 1}`,
                      value: shown,
                      onChange: (e) => setCell(r, c, e.target.value),
                      onFocus: () => { setAt({ r, c }); setEditing({ r, c }); },
                      onBlur: () => setEditing(null),
                      onKeyDown: (e) => onKeyDown(e, r, c),
                      onPaste: (e) => onPaste(e, r, c),
                      className: 'th-cell',
                      style: { width: '100%', height: ROW_H - 1, border: 'none', background: 'transparent', padding: '0 8px', fontSize: 13.5, fontFamily: 'inherit', color: String(shown).startsWith('#') && isFormula(raw) ? colors.brand[700] : colors.gray[900], boxSizing: 'border-box' },
                    }));
                })))))) }
      </View>
    </View>
  );
}
