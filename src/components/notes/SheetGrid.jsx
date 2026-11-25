import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { toCsv, downloadText } from '../../utils/csv';
import { toXlsxBook, downloadBytes, columnName, XLSX_TYPE } from '../../utils/xlsxWrite';
import { unpackBook, packBook, freshName, uniqueName, newSheetId } from '../../utils/workbook';
import { confirmDialog } from '../../utils/events';
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
/** What is saved to a file for one sheet: the used part of the grid, formulas worked out, column names on top when set. */
function usedRows(packed) {
  const { headers, rows: src } = unpack(packed);
  const data = src.map((row, r) => row.map((_, c) => displayValue(src, r, c)));
  while (data.length && data[data.length - 1].every((x) => !x)) data.pop();
  const width = Math.max(1, headers.filter(Boolean).length ? headers.length : 1, ...data.map((row) => { let n = row.length; while (n && !row[n - 1]) n -= 1; return n; }));
  const body = data.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''));
  return headers.some((x) => x) ? [Array.from({ length: width }, (_, i) => headers[i] || columnName(i)), ...body] : body;
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
function SheetPane({ initialRows, onChange, onExportXlsx, onExportCsv, onSheetStep }) {
  const colors = useColors();
  const first = useMemo(() => unpack(initialRows), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState(first.rows);
  const [headers, setHeaders] = useState(first.headers);
  const [at, setAt] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({}); // column -> text
  const [showFilters, setShowFilters] = useState(false);
  const [renamingCol, setRenamingCol] = useState(null);
  const table = useRef(null);
  const navRef = useRef(false); // focus arrived by keyboard: the cell is selected, not being edited
  const modeRef = useRef('edit'); // 'select': arrows move between cells; 'edit': arrows move the text cursor
  const [menu, setMenu] = useState(null); // right-click menu: { x, y, items }
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
    if (el) { navRef.current = true; el.focus(); el.select?.(); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  };
  // The last row / column that holds anything, for Ctrl + arrow.
  const edgeOf = (r, c, dr, dc) => {
    const src = rowsRef.current;
    const filled = (rr, cc) => String(src[rr]?.[cc] ?? '') !== '';
    let rr = r + dr; let cc = c + dc;
    const inside = () => rr >= 0 && cc >= 0 && rr < count && cc < cols;
    if (!inside()) return { r, c };
    if (filled(r, c) && filled(rr, cc)) { while (inside() && filled(rr + dr, cc + dc)) { rr += dr; cc += dc; } return { r: rr, c: cc }; }
    while (inside() && !filled(rr, cc)) { rr += dr; cc += dc; }
    if (!inside()) return { r: Math.min(count - 1, Math.max(0, rr - dr)), c: Math.min(cols - 1, Math.max(0, cc - dc)) };
    return { r: rr, c: cc };
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
    const el = e.target;
    const selecting = modeRef.current === 'select' || el.type === 'checkbox';
    const edge = el.selectionStart === undefined || el.selectionStart === null || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
    const start = el.selectionStart === 0 && el.selectionEnd === 0;
    const go = (rr, cc) => { e.preventDefault(); focusCell(Math.max(0, Math.min(count - 1, rr)), Math.max(0, Math.min(cols - 1, cc))); };
    if ((e.ctrlKey || e.metaKey) && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); onSheetStep?.(e.key === 'PageDown' ? 1 : -1); return; }
    if ((e.ctrlKey || e.metaKey) && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const d = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      const t = edgeOf(r, c, d[0], d[1]); go(t.r, t.c); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Home') { go(0, 0); return; }
    if (e.key === 'Enter') { e.preventDefault(); focusCell(nextVisible(r, e.shiftKey ? -1 : 1), c); }
    else if (e.key === 'Tab') { go(r, c + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'F2') { e.preventDefault(); modeRef.current = 'edit'; el.setSelectionRange?.(el.value.length, el.value.length); }
    else if (e.key === 'Escape') { modeRef.current = 'select'; el.select?.(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusCell(nextVisible(r, 1), c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(nextVisible(r, -1), c); }
    else if (e.key === 'ArrowRight' && (selecting || edge)) { if (c < cols - 1) go(r, c + 1); else if (selecting) e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && (selecting || start)) { if (c > 0) go(r, c - 1); else if (selecting) e.preventDefault(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { modeRef.current = 'edit'; } // typing replaces the selected text
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

  // Rows and columns: add in the middle, delete, and move (which swaps places with the neighbour). `p` is the cell
  // they act on: the selected one from the toolbar, the right-clicked one from a menu.
  const addRow = (below, p = at) => {
    const next = copyRows(); const i = p.r + (below ? 1 : 0);
    while (next.length < i) next.push([]);
    next.splice(i, 0, []);
    commit(next.slice(0, MAX_ROWS));
    setAt({ r: i, c: p.c });
  };
  const deleteRow = (p = at) => { if (p.r < rowsRef.current.length) commit(rowsRef.current.filter((_, i) => i !== p.r).map((row) => [...row])); };
  const moveRow = (d, p = at) => {
    const j = p.r + d; if (j < 0 || j >= MAX_ROWS) return;
    const next = copyRows(); while (next.length <= Math.max(p.r, j)) next.push([]);
    [next[p.r], next[j]] = [next[j], next[p.r]];
    commit(next); setAt({ r: j, c: p.c });
    setTimeout(() => focusCell(j, p.c), 0);
  };
  const addCol = (after, p = at) => {
    const i = p.c + (after ? 1 : 0);
    const next = rowsRef.current.map((row) => { const n = [...row]; while (n.length < i) n.push(''); n.splice(i, 0, ''); return n.slice(0, MAX_COLS); });
    const h = [...headRef.current]; while (h.length < i) h.push(''); h.splice(i, 0, '');
    commit(next, h); setAt({ r: p.r, c: i });
  };
  const deleteCol = (p = at) => commit(rowsRef.current.map((row) => row.filter((_, i) => i !== p.c)), headRef.current.filter((_, i) => i !== p.c));
  const moveCol = (d, p = at) => {
    const j = p.c + d; if (j < 0 || j >= MAX_COLS) return;
    const swap = (row) => { const n = [...row]; while (n.length <= Math.max(p.c, j)) n.push(''); [n[p.c], n[j]] = [n[j], n[p.c]]; return n; };
    commit(rowsRef.current.map(swap), swap(headRef.current));
    setAt({ r: p.r, c: j });
    setTimeout(() => focusCell(p.r, j), 0);
  };
  const sortBy = (dir, p = at) => {
    const data = rowsRef.current.map((row) => [...row]);
    while (data.length && data[data.length - 1].every((x) => !x)) data.pop();
    const key = (row) => displayValue([row], 0, p.c);
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
  const tickBox = (p = at) => setCell(p.r, p.c, isTick(rowsRef.current[p.r]?.[p.c]) ? '' : UNCHECKED);
  const clearCell = (p = at) => setCell(p.r, p.c, '');

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
  // Right click on a cell, a column name or a row number: the toolbar's actions for that spot.
  const openMenu = (e, kind, r, c) => {
    e.preventDefault(); e.stopPropagation();
    const p = { r, c };
    setAt(p);
    // A plain click on a column name or row number opens the menu under it; a right click opens it at the pointer.
    const rect = e.type === 'click' ? e.currentTarget?.getBoundingClientRect?.() : null;
    const at0 = rect ? (kind === 'row' ? { x: rect.right, y: rect.top } : { x: rect.left, y: rect.bottom }) : { x: e.clientX, y: e.clientY };
    const rowItems = [
      { label: 'Insert row above', icon: 'arrow-up', run: () => addRow(false, p) },
      { label: 'Insert row below', icon: 'arrow-down', run: () => addRow(true, p) },
      { label: 'Move row up', icon: 'chevron-up', run: () => moveRow(-1, p) },
      { label: 'Move row down', icon: 'chevron-down', run: () => moveRow(1, p) },
      { label: 'Delete row', icon: 'remove-circle-outline', run: () => deleteRow(p), danger: true },
    ];
    const colItems = [
      { label: 'Rename column', icon: 'create-outline', run: () => setRenamingCol(p.c) },
      { label: 'Insert column left', icon: 'arrow-back', run: () => addCol(false, p) },
      { label: 'Insert column right', icon: 'arrow-forward', run: () => addCol(true, p) },
      { label: 'Move column left', icon: 'chevron-back', run: () => moveCol(-1, p) },
      { label: 'Move column right', icon: 'chevron-forward', run: () => moveCol(1, p) },
      { label: 'Delete column', icon: 'remove-circle-outline', run: () => deleteCol(p), danger: true },
    ];
    const dataItems = [
      { label: 'Sort A to Z', icon: 'arrow-up-circle-outline', run: () => sortBy(1, p) },
      { label: 'Sort Z to A', icon: 'arrow-down-circle-outline', run: () => sortBy(-1, p) },
      { label: showFilters ? 'Hide filters' : 'Filter', icon: 'filter-outline', run: () => { setShowFilters((v) => !v); if (showFilters) setFilters({}); } },
    ];
    const cellItems = [
      { label: isTick(rowsRef.current[r]?.[c]) ? 'Remove tick box' : 'Tick box', icon: 'checkbox-outline', run: () => tickBox(p) },
      { label: 'Clear cell', icon: 'close-circle-outline', run: () => clearCell(p) },
    ];
    const items = kind === 'row' ? rowItems
      : kind === 'col' ? [...colItems, 'sep', ...dataItems]
      : [...cellItems, 'sep', ...rowItems, 'sep', ...colItems, 'sep', ...dataItems];
    setMenu({ x: at0.x, y: at0.y, items });
  };
  useEffect(() => {
    if (!menu || typeof window === 'undefined') return undefined;
    const close = (e) => { if (e.type === 'keydown' && e.key !== 'Escape') return; if (e.target?.closest?.('[data-sheet-menu]')) return; setMenu(null); };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close); window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [menu]);
  const distinct = (c) => [...new Set(rows.map((_, r) => displayValue(rows, r, c)).filter(Boolean))].slice(0, 200);

  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
        {tool('arrow-up-circle-outline', 'Sort A-Z', () => sortBy(1))}
        {tool('arrow-down-circle-outline', 'Sort Z-A', () => sortBy(-1))}
        {tool('filter-outline', 'Filter', () => { setShowFilters((v) => !v); if (showFilters) setFilters({}); }, false, showFilters)}
        <Text style={{ fontSize: 12, color: colors.gray[500], marginHorizontal: 6 }}>{columnName(at.c)}{at.r + 1}</Text>
        {tool('download-outline', 'Excel', onExportXlsx, true)}
        {tool('document-outline', 'CSV', onExportCsv)}
      </ScrollView>
      </View>
      <View style={{ flex: 1, borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, overflow: 'hidden' }}>
        {createElement('div', { style: { overflow: 'auto', width: '100%', height: '100%', maxHeight: 'none' } },
          createElement('table', { ref: table, style: { borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: NUM_W + cols * COL_W } },
            createElement('thead', null,
              createElement('tr', null,
                createElement('th', { style: { ...headStyle, width: NUM_W, position: 'sticky', top: 0, left: 0, zIndex: 3 } }, ''),
                Array.from({ length: cols }, (_, c) => createElement('th', {
                  key: c, title: 'Click for column options. Double click to rename.', 'data-colhead': c,
                  onClick: (e) => { if (renamingCol === null) openMenu(e, 'col', at.r, c); },
                  onContextMenu: (e) => openMenu(e, 'col', at.r, c),
                  onDoubleClick: (e) => { e.stopPropagation(); setMenu(null); setRenamingCol(c); },
                  style: { ...headStyle, width: COL_W, position: 'sticky', top: 0, zIndex: 2, padding: 0, cursor: 'pointer', background: c === at.c ? colors.brand[50] : colors.gray[50] },
                },
                  renamingCol === c
                    ? createElement('input', {
                      autoFocus: true, 'aria-label': `Name of column ${columnName(c)}`, defaultValue: headers[c] || '', placeholder: columnName(c),
                      onClick: (e) => e.stopPropagation(),
                      onBlur: (e) => { setHeader(c, e.target.value); setRenamingCol(null); },
                      onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); focusCell(0, c); } else if (e.key === 'Escape') { e.preventDefault(); e.target.value = headers[c] || ''; setRenamingCol(null); } },
                      style: { width: '100%', height: ROW_H - 1, border: `2px solid ${colors.brand[600]}`, background: colors.white, textAlign: 'center', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', color: colors.gray[900], boxSizing: 'border-box', padding: '0 6px', outline: 'none' },
                    })
                    : createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: ROW_H - 1, padding: '0 6px', fontSize: 12.5, fontWeight: 700, color: c === at.c ? colors.brand[700] : colors.gray[700], overflow: 'hidden', whiteSpace: 'nowrap' } },
                      createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, headers[c] || columnName(c)),
                      headers[c] ? createElement('span', { style: { fontWeight: 500, fontSize: 10.5, color: colors.gray[400] } }, columnName(c)) : null,
                      createElement('span', { style: { fontSize: 9, color: colors.gray[400] } }, '\u25BE'))))),
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
                createElement('td', { onContextMenu: (e) => openMenu(e, 'row', r, at.c), onClick: (e) => openMenu(e, 'row', r, at.c), title: 'Click for row options', style: { ...headStyle, width: NUM_W, position: 'sticky', left: 0, zIndex: 1, cursor: 'pointer', color: r === at.r ? colors.brand[700] : colors.gray[600] } }, r + 1),
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
                        onFocus: () => { setAt({ r, c }); navRef.current = false; },
                        onContextMenu: (e) => openMenu(e, 'cell', r, c),
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
                      onFocus: () => { setAt({ r, c }); setEditing({ r, c }); modeRef.current = navRef.current ? 'select' : 'edit'; navRef.current = false; },
                      onDoubleClick: () => { modeRef.current = 'edit'; },
                      onContextMenu: (e) => openMenu(e, 'cell', r, c),
                      onBlur: () => setEditing(null),
                      onKeyDown: (e) => onKeyDown(e, r, c),
                      onPaste: (e) => onPaste(e, r, c),
                      className: 'th-cell',
                      style: { width: '100%', height: ROW_H - 1, border: 'none', background: 'transparent', padding: '0 8px', fontSize: 13.5, fontFamily: 'inherit', color: String(shown).startsWith('#') && isFormula(raw) ? colors.brand[700] : colors.gray[900], boxSizing: 'border-box' },
                    }));
                })))))) }
      </View>
      {menu && createElement('div', {
        'data-sheet-menu': '1', role: 'menu',
        style: { position: 'fixed', left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 230), top: Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - Math.min(menu.items.length * 34 + 12, 520)), width: 220, maxHeight: 520, overflowY: 'auto', zIndex: 3000, background: colors.white, border: `1px solid ${colors.gray[200]}`, borderRadius: 10, padding: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.18)' },
      }, menu.items.map((it, i) => (it === 'sep'
        ? createElement('div', { key: `s${i}`, style: { height: 1, background: colors.gray[200], margin: '4px 2px' } })
        : createElement('button', {
          key: it.label, role: 'menuitem',
          onClick: () => { setMenu(null); it.run(); },
          onMouseEnter: (e) => { e.currentTarget.style.background = it.danger ? colors.red[50] : colors.gray[100]; },
          onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
          style: { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 10px', borderRadius: 6, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', color: it.danger ? colors.red[600] : colors.gray[900] },
        }, it.label))))}
    </View>
  );
}

const TAB_H = 34;

/**
 * A sheet note is a workbook: any number of sheets, switched with the tabs under the grid (click, Ctrl+Page Up /
 * Page Down) and managed with right click (rename, copy, move, delete). Full screen gives the grid the whole window.
 * `onChange(rows)` reports every edit as the rows to save (the sheets laid one after another, see utils/workbook).
 */
export default function SheetGrid({ initialRows, title, onChange, full: fullProp, onFullChange }) {
  const colors = useColors();
  const first = useMemo(() => unpackBook(initialRows), []); // eslint-disable-line react-hooks/exhaustive-deps
  const book = useRef(first);
  const [tabs, setTabs] = useState(() => first.map(({ id, name }) => ({ id, name })));
  const [activeId, setActiveId] = useState(first[0].id);
  const [fullOwn, setFullOwn] = useState(false);
  const full = fullProp ?? fullOwn; // the page can own it, so its Full screen button can sit next to Pin
  const setFull = (v) => { const next = typeof v === 'function' ? v(full) : v; setFullOwn(next); onFullChange?.(next); };
  const [renaming, setRenaming] = useState(null); // { id, text }
  const [tabMenu, setTabMenu] = useState(null); // { x, y, id }

  const sync = () => setTabs(book.current.map(({ id, name }) => ({ id, name })));
  const save = () => onChange?.(packBook(book.current));
  const activeIndex = Math.max(0, book.current.findIndex((x) => x.id === activeId));
  const active = book.current[activeIndex];

  const addSheet = () => {
    const sheet = { id: newSheetId(), name: freshName(book.current), rows: [] };
    book.current = [...book.current, sheet];
    sync(); setActiveId(sheet.id); save();
  };
  const renameSheet = (id, text) => {
    const name = uniqueName(book.current, text, id);
    book.current = book.current.map((x) => (x.id === id ? { ...x, name } : x));
    setRenaming(null); sync(); save();
  };
  const duplicateSheet = (id) => {
    const src = book.current.find((x) => x.id === id); if (!src) return;
    const copy = { id: newSheetId(), name: uniqueName(book.current, `${src.name} copy`), rows: src.rows.map((r) => [...r]) };
    const i = book.current.indexOf(src);
    book.current = [...book.current.slice(0, i + 1), copy, ...book.current.slice(i + 1)];
    sync(); setActiveId(copy.id); save();
  };
  const moveSheet = (id, d) => {
    const i = book.current.findIndex((x) => x.id === id); const j = i + d;
    if (i < 0 || j < 0 || j >= book.current.length) return;
    const next = [...book.current]; [next[i], next[j]] = [next[j], next[i]];
    book.current = next; sync(); save();
  };
  const deleteSheet = async (id) => {
    if (book.current.length === 1) { showToast({ message: 'A sheet note needs at least one sheet', icon: 'information-circle' }); return; }
    const sheet = book.current.find((x) => x.id === id);
    if (sheet.rows.some((r) => r.some((c) => c))) {
      const ok = await confirmDialog({ title: `Delete "${sheet.name}"?`, message: 'The sheet and everything typed in it is removed.', confirmLabel: 'Delete sheet', destructive: true });
      if (!ok) return;
    }
    const i = book.current.indexOf(sheet);
    book.current = book.current.filter((x) => x.id !== id);
    sync(); if (id === activeId) setActiveId(book.current[Math.min(i, book.current.length - 1)].id); save();
  };
  const step = (d) => {
    const list = book.current; const i = list.findIndex((x) => x.id === activeId);
    const next = list[(i + d + list.length) % list.length]; if (next) setActiveId(next.id);
  };

  const fileName = (title || 'Sheet').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Sheet';
  const exportXlsx = () => {
    const sheets = book.current.map((x) => ({ name: x.name, rows: usedRows(x.rows) }));
    if (sheets.every((x) => !x.rows.length)) { showToast({ message: 'The sheet is empty', icon: 'information-circle' }); return; }
    downloadBytes(`${fileName}.xlsx`, toXlsxBook(sheets), XLSX_TYPE);
  };
  const exportCsv = () => {
    const data = usedRows(active.rows);
    if (!data.length) { showToast({ message: 'The sheet is empty', icon: 'information-circle' }); return; }
    downloadText(`${fileName}${book.current.length > 1 ? ` - ${active.name}` : ''}.csv`, toCsv(data));
  };

  useEffect(() => {
    if (!tabMenu || typeof window === 'undefined') return undefined;
    const close = (e) => { if (e.type === 'keydown' && e.key !== 'Escape') return; if (e.target?.closest?.('[data-sheet-menu]')) return; setTabMenu(null); };
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [tabMenu]);
  // Next / previous sheet from anywhere: Alt + Down / Up (the Google Sheets keys) or Ctrl + Page Down / Up.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      const next = (e.altKey && e.key === 'ArrowDown') || ((e.ctrlKey || e.metaKey) && e.key === 'PageDown');
      const prev = (e.altKey && e.key === 'ArrowUp') || ((e.ctrlKey || e.metaKey) && e.key === 'PageUp');
      if (!next && !prev) return;
      e.preventDefault();
      step(next ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Escape leaves full screen (a cell keeps Escape for itself).
  useEffect(() => {
    if (!full || typeof window === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.target?.closest?.('table, [data-sheet-menu]')) setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  const root = full
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: colors.page, padding: spacing.md, gap: spacing.sm }
    : { flex: 1, gap: spacing.sm };
  const menuFor = tabMenu ? book.current.find((x) => x.id === tabMenu.id) : null;
  const tabItems = menuFor ? [
    { label: 'Rename', run: () => setRenaming({ id: menuFor.id, text: menuFor.name }) },
    { label: 'Duplicate', run: () => duplicateSheet(menuFor.id) },
    { label: 'Move left', run: () => moveSheet(menuFor.id, -1) },
    { label: 'Move right', run: () => moveSheet(menuFor.id, 1) },
    { label: 'Delete', run: () => deleteSheet(menuFor.id), danger: true },
  ] : [];

  return (
    <View style={root}>
      {full && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="grid-outline" size={18} color={colors.gray[600]} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 18, fontWeight: '700', color: colors.gray[900] }}>{title || 'Sheet'}</Text>
          <AnimatedPressable onPress={() => setFull(false)} accessibilityLabel="Exit full screen" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.gray[100] }}>
            <Ionicons name="contract-outline" size={16} color={colors.gray[800]} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[800] }}>Exit full screen</Text>
          </AnimatedPressable>
        </View>
      )}
      <SheetPane
        key={activeId}
        initialRows={active.rows}
        onChange={(rows) => { book.current = book.current.map((x) => (x.id === activeId ? { ...x, rows } : x)); save(); }}
        onExportXlsx={exportXlsx} onExportCsv={exportCsv}
        onSheetStep={step}
      />
      {createElement('div', { role: 'tablist', 'aria-label': 'Sheets', style: { display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', flexShrink: 0, paddingTop: 2 } },
        tabs.map((t) => {
          const on = t.id === activeId;
          if (renaming?.id === t.id) {
            return createElement('input', {
              key: t.id, autoFocus: true, value: renaming.text, 'aria-label': 'Sheet name',
              onChange: (e) => setRenaming({ id: t.id, text: e.target.value }),
              onBlur: () => renameSheet(t.id, renaming.text),
              onKeyDown: (e) => { if (e.key === 'Enter') renameSheet(t.id, renaming.text); else if (e.key === 'Escape') setRenaming(null); },
              style: { height: TAB_H, width: 130, border: `2px solid ${colors.brand[600]}`, borderRadius: 8, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', background: colors.white, color: colors.gray[900], outline: 'none' },
            });
          }
          return createElement('button', {
            key: t.id, role: 'tab', 'aria-selected': on, title: 'Click to open. Double click to rename. Right click for more.',
            onClick: () => setActiveId(t.id),
            onDoubleClick: () => setRenaming({ id: t.id, text: t.name }),
            onContextMenu: (e) => { e.preventDefault(); setActiveId(t.id); setTabMenu({ x: e.clientX, y: e.clientY, id: t.id }); },
            style: { flexShrink: 0, height: TAB_H, padding: '0 14px', borderRadius: 8, border: `1px solid ${on ? colors.brand[600] : colors.gray[200]}`, background: on ? colors.brand[100] : colors.white, color: on ? colors.brand[700] : colors.gray[700], fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, t.name);
        }),
        createElement('button', { key: '+', 'aria-label': 'Add a sheet', title: 'Add a sheet', onClick: addSheet, style: { flexShrink: 0, height: TAB_H, width: TAB_H, borderRadius: 8, border: `1px dashed ${colors.gray[300]}`, background: 'transparent', color: colors.gray[700], fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' } }, '+'))}
      {tabMenu && createElement('div', {
        'data-sheet-menu': '1', role: 'menu',
        style: { position: 'fixed', left: Math.min(tabMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 190), top: Math.max(8, tabMenu.y - 190), width: 170, zIndex: 3000, background: colors.white, border: `1px solid ${colors.gray[200]}`, borderRadius: 10, padding: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.18)' },
      }, tabItems.map((it) => createElement('button', {
        key: it.label, role: 'menuitem',
        onClick: () => { setTabMenu(null); it.run(); },
        onMouseEnter: (e) => { e.currentTarget.style.background = it.danger ? colors.red[50] : colors.gray[100]; },
        onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
        style: { display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 10px', borderRadius: 6, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', color: it.danger ? colors.red[600] : colors.gray[900] },
      }, it.label)))}
    </View>
  );
}
