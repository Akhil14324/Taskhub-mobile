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

export { anchorOf };

const NAME_W = 340;
const UPD_W = 46; // the "updates" column next to the name: opens the task window
const ADD_W = 44;
const ROW_H = 38;
// Heights the "..." menu can change (Item height, Header height) and how many columns stay put when scrolling sideways.
const Metrics = createContext({ rowH: ROW_H, headH: 34, pinned: 0 });
const ITEM_HEIGHTS = { compact: 30, normal: 38, tall: 56 };
const HEADER_HEIGHTS = { single: 34, double: 54, triple: 74 };
const PAGE = 100; // rows drawn per group before "Show more"
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

function HeaderCell({ column, canManage, onMenu, width, sticky }) {
  const colors = useColors();
  const { headH } = useContext(Metrics);
  const hint = column.description || COLUMN_HINTS[column.kind];
  return (
    <View style={[{ width, height: headH, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200] }, sticky && { backgroundColor: colors.white }, sticky]}>
      <Pressable
        disabled={!canManage}
        onPress={(e) => onMenu(e, column)}
        accessibilityLabel={`${column.title} column`}
        style={({ hovered }) => ({ flexShrink: 1, height: headH, justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: hovered && canManage ? colors.gray[100] : 'transparent' })}
      >
        <Text numberOfLines={Math.round(headH / 20)} style={{ fontSize: 13, color: colors.gray[600], fontWeight: '500', textAlign: 'center' }}>{column.title}</Text>
      </Pressable>
      {!!hint && <Hint text={hint} size={14} style={{ marginRight: 6 }} />}
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
  onColumnMenu, onAddColumn, onGroupMenu, onAddItem, onAddGroup, focus, setFocus,
  pinned = 0, headerHeight = 'single', itemHeight = 'normal', colorOf, editNameId, onEditNameDone, onRenameItem, onSetDone,
}) {
  const colors = useColors();
  const { columns, groups, values, access } = board;
  const rowH = ITEM_HEIGHTS[itemHeight] || ROW_H;
  const headH = HEADER_HEIGHTS[headerHeight] || 34;
  const metrics = useMemo(() => ({ rowH, headH, pinned }), [rowH, headH, pinned]);
  // Which task has its name open for typing (a click on the name, or a task that was just made).
  const [nameEdit, setNameEdit] = useState(null);
  useEffect(() => { if (editNameId) { setNameEdit(editNameId); onEditNameDone?.(); } }, [editNameId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The name block always stays in view when the table scrolls sideways, plus the first `pinned` columns.
  const NAME_BLOCK = NAME_W + UPD_W;
  const stickyName = { position: 'sticky', left: 0, zIndex: 4 };
  const lefts = useMemo(() => { let x = NAME_BLOCK; return columns.map((c) => { const l = x; x += c.width; return l; }); }, [columns, NAME_BLOCK]);
  const stickyCol = (ci) => (ci < pinned ? { position: 'sticky', left: lefts[ci], zIndex: 3 } : null);
  const canManage = !!access?.manage;
  const canAdd = !!access?.add;
  const word = itemWordOf(board);
  const progressMap = useMemo(() => progressMapOf(board.items), [board.items]);
  const tableWidth = NAME_W + UPD_W + columns.reduce((s, c) => s + c.width, 0) + ADD_W;
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
  const SUB_NAME_W = NAME_W + UPD_W - 6 - 30;

  // The rows of a task's steps. A step that has steps of its own shows its own ring and can be opened, to any depth.
  const renderSubRows = (kids, block, depth) => kids.map((k) => {
    const own = block.children.get(k.id) || [];
    const open = openParents.has(k.id);
    const prog = own.length ? progressMap.get(k.id) : null;
    return (
      <View key={k.id}>
        <View style={{ flexDirection: 'row', height: 34, borderBottomWidth: 1, borderColor: colors.gray[200], alignItems: 'center' }}>
          <View style={{ width: SUB_NAME_W, height: 34, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: spacing.sm + depth * 18, paddingRight: spacing.sm }}>
            {own.length ? (
              <Pressable onPress={() => toggleParent(k.id)} hitSlop={6} accessibilityLabel={open ? 'Hide steps' : 'Show steps'}>
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.gray[600]} />
              </Pressable>
            ) : (
              <Pressable onPress={() => mayEdit(k) && onToggleValue && onSetDone?.(k)} hitSlop={6} accessibilityLabel={k.is_done ? 'Mark not done' : 'Mark done'}>
                <Ionicons name={k.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={k.is_done ? colors.green[600] : colors.gray[400]} />
              </Pressable>
            )}
            {nameEdit === k.id && mayEdit(k) ? (
              <TextInput
                autoFocus selectTextOnFocus defaultValue={k.title} accessibilityLabel={`Name of ${k.title}`}
                onBlur={(e) => { const v = (e.nativeEvent?.text ?? e.target?.value ?? '').trim(); setNameEdit(null); if (v && v !== k.title) onRenameItem(k, v); }}
                onSubmitEditing={(e) => { const v = (e.nativeEvent?.text || '').trim(); setNameEdit(null); if (v && v !== k.title) onRenameItem(k, v); }}
                onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') setNameEdit(null); }}
                style={{ flex: 1, height: 28, paddingHorizontal: 6, fontSize: 13, color: colors.gray[900], backgroundColor: colors.white, borderWidth: 2, borderColor: BRAND, borderRadius: 2, outlineStyle: 'none' }}
              />
            ) : (
              <Pressable onPress={() => (mayEdit(k) ? setNameEdit(k.id) : onOpenItem(k.id))} style={{ flex: 1, height: 34, justifyContent: 'center', cursor: 'text' }}>
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
          {subColumns.map((c) => (
            <View key={c.id} style={{ borderLeftWidth: 1, borderColor: colors.gray[200] }}>
              <Cell item={k} column={c} values={values} people={people} width={c.width} focused={false}
                onOpen={(e, item, column) => onOpenCell(anchorOf(e), item, column)} onToggle={onToggleValue} />
            </View>
          ))}
        </View>
        {open && own.length > 0 && renderSubRows(own, block, depth + 1)}
      </View>
    );
  });

  const renderSubTasks = (parent, kids, block) => (
    <View style={{ flexDirection: 'row', backgroundColor: colors.gray[50], paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
      <View style={{ width: 6, backgroundColor: paletteHex(block.group.color) }} />
      <View style={{ marginLeft: 24, borderLeftWidth: 3, borderLeftColor: BRAND, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200] }}>
        <View style={{ flexDirection: 'row', height: 30, borderBottomWidth: 1, borderColor: colors.gray[200], alignItems: 'center' }}>
          <View style={{ width: SUB_NAME_W, alignItems: 'center' }}><Text style={{ fontSize: 12, color: colors.gray[600], fontWeight: '500' }}>Subitem</Text></View>
          {subColumns.map((c) => <View key={c.id} style={{ width: c.width, alignItems: 'center', borderLeftWidth: 1, borderColor: colors.gray[200], height: 30, justifyContent: 'center' }}><Text style={{ fontSize: 12, color: colors.gray[600], fontWeight: '500' }}>{c.title}</Text></View>)}
        </View>
        {renderSubRows(kids, block, 0)}
        {canAdd && (
          <TextInput
            placeholder="+ Add subitem"
            placeholderTextColor={colors.gray[400]}
            accessibilityLabel="Add a subitem"
            onSubmitEditing={(e) => {
              const text = e.nativeEvent.text;
              if (text?.trim()) { onAddItem(text, block.group.id, { parent_id: parent.id }); e.target.clear?.(); }
            }}
            blurOnSubmit={false}
            style={{ height: 34, paddingHorizontal: spacing.md, fontSize: 13, color: colors.gray[900], outlineStyle: 'none', width: SUB_NAME_W + subColumns.reduce((n, c) => n + c.width, 0) }}
          />
        )}
      </View>
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
          <View style={[{ flexDirection: 'row', backgroundColor: colors.white }, stickyName]}>
          <View style={{ width: 6, backgroundColor: paletteHex(rule || block.group.color) }} />
          <View
            dataSet={{ cell: `${t.id}:-1` }}
            style={{
              width: NAME_W - 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: spacing.sm,
              paddingRight: spacing.xs, borderRightWidth: 1, borderColor: colors.gray[200],
              backgroundColor: rule ? `${paletteHex(rule)}26` : 'transparent',
              outlineStyle: focusedHere && focus.col === -1 ? 'solid' : 'none', outlineWidth: 2, outlineColor: BRAND, outlineOffset: -2,
            }}
          >
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
            <View key={c.id} dataSet={{ cell: `${t.id}:${ci}` }} style={stickyCol(ci) ? [stickyCol(ci), { backgroundColor: colors.white }] : undefined}>
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
    <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
      <ScrollView style={{ width: Math.max(tableWidth, 600) }} contentContainerStyle={{ paddingBottom: 120 }}>
        {blocks.map((b) => {
          const isCollapsed = collapsed.has(b.group.id);
          return (
            <View key={b.group.id ?? 'none'} style={{ marginBottom: spacing.xl, width: tableWidth }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Pressable onPress={() => onToggleGroup(b.group.id)} hitSlop={6} accessibilityLabel={isCollapsed ? 'Expand group' : 'Collapse group'}>
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={18} color={paletteHex(b.group.color)} />
                </Pressable>
                <Pressable disabled={typeof b.group.id !== 'number' || !canAdd} onPress={(e) => onGroupMenu(anchorOf(e), b.group)}>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: b.group.color === 'grey' ? colors.gray[600] : paletteHex(b.group.color) }}>{b.group.name}</Text>
                </Pressable>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>{b.top.length} {b.top.length === 1 ? word.toLowerCase() : plural(word.toLowerCase())}</Text>
              </View>
              {!isCollapsed && (
                <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden', backgroundColor: colors.white }}>
                  <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.gray[200] }}>
                    <View style={[{ flexDirection: 'row', backgroundColor: colors.white }, stickyName]}>
                      <View style={{ width: 6, backgroundColor: paletteHex(b.group.color) }} />
                      <View style={{ width: NAME_W - 6 + UPD_W, height: headH, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.gray[200] }}>
                        <Text style={{ fontSize: 13, color: colors.gray[600], fontWeight: '500' }}>{word}</Text>
                      </View>
                    </View>
                    {columns.map((c, ci) => <HeaderCell key={c.id} column={c} width={c.width} canManage={canManage} sticky={stickyCol(ci)} onMenu={(e, col) => onColumnMenu(anchorOf(e), col)} />)}
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
                  {canAdd && <AddItemRow color={b.group.color} word={word} width={NAME_W + UPD_W} onAdd={(title) => onAddItem(title, b.group.id)} />}
                  <SummaryRow items={b.top} columns={columns} values={values} colors={colors} nameWidth={NAME_W + UPD_W} />
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
      </ScrollView>
    </ScrollView>
    </Metrics.Provider>
  );
}
