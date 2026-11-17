import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { toCsv, downloadText } from '../../utils/csv';
import { toXlsx, downloadBytes, columnName, XLSX_TYPE } from '../../utils/xlsxWrite';
import { showToast } from '../../utils/events';

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

/**
 * A sheet note: a plain grid for typing, like a small Excel without formulas or filters. Enter goes down, Tab
 * goes right, the arrow keys move between rows, and cells copied from Excel paste in as cells. It can be saved
 * as an Excel file or a CSV. `onChange(rows)` reports every edit.
 */
export default function SheetGrid({ initialRows, title, onChange }) {
  const colors = useColors();
  const [rows, setRows] = useState(() => (Array.isArray(initialRows) ? initialRows.map((r) => [...r]) : []));
  const [at, setAt] = useState({ r: 0, c: 0 });
  const table = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const { cols, count } = useMemo(() => shape(rows), [rows]);

  const commit = useCallback((next) => { setRows(next); onChange?.(next); }, [onChange]);

  const focusCell = (r, c) => {
    const el = table.current?.querySelector(`[data-cell="${r}:${c}"]`);
    if (el) { el.focus(); el.select?.(); }
  };

  const setCell = (r, c, value) => {
    const next = rowsRef.current.map((row) => [...row]);
    while (next.length <= r) next.push([]);
    while (next[r].length <= c) next[r].push('');
    next[r][c] = value;
    commit(next);
  };

  const onKeyDown = (e, r, c) => {
    if (e.key === 'Enter') { e.preventDefault(); focusCell(Math.min(count - 1, r + (e.shiftKey ? -1 : 1)), c); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusCell(Math.min(count - 1, r + 1), c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(Math.max(0, r - 1), c); }
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length && e.target.selectionEnd === e.target.value.length) { if (c < cols - 1) { e.preventDefault(); focusCell(r, c + 1); } }
    else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0 && e.target.selectionEnd === 0) { if (c > 0) { e.preventDefault(); focusCell(r, c - 1); } }
  };

  // Several cells copied from Excel land as several cells, starting at the one that has the caret.
  const onPaste = (e, r, c) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return; // one value: the box takes it as usual
    e.preventDefault();
    e.stopPropagation();
    const block = parseClipboard(text);
    const next = rowsRef.current.map((row) => [...row]);
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

  const insertRow = () => {
    const next = rowsRef.current.map((row) => [...row]);
    while (next.length < at.r) next.push([]);
    next.splice(at.r, 0, []);
    commit(next.slice(0, MAX_ROWS));
  };
  const deleteRow = () => {
    if (at.r >= rowsRef.current.length) return;
    commit(rowsRef.current.filter((_, i) => i !== at.r).map((row) => [...row]));
  };
  const insertCol = () => commit(rowsRef.current.map((row) => { const n = [...row]; while (n.length < at.c) n.push(''); n.splice(at.c, 0, ''); return n.slice(0, MAX_COLS); }));
  const deleteCol = () => commit(rowsRef.current.map((row) => row.filter((_, i) => i !== at.c)));

  // What is saved to a file: the used part of the grid only.
  const used = () => {
    const data = rowsRef.current.map((row) => [...row]);
    while (data.length && data[data.length - 1].every((x) => !x)) data.pop();
    const width = Math.max(1, ...data.map((row) => { let n = row.length; while (n && !row[n - 1]) n -= 1; return n; }));
    return data.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ''));
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

  // Keep the caret's cell in view after rows or columns move under it.
  useEffect(() => { if (at.r >= count) setAt((a) => ({ ...a, r: count - 1 })); }, [count, at.r]);

  const line = `1px solid ${colors.gray[200]}`;
  const headStyle = { background: colors.gray[50], color: colors.gray[600], fontSize: 12, fontWeight: 600, textAlign: 'center', borderRight: line, borderBottom: line, height: ROW_H, userSelect: 'none' };
  const tool = (icon, label, onPress, strong) => (
    <AnimatedPressable key={label} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: strong ? colors.brand[600] : colors.gray[100] }}>
      <Ionicons name={icon} size={15} color={strong ? '#fff' : colors.gray[800]} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: strong ? '#fff' : colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );

  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
        {tool('add', 'Row above', insertRow)}
        {tool('remove', 'Delete row', deleteRow)}
        {tool('add', 'Column before', insertCol)}
        {tool('remove', 'Delete column', deleteCol)}
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
                Array.from({ length: cols }, (_, c) => createElement('th', { key: c, style: { ...headStyle, width: COL_W, position: 'sticky', top: 0, zIndex: 2, color: c === at.c ? colors.brand[700] : colors.gray[600] } }, columnName(c))))),
            createElement('tbody', null,
              Array.from({ length: count }, (_, r) => createElement('tr', { key: r },
                createElement('td', { style: { ...headStyle, width: NUM_W, position: 'sticky', left: 0, zIndex: 1, color: r === at.r ? colors.brand[700] : colors.gray[600] } }, r + 1),
                Array.from({ length: cols }, (_, c) => createElement('td', { key: c, style: { borderRight: line, borderBottom: line, padding: 0, height: ROW_H, background: colors.white } },
                  createElement('input', {
                    'data-cell': `${r}:${c}`,
                    'aria-label': `${columnName(c)}${r + 1}`,
                    value: rows[r]?.[c] ?? '',
                    onChange: (e) => setCell(r, c, e.target.value),
                    onFocus: () => setAt({ r, c }),
                    onKeyDown: (e) => onKeyDown(e, r, c),
                    onPaste: (e) => onPaste(e, r, c),
                    className: 'th-cell',
                    style: { width: '100%', height: ROW_H - 1, border: 'none', background: 'transparent', padding: '0 8px', fontSize: 13.5, fontFamily: 'inherit', color: colors.gray[900], boxSizing: 'border-box' },
                  })))))))) }
      </View>
    </View>
  );
}
