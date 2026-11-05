import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { CellView } from './Cells';
import {
  groupBlocks, statusBreakdown, numberSummary, formatNumber, paletteHex, canEditColumn, IN_CELL_KINDS, dateRange, itemWordOf,
} from './model';
import { mayEdit } from './CellEditorHost';
import Hint from './Hint';
import ProgressDot from '../ProgressDot';
import { progressMapOf } from '../../utils/progress';
import { anchorOf } from './Popover';
import { formatDue } from '../../utils/dates';
import { glass } from '../../theme/glass';
import { confirmDialog } from '../../utils/events';

export { anchorOf };

const NAME_W = 340; // default width of the name column (people can drag it)
const MIN_COL = 60;
const MAX_COL = 600;
const UPD_W = 46; // the "updates" column next to the name: opens the task window
const ADD_W = 44;
const ROW_H = 38;
// Heights the "..." menu can change (Item height, Header height) and how many columns stay put when scrolling sideways.
const Metrics = createContext({ rowH: ROW_H, headH: 34, pinned: 0 });
const ITEM_HEIGHTS = { compact: 30, normal: 38, tall: 56 };
const HEADER_HEIGHTS = { single: 34, double: 54, triple: 74 };
const PAGE = 100; // rows drawn per group before "Show more"
// The group box clips with overflow 'clip', not 'hidden': a hidden box would become the scroll container and the pinned columns could not stick.
// "entry" -> "entries", "task" -> "tasks"
const plural = (w) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);

// Text, long text and numbers are typed straight into the cell, like a spreadsheet.
const INLINE_KINDS = new Set(['text', 'long_text', 'numbers']);

const Cell = memo(function Cell({ item, column, values, people, focused, onOpen, onToggle, width, sticky }) {
  const colors = useColors();
  const { rowH } = useContext(Metrics);
  const editable = canEditColumn(column) && mayEdit(item, column);
  const isStatus = column.kind === 'status';
  const inline = !column.system_key && INLINE_KINDS.has(column.kind) && editable;
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const stored = values?.[item.id]?.[column.id];
  const begin = () => { setDraft(stored === null || stored === undefined ? '' : String(stored)); setTyping(true); };
  const commit = () => {
    setTyping(false);
    const next = column.kind === 'numbers' ? (draft.trim() === '' ? null : Number(draft)) : draft;
    if (column.kind === 'numbers' && next !== null && !Number.isFinite(next)) return;
    if ((next ?? '') !== (stored ?? '')) onToggle(item, column, next === '' ? null : next);
  };
  if (inline && typing) {
    return (
      <View style={[{ width, height: rowH, borderRightWidth: 1, borderColor: colors.gray[200], justifyContent: 'center' }, sticky]}>
        <TextInput
          autoFocus value={draft} onChangeText={setDraft} onBlur={commit}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') { setTyping(false); } }}
          onSubmitEditing={commit} blurOnSubmit
          keyboardType={column.kind === 'numbers' ? 'numeric' : 'default'}
          style={{ height: rowH - 2, marginHorizontal: 1, paddingHorizontal: spacing.sm, fontSize: 14, color: colors.gray[900], backgroundColor: colors.white, borderWidth: 2, borderColor: BRAND, borderRadius: 2, outlineStyle: 'none' }}
        />
      </View>
    );
  }
  return (
    <Pressable
      onPress={(e) => { if (!editable) return; if (inline) begin(); else onOpen(e, item, column); }}
      accessibilityLabel={`${column.title}: ${item.title}`}
      style={({ hovered }) => ({
        width, height: rowH, borderRightWidth: 1, borderColor: colors.gray[200], justifyContent: 'center',
        alignItems: column.kind === 'numbers' ? 'flex-end' : isStatus ? 'stretch' : 'center',
        paddingHorizontal: isStatus ? 0 : spacing.sm,
        backgroundColor: hovered && editable && !isStatus ? colors.gray[100] : sticky ? colors.white : 'transparent',
        outlineStyle: focused ? 'solid' : 'none', outlineWidth: 2, outlineColor: BRAND, outlineOffset: -2,
        cursor: editable ? (inline ? 'text' : 'pointer') : 'default',
        ...(sticky || {}),
      })}
    >
      <CellView item={item} column={column} values={values} people={people}
        onToggle={IN_CELL_KINDS.has(column.kind) && (editable || column.kind === 'vote') ? (val) => onToggle(item, column, val) : undefined}
      />
    </Pressable>
  );
});

// What a column is for, shown behind its "?" (a column's own description wins).
const COLUMN_HINTS = {
  status: 'Where the task stands. Click a status to change it. Done counts the task as finished.',
  date: 'When the task is due. A task that is late shows in red.',
  timeline: 'The first and last day of the work. It draws the bar on the Gantt and the Calendar.',
  dependency: 'Tasks that must be done first. If a date there moves, this task moves by the same days.',
  files: 'Documents and pictures for this task.',
  long_text: 'Free notes for this task.',
};

/** The thin grip on a header's right edge: drag it sideways to change the column's width, like a spreadsheet. */
function ResizeGrip({ onResize, startWidth, height }) {
  const ref = useRef(null);
  const live = useRef({ startWidth });
  live.current.startWidth = startWidth;
  const attach = (node) => {
    ref.current = node;
    if (!node || typeof node.addEventListener !== 'function' || node.__grip) return;
    node.__grip = true;
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const x0 = e.clientX; const w0 = live.current.startWidth;
      const prevSelect = document.body.style.userSelect; const prevCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize';
      const move = (ev) => onResizeRef.current(w0 + (ev.clientX - x0), false);
      const up = (ev) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        document.body.style.userSelect = prevSelect; document.body.style.cursor = prevCursor;
        onResizeRef.current(w0 + (ev.clientX - x0), true);
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  };
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  return (
    <View
      ref={attach}
      accessibilityLabel="Drag to resize the column"
      style={{ position: 'absolute', right: -4, top: 0, width: 9, height, cursor: 'col-resize', zIndex: 6, alignItems: 'center' }}
    >
      <View style={{ width: 3, height: '60%', marginTop: '10%', borderRadius: 2, backgroundColor: 'transparent' }} dataSet={{ grip: '1' }} />
    </View>
  );
}

function HeaderCell({ column, canManage, onMenu, width, sticky, onResize, onRename }) {
  const colors = useColors();
  const { headH } = useContext(Metrics);
  const hint = column.description || COLUMN_HINTS[column.kind];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(column.title);
  const finish = (save) => { setEditing(false); const t = text.trim(); if (save && t && t !== column.title) onRename?.(column, t); else setText(column.title); };
  return (
    <View style={[{ width, height: headH, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200] }, sticky && { backgroundColor: colors.white }, sticky]}>
      {editing ? (
        <TextInput
          autoFocus selectTextOnFocus value={text} onChangeText={setText} onBlur={() => finish(true)}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Enter') finish(true); else if (e.nativeEvent.key === 'Escape') finish(false); }}
          style={{ flex: 1, height: headH - 10, marginHorizontal: 4, paddingHorizontal: 6, fontSize: 13, fontWeight: '500', textAlign: 'center', color: colors.gray[900], borderWidth: 1, borderColor: colors.brand[400], borderRadius: radius.sm, outlineStyle: 'none' }}
        />
      ) : (
      <Pressable
        disabled={!canManage}
        onPress={(e) => onMenu(e, column)}
        onLongPress={() => { setText(column.title); setEditing(true); }}
        delayLongPress={350}
        accessibilityLabel={`${column.title} column`}
        style={({ hovered }) => ({ flexShrink: 1, height: headH, justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: hovered && canManage ? colors.gray[100] : 'transparent' })}
      >
        <Text numberOfLines={Math.round(headH / 20)} style={{ fontSize: 13, color: colors.gray[600], fontWeight: '500', textAlign: 'center' }}>{column.title}</Text>
      </Pressable>
      )}
      {!!hint && <Hint text={hint} size={14} style={{ marginRight: 6 }} />}
      {!!onResize && <ResizeGrip onResize={(w, final) => onResize(column, w, final)} startWidth={width} height={headH} />}
    </View>
  );
}

function AddItemRow({ color, onAdd, word, width, indent = 0 }) {
  const colors = useColors();
  const { rowH } = useContext(Metrics);
  const [text, setText] = useState('');
  return (
    <View style={{ flexDirection: 'row', height: rowH, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
      <View style={{ width: 6, backgroundColor: paletteHex(color), opacity: 0.5 }} />
      <TextInput accessibilityLabel={`Add ${word.toLowerCase()}`}
        value={text}
        onChangeText={setText}
        placeholder={`+ Add ${word.toLowerCase()}`}
        placeholderTextColor={colors.gray[400]}
        onSubmitEditing={() => { if (text.trim()) { onAdd(text); setText(''); } }}
        blurOnSubmit={false}
        style={{ width: width - 6, paddingLeft: spacing.lg + 18 + indent, paddingRight: spacing.sm, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
      />
    </View>
  );
}

function SummaryRow({ items, columns, values, colors, nameWidth }) {
  return (
    <View style={{ flexDirection: 'row', height: 30, alignItems: 'center' }}>
      <View style={{ width: nameWidth }} />
      {columns.map((c) => {
        let inner = null;
        if (c.kind === 'date' || c.kind === 'timeline') {
          const r = dateRange(items, c, values);
          if (r) {
            inner = (
              <View style={{ backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2, minWidth: 90, alignItems: 'center' }}>
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12 }}>{r[0] === r[1] ? formatDue(r[0]) : `${formatDue(r[0])} - ${formatDue(r[1])}`}</Text>
              </View>
            );
          } else {
            inner = <View style={{ backgroundColor: colors.gray[300], borderRadius: 12, width: 90, height: 18 }} />;
          }
        }
        if (c.kind === 'status' && items.length) {
          const parts = statusBreakdown(items, c, values);
          inner = (
            <View style={{ flexDirection: 'row', height: 20, width: '100%', borderRadius: 3, overflow: 'hidden' }}>
              {parts.map((p, i) => <View key={i} style={{ flex: p.count, backgroundColor: paletteHex(p.color) }} accessibilityLabel={`${p.label}: ${p.count}`} />)}
            </View>
          );
        }
        if (c.kind === 'numbers') {
          const n = numberSummary(items, c, values);
          inner = n !== null ? <Text style={{ fontSize: 12, color: colors.gray[700], fontWeight: '600' }}>{formatNumber(n, c.settings || {})}</Text> : null;
        }
        return <View key={c.id} style={{ width: c.width, paddingHorizontal: spacing.sm, alignItems: 'center' }}>{inner}</View>;
      })}
    </View>
  );
}

/**
 * The main table (desktop): one block per group with its own header row, a coloured edge, items with their
 * sub-items, an "add item" row and a summary row (status bar, number totals).
 */
export default function BoardTable({
  board, items, people, collapsed, onToggleGroup, onOpenCell, onOpenName, onOpenItem, onToggleValue,
  onColumnMenu, onRenameColumn, onAddColumn, onGroupMenu, onAddItem, onAddGroup, focus, setFocus,
  pinned = 0, headerHeight = 'single', itemHeight = 'normal', colorOf, editNameId, onEditNameDone, onRenameItem, onSetDone, onBulkDelete, onBulkDuplicate, onResizeColumn,
}) {
  const colors = useColors();
  const { columns: savedColumns, groups, values, access } = board;
  // Column widths: dragged live here, saved on the board's column for people who manage it (everyone's table follows).
  const [liveW, setLiveW] = useState({});
  const columns = useMemo(() => (Object.keys(liveW).length ? savedColumns.map((c) => (liveW[c.id] ? { ...c, width: liveW[c.id] } : c)) : savedColumns), [savedColumns, liveW]);
  useEffect(() => { // once the saved width has arrived, stop overriding it
    setLiveW((cur) => { const keys = Object.keys(cur); if (!keys.length) return cur; const n = { ...cur }; let changed = false; savedColumns.forEach((c) => { if (n[c.id] === c.width) { delete n[c.id]; changed = true; } }); return changed ? n : cur; });
  }, [savedColumns]);
  const nameKey = `board.nameW.${board.board?.id}`;
  const [nameW, setNameW] = useState(() => { try { return Math.min(MAX_COL, Math.max(160, Number(window.localStorage.getItem(nameKey)) || NAME_W)); } catch { return NAME_W; } });
  const resizeColumn = (column, width, final) => {
    const w = Math.round(Math.min(MAX_COL, Math.max(MIN_COL, width)));
    if (column === 'name') { setNameW(Math.max(160, w)); if (final) { try { window.localStorage.setItem(nameKey, String(Math.max(160, w))); } catch { /* private mode */ } } return; }
    setLiveW((cur) => ({ ...cur, [column.id]: w }));
    const saved = savedColumns.find((x) => x.id === column.id);
    if (final && canManage && onResizeColumn && saved && w !== saved.width) onResizeColumn(saved, w);
  };
  const rowH = ITEM_HEIGHTS[itemHeight] || ROW_H;
  const headH = HEADER_HEIGHTS[headerHeight] || 34;
  const metrics = useMemo(() => ({ rowH, headH, pinned }), [rowH, headH, pinned]);
  // Which task has its name open for typing (a click on the name, or a task that was just made).
  const [nameEdit, setNameEdit] = useState(null);
  // Row selection (monday-style tick boxes) and the bulk bar that appears while anything is ticked.
  const [sel, setSel] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSel = (ids, on) => setSel((cur) => { const n = new Set(cur); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  useEffect(() => { // forget ticks for rows that are gone (deleted, filtered out)
    setSel((cur) => { const have = new Set(items.map((t) => t.id)); const n = new Set([...cur].filter((id) => have.has(id))); return n.size === cur.size ? cur : n; });
  }, [items]);
  useEffect(() => { if (editNameId) { setNameEdit(editNameId); onEditNameDone?.(); } }, [editNameId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The name block always stays in view when the table scrolls sideways, plus the first `pinned` columns.
  const NAME_BLOCK = nameW + UPD_W;
  const stickyName = { position: 'sticky', left: 0, zIndex: 4 };
  const lefts = useMemo(() => { let x = NAME_BLOCK; return columns.map((c) => { const l = x; x += c.width; return l; }); }, [columns, NAME_BLOCK]);
  const stickyCol = (ci) => (ci < pinned ? { position: 'sticky', left: lefts[ci], zIndex: 3 } : null);
  const canManage = !!access?.manage;
  const canAdd = !!access?.add;
  const word = itemWordOf(board);
  const progressMap = useMemo(() => progressMapOf(board.items), [board.items]);
  const tableWidth = nameW + UPD_W + columns.reduce((s, c) => s + c.width, 0) + ADD_W;
  const [openParents, setOpenParents] = useState(() => new Set());
  // Speed (M14): a big group draws its first rows and a "Show more" line, not hundreds of rows at once.
  const [shown, setShown] = useState(() => new Map());
  const limitOf = (gid) => shown.get(gid ?? 'none') || PAGE;

  // Groups as shown: the board's groups, plus "No group" when some items have none.
  const blocks = useMemo(() => groupBlocks(groups, items), [groups, items]);

  // Rows in reading order, for arrow-key moves.
  const rows = useMemo(() => {
    const out = [];
    for (const b of blocks) {
      if (collapsed.has(b.group.id)) continue;
      for (const t of b.top.slice(0, shown.get(b.group.id ?? 'none') || PAGE)) {
        out.push(t);
        if (openParents.has(t.id)) for (const c of b.children.get(t.id) || []) out.push(c);
      }
    }
    return out;
  }, [blocks, collapsed, openParents, shown]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.defaultPrevented) return;
      if (!focus) return;
      const r = rowsRef.current;
      const rowIdx = r.findIndex((t) => t.id === focus.itemId);
      const colIdx = focus.col; // -1 = name
      const move = (dr, dc) => {
        const nr = Math.min(Math.max(rowIdx + dr, 0), r.length - 1);
        const nc = Math.min(Math.max(colIdx + dc, -1), columns.length - 1);
        if (r[nr]) setFocus({ itemId: r[nr].id, col: nc });
        e.preventDefault();
      };
      if (e.key === 'ArrowDown') move(1, 0);
      else if (e.key === 'ArrowUp') move(-1, 0);
      else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) move(0, 1);
      else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) move(0, -1);
      else if (e.key === 'Escape') setFocus(null);
      else if (e.key === 'Enter' || e.key === 'F2') {
        const item = r[rowIdx];
        if (!item) return;
        e.preventDefault();
        const el = document.querySelector(`[data-cell="${item.id}:${colIdx}"]`);
        const rect = el?.getBoundingClientRect();
        const anchor = rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null;
        if (colIdx === -1) onOpenName(anchor, item);
        else if (canEditColumn(columns[colIdx]) && mayEdit(item, columns[colIdx])) onOpenCell(anchor, item, columns[colIdx]);
      } else if (e.key === 'o' || e.key === 'O') {
        const item = r[rowIdx];
        if (item) { e.preventDefault(); onOpenItem(item.id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, columns, setFocus, onOpenCell, onOpenName, onOpenItem]);

  const toggleParent = (id) => setOpenParents((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // The sub-tasks of a task: their own small table under it (name, owner, status, date), with an add line.
  const subColumns = useMemo(() => {
    const first = (pred) => columns.find(pred);
    return [first((c) => c.kind === 'person'), first((c) => c.kind === 'status'), first((c) => c.kind === 'date' || c.kind === 'timeline')].filter(Boolean);
  }, [columns]);
  // A task's steps are rows of the same table, indented inside the task: the name starts further right than the
  // task's own, and Owner / Status / Date sit under the same columns, so columns line up from top to bottom.
  const SUB_INDENT = 52;
  const subIds = new Set(subColumns.map((c) => c.id));
  const subBg = colors.gray[50];

  const renderSubRows = (kids, block, depth) => kids.map((k) => {
    const own = block.children.get(k.id) || [];
    const open = openParents.has(k.id);
    const prog = own.length ? progressMap.get(k.id) : null;
    const left = SUB_INDENT + depth * 20;
    return (
      <View key={k.id}>
        <View style={{ flexDirection: 'row', height: rowH, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: subBg }}>
          <View style={[{ flexDirection: 'row', backgroundColor: subBg, height: rowH }, stickyName]}>
            <View style={{ width: 6, backgroundColor: paletteHex(block.group.color), opacity: 0.55 }} />
            <View style={{ width: nameW - 6, height: rowH, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: left, paddingRight: spacing.sm, borderRightWidth: 1, borderColor: colors.gray[200] }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: left - 18, top: 0, bottom: 0, width: 2, backgroundColor: colors.gray[300] }} />
              {own.length ? (
                <Pressable onPress={() => toggleParent(k.id)} hitSlop={6} accessibilityLabel={open ? 'Hide steps' : 'Show steps'}>
                  <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.gray[600]} />
                </Pressable>
              ) : (
                <Pressable onPress={() => mayEdit(k) && onSetDone?.(k)} hitSlop={6} accessibilityLabel={k.is_done ? 'Mark not done' : 'Mark done'}>
                  <Ionicons name={k.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={k.is_done ? colors.green[600] : colors.gray[400]} />
                </Pressable>
              )}
              {nameEdit === k.id && mayEdit(k) ? (
                <TextInput
                  autoFocus selectTextOnFocus defaultValue={k.title} accessibilityLabel={`Name of ${k.title}`}
                  onBlur={(e) => { const v = (e.nativeEvent?.text ?? e.target?.value ?? '').trim(); setNameEdit(null); if (v && v !== k.title) onRenameItem(k, v); }}
                  onSubmitEditing={(e) => { const v = (e.nativeEvent?.text || '').trim(); setNameEdit(null); if (v && v !== k.title) onRenameItem(k, v); }}
                  onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') setNameEdit(null); }}
                  style={{ flex: 1, height: rowH - 8, paddingHorizontal: 6, fontSize: 13, color: colors.gray[900], backgroundColor: colors.white, borderWidth: 2, borderColor: BRAND, borderRadius: 2, outlineStyle: 'none' }}
                />
              ) : (
                <Pressable onPress={() => (mayEdit(k) ? setNameEdit(k.id) : onOpenItem(k.id))} style={{ flex: 1, height: rowH, justifyContent: 'center', cursor: 'text' }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: k.is_done ? colors.gray[400] : colors.gray[800], textDecorationLine: k.is_done ? 'line-through' : 'none' }}>{k.title}</Text>
                </Pressable>
              )}
              {prog && (
                <View accessibilityLabel={`${prog.done} of ${prog.total} steps done`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ProgressDot pct={prog.pct} size={16} stroke={2.5} />
                  <Text style={{ fontSize: 11, color: colors.gray[600] }}>{prog.done}/{prog.total}</Text>
                </View>
              )}
              <Pressable onPress={() => onOpenItem(k.id)} hitSlop={4} accessibilityLabel={`Open ${k.title}`} style={({ hovered }) => ({ padding: 3, borderRadius: 4, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
                <Ionicons name="expand-outline" size={14} color={colors.gray[500]} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => onOpenItem(k.id, 'updates')}
              accessibilityLabel={`Updates of ${k.title}`}
              style={({ hovered }) => ({ width: UPD_W, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.brand[50] : 'transparent' })}
            >
              <Ionicons name={k.comment_count > 0 ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={17} color={k.comment_count > 0 ? BRAND : colors.gray[400]} />
              {k.comment_count > 0 && (
                <View style={{ position: 'absolute', top: 4, right: 6, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{k.comment_count}</Text>
                </View>
              )}
            </Pressable>
          </View>
          {columns.map((c, ci) => (
            <View key={c.id} style={[{ width: c.width, height: rowH, borderRightWidth: 1, borderColor: colors.gray[200] }, stickyCol(ci) ? [stickyCol(ci), { backgroundColor: subBg }] : null]}>
              {subIds.has(c.id) ? (
                <Cell item={k} column={c} values={values} people={people} width={c.width} focused={false}
                  onOpen={(e, item, column) => onOpenCell(anchorOf(e), item, column)} onToggle={onToggleValue} />
              ) : null}
            </View>
          ))}
        </View>
        {open && own.length > 0 && renderSubRows(own, block, depth + 1)}
      </View>
    );
  });

  const renderSubTasks = (parent, kids, block) => (
    <View>
      {renderSubRows(kids, block, 0)}
      {canAdd && (
        <View style={{ flexDirection: 'row', height: rowH, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: subBg }}>
          <View style={[{ flexDirection: 'row', backgroundColor: subBg, height: rowH }, stickyName]}>
            <View style={{ width: 6, backgroundColor: paletteHex(block.group.color), opacity: 0.55 }} />
            <View style={{ width: nameW - 6 + UPD_W, height: rowH, justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200] }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: SUB_INDENT - 18, top: 0, bottom: '50%', width: 2, backgroundColor: colors.gray[300] }} />
              <TextInput
                placeholder="+ Add subitem"
                placeholderTextColor={colors.gray[400]}
                accessibilityLabel="Add a subitem"
                onSubmitEditing={(e) => {
                  const text = e.nativeEvent.text;
                  if (text?.trim()) { onAddItem(text, block.group.id, { parent_id: parent.id }); e.target.clear?.(); }
                }}
                blurOnSubmit={false}
                style={{ height: rowH - 4, paddingLeft: SUB_INDENT + 4, paddingRight: spacing.sm, fontSize: 13, color: colors.gray[900], outlineStyle: 'none' }}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const renderRow = (t, block, depth) => {
    const kids = block.children.get(t.id) || [];
    const open = openParents.has(t.id);
    const focusedHere = focus?.itemId === t.id;
    const hasKids = kids.length > 0;
    const prog = hasKids ? progressMap.get(t.id) : null;
    const rule = colorOf ? colorOf(t) : null;
    return (
      <View key={t.id}>
        <View style={{ flexDirection: 'row', height: rowH, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white }}>
          <View style={[{ flexDirection: 'row', backgroundColor: colors.white, height: rowH }, stickyName]}>
          <View style={{ width: 6, backgroundColor: paletteHex(rule || block.group.color) }} />
          <View
            dataSet={{ cell: `${t.id}:-1` }}
            style={{
              width: nameW - 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: spacing.sm,
              paddingRight: spacing.xs, borderRightWidth: 1, borderColor: colors.gray[200],
              backgroundColor: sel.has(t.id) ? colors.brand[50] : rule ? `${paletteHex(rule)}26` : 'transparent',
              outlineStyle: focusedHere && focus.col === -1 ? 'solid' : 'none', outlineWidth: 2, outlineColor: BRAND, outlineOffset: -2,
            }}
          >
            <Pressable onPress={() => toggleSel([t.id], !sel.has(t.id))} hitSlop={6} accessibilityLabel={sel.has(t.id) ? `Unselect ${t.title}` : `Select ${t.title}`}>
              <Ionicons name={sel.has(t.id) ? 'checkbox' : 'square-outline'} size={17} color={sel.has(t.id) ? BRAND : colors.gray[300]} />
            </Pressable>
            <Pressable onPress={() => toggleParent(t.id)} hitSlop={6} accessibilityLabel={open ? 'Hide subtasks' : 'Show subtasks'}>
              <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={hasKids ? colors.gray[600] : colors.gray[300]} />
            </Pressable>
            {nameEdit === t.id && mayEdit(t) ? (
              <TextInput
                autoFocus selectTextOnFocus defaultValue={t.title} accessibilityLabel={`Name of ${t.title}`}
                onBlur={(e) => { const v = (e.nativeEvent?.text ?? e.target?.value ?? '').trim(); setNameEdit(null); if (v && v !== t.title) onRenameItem(t, v); }}
                onSubmitEditing={(e) => { const v = (e.nativeEvent?.text || '').trim(); setNameEdit(null); if (v && v !== t.title) onRenameItem(t, v); }}
                onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') setNameEdit(null); }}
                style={{ flex: 1, height: rowH - 4, paddingHorizontal: 6, fontSize: 14, color: colors.gray[900], backgroundColor: colors.white, borderWidth: 2, borderColor: BRAND, borderRadius: 2, outlineStyle: 'none' }}
              />
            ) : (
              <Pressable
                onPress={() => { setFocus({ itemId: t.id, col: -1 }); if (mayEdit(t)) setNameEdit(t.id); else onOpenItem(t.id); }}
                accessibilityLabel={`Edit the name of ${t.title}`}
                style={{ flex: 1, height: rowH, justifyContent: 'center', cursor: 'text' }}
              >
                <Text numberOfLines={rowH > 40 ? 2 : 1} style={{ fontSize: 14, color: t.is_done ? colors.gray[400] : colors.gray[800], textDecorationLine: t.is_done ? 'line-through' : 'none' }}>
                  {t.title}
                </Text>
              </Pressable>
            )}
            {hasKids && prog && (
              <View accessibilityLabel={`${prog.done} of ${prog.total} steps done`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <ProgressDot pct={prog.pct} size={18} />
                <Text style={{ fontSize: 11, color: colors.gray[600] }}>{prog.done}/{prog.total}</Text>
              </View>
            )}
            <Pressable onPress={() => onOpenItem(t.id)} hitSlop={4} accessibilityLabel={`Open ${t.title}`} style={({ hovered }) => ({ padding: 3, borderRadius: 4, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="expand-outline" size={15} color={colors.gray[500]} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => onOpenItem(t.id, 'updates')}
            accessibilityLabel={`Updates of ${t.title}`}
            style={({ hovered }) => ({ width: UPD_W, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.brand[50] : 'transparent' })}
          >
            <Ionicons name={t.comment_count > 0 ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={19} color={t.comment_count > 0 ? BRAND : colors.gray[400]} />
            {t.comment_count > 0 && (
              <View style={{ position: 'absolute', top: 5, right: 6, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{t.comment_count}</Text>
              </View>
            )}
          </Pressable>
          </View>
          {columns.map((c, ci) => (
            <View key={c.id} dataSet={{ cell: `${t.id}:${ci}` }} style={stickyCol(ci) ? [stickyCol(ci), { backgroundColor: colors.white, height: rowH }] : undefined}>
              <Cell
                item={t} column={c} values={values} people={people} width={c.width}
                focused={focusedHere && focus.col === ci}
                onOpen={(e, item, column) => { setFocus({ itemId: item.id, col: ci }); onOpenCell(anchorOf(e), item, column); }}
                onToggle={onToggleValue}
              />
            </View>
          ))}
          <View style={{ width: ADD_W }} />
        </View>
        {open && renderSubTasks(t, kids, block)}
      </View>
    );
  };

  return (
    <Metrics.Provider value={metrics}>
    <View style={{ flex: 1, overflow: 'auto' }}>
      <View style={{ width: Math.max(tableWidth, 600), paddingBottom: 120 }}>
        {blocks.map((b) => {
          const isCollapsed = collapsed.has(b.group.id);
          return (
            <View key={b.group.id ?? 'none'} style={{ marginBottom: spacing.xl, width: tableWidth }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Pressable onPress={() => onToggleGroup(b.group.id)} hitSlop={6} accessibilityLabel={isCollapsed ? 'Expand group' : 'Collapse group'}>
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={18} color={paletteHex(b.group.color)} />
                </Pressable>
                {b.top.length > 0 && (() => {
                  const ids = b.top.map((t) => t.id); const all = ids.every((id) => sel.has(id));
                  return (
                    <Pressable onPress={() => toggleSel(ids, !all)} hitSlop={6} accessibilityLabel={all ? 'Unselect the group' : 'Select the whole group'}>
                      <Ionicons name={all ? 'checkbox' : 'square-outline'} size={16} color={all ? BRAND : colors.gray[400]} />
                    </Pressable>
                  );
                })()}
                <Pressable disabled={typeof b.group.id !== 'number' || !canAdd} onPress={(e) => onGroupMenu(anchorOf(e), b.group)}>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: b.group.color === 'grey' ? colors.gray[600] : paletteHex(b.group.color) }}>{b.group.name}</Text>
                </Pressable>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>{b.top.length} {b.top.length === 1 ? word.toLowerCase() : plural(word.toLowerCase())}</Text>
              </View>
              {!isCollapsed && (
                <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], overflow: 'clip', backgroundColor: colors.white }}>
                  <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.gray[200] }}>
                    <View style={[{ flexDirection: 'row', backgroundColor: colors.white }, stickyName]}>
                      <View style={{ width: 6, backgroundColor: paletteHex(b.group.color) }} />
                      <View style={{ width: nameW - 6 + UPD_W, height: headH, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200] }}>
                        <Text style={{ fontSize: 13, color: colors.gray[600], fontWeight: '500' }}>{word}</Text>
                        <ResizeGrip onResize={(w, final) => resizeColumn('name', w, final)} startWidth={nameW} height={headH} />
                      </View>
                    </View>
                    {columns.map((c, ci) => <HeaderCell key={c.id} column={c} width={c.width} canManage={canManage} sticky={stickyCol(ci)} onResize={resizeColumn} onMenu={(e, col) => onColumnMenu(anchorOf(e), col)} onRename={onRenameColumn} />)}
                    <Pressable
                      disabled={!canManage}
                      onPress={(e) => onAddColumn(anchorOf(e))}
                      accessibilityLabel="Add column"
                      style={({ hovered }) => ({ width: ADD_W, height: headH, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
                    >
                      {canManage && <Ionicons name="add" size={18} color={colors.gray[600]} />}
                    </Pressable>
                  </View>
                  {b.top.slice(0, limitOf(b.group.id)).map((t) => renderRow(t, b, 0))}
                  {b.top.length > limitOf(b.group.id) && (
                    <Pressable
                      onPress={() => setShown((m) => new Map(m).set(b.group.id ?? 'none', limitOf(b.group.id) + PAGE))}
                      style={({ hovered }) => ({ height: rowH, justifyContent: 'center', paddingLeft: spacing.lg + 18, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.gray[50] : colors.white })}
                    >
                      <Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>Show {Math.min(PAGE, b.top.length - limitOf(b.group.id))} more of {b.top.length - limitOf(b.group.id)}</Text>
                    </Pressable>
                  )}
                  {canAdd && <AddItemRow color={b.group.color} word={word} width={nameW + UPD_W} onAdd={(title) => onAddItem(title, b.group.id)} />}
                  <SummaryRow items={b.top} columns={columns} values={values} colors={colors} nameWidth={nameW + UPD_W} />
                </View>
              )}
            </View>
          );
        })}
        {canAdd && (
          <Pressable onPress={onAddGroup} style={({ hovered }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: hovered ? colors.gray[100] : colors.white })}>
            <Ionicons name="add" size={16} color={colors.gray[700]} />
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>Add new group</Text>
            <Hint text="A group is a section of the board, like To-Do or Completed. Tasks live inside groups. You can rename, colour, move or duplicate a group from its name." size={14} />
          </Pressable>
        )}
      </View>
    </View>
    {sel.size > 0 && (
      <View {...glass('capsule')} style={{ position: 'fixed', bottom: 28, left: 0, right: 0, alignSelf: 'center', marginHorizontal: 'auto', width: 'fit-content', zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.white }}>
        <View style={{ minWidth: 26, height: 26, borderRadius: 13, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sel.size}</Text>
        </View>
        <Text style={{ fontSize: 14, color: colors.gray[800] }}>{sel.size === 1 ? `${word} selected` : `${plural(word)} selected`}</Text>
        {canAdd && !!onBulkDuplicate && (
          <Pressable disabled={bulkBusy} onPress={async () => { setBulkBusy(true); await onBulkDuplicate(items.filter((t) => sel.has(t.id))); setBulkBusy(false); setSel(new Set()); }} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="copy-outline" size={16} color={colors.gray[700]} /><Text style={{ fontSize: 14, color: colors.gray[800] }}>Duplicate</Text>
          </Pressable>
        )}
        {!!onBulkDelete && (
          <Pressable disabled={bulkBusy} onPress={async () => {
            const rows = items.filter((t) => sel.has(t.id));
            const ok = await confirmDialog({ title: `Delete ${rows.length} ${rows.length === 1 ? word.toLowerCase() : plural(word.toLowerCase())}?`, message: 'They go to the recycle bin for 90 days. Ones you may not delete are skipped.', confirmLabel: 'Delete', destructive: true });
            if (!ok) return;
            setBulkBusy(true); await onBulkDelete(rows); setBulkBusy(false); setSel(new Set());
          }} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.red[50] : 'transparent' })}>
            <Ionicons name="trash-outline" size={16} color={colors.red[600]} /><Text style={{ fontSize: 14, color: colors.red[600] }}>Delete</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setSel(new Set())} accessibilityLabel="Clear selection" hitSlop={6}><Ionicons name="close" size={18} color={colors.gray[500]} /></Pressable>
      </View>
    )}
    </Metrics.Provider>
  );
}
