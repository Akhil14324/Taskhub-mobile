import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { CellView } from './Cells';
import {
  groupBlocks, statusBreakdown, numberSummary, formatNumber, paletteHex, canEditColumn,
} from './model';
import { mayEdit } from './CellEditorHost';

const NAME_W = 380;
const ADD_W = 44;
const ROW_H = 38;

/** Where a pressed cell is on screen, so its editor opens right there. */
export function anchorOf(e) {
  const el = e?.currentTarget || e?.target;
  const r = el?.getBoundingClientRect?.();
  return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
}

const Cell = memo(function Cell({ item, column, values, people, focused, onOpen, onToggle, width }) {
  const colors = useColors();
  const editable = canEditColumn(column) && mayEdit(item, column);
  const isStatus = column.kind === 'status';
  return (
    <Pressable
      onPress={(e) => editable && onOpen(e, item, column)}
      accessibilityLabel={`${column.title}: ${item.title}`}
      style={({ hovered }) => ({
        width, height: ROW_H, borderRightWidth: 1, borderColor: colors.gray[200], justifyContent: 'center',
        alignItems: column.kind === 'numbers' ? 'flex-end' : isStatus ? 'stretch' : 'center',
        paddingHorizontal: isStatus ? 0 : spacing.sm,
        backgroundColor: hovered && editable && !isStatus ? colors.gray[100] : 'transparent',
        outlineStyle: focused ? 'solid' : 'none', outlineWidth: 2, outlineColor: BRAND, outlineOffset: -2,
        cursor: editable ? 'pointer' : 'default',
      })}
    >
      <CellView item={item} column={column} values={values} people={people}
        onToggle={editable && (column.kind === 'checkbox' || column.kind === 'rating') ? (val) => onToggle(item, column, val) : undefined}
      />
    </Pressable>
  );
});

function HeaderCell({ column, canManage, onMenu, width }) {
  const colors = useColors();
  return (
    <Pressable
      disabled={!canManage}
      onPress={(e) => onMenu(e, column)}
      accessibilityLabel={`${column.title} column`}
      style={({ hovered }) => ({
        width, height: 34, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.sm,
        borderRightWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered && canManage ? colors.gray[100] : 'transparent',
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[600], fontWeight: '500' }}>{column.title}</Text>
    </Pressable>
  );
}

function AddItemRow({ color, onAdd, word, width }) {
  const colors = useColors();
  const [text, setText] = useState('');
  return (
    <View style={{ flexDirection: 'row', height: ROW_H, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
      <View style={{ width: 6, backgroundColor: paletteHex(color), opacity: 0.5 }} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={`+ Add ${word.toLowerCase()}`}
        placeholderTextColor={colors.gray[400]}
        onSubmitEditing={() => { if (text.trim()) { onAdd(text); setText(''); } }}
        blurOnSubmit={false}
        style={{ width: width - 6, paddingHorizontal: spacing.lg + 18, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
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
        if (c.kind === 'status' && items.length) {
          const parts = statusBreakdown(items, c, values);
          inner = (
            <View style={{ flexDirection: 'row', height: 20, width: '100%', borderRadius: 3, overflow: 'hidden' }}>
              {parts.map((p, i) => <View key={i} style={{ flex: p.count, backgroundColor: paletteHex(p.color) }} accessibilityLabel={`${p.label}: ${p.count}`} />)}
            </View>
          );
        } else if (c.kind === 'numbers') {
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
}) {
  const colors = useColors();
  const { columns, groups, values, access } = board;
  const canManage = !!access?.manage;
  const canAdd = !!access?.add;
  const tableWidth = NAME_W + columns.reduce((s, c) => s + c.width, 0) + ADD_W;
  const [openParents, setOpenParents] = useState(() => new Set());

  // Groups as shown: the board's groups, plus "No group" when some items have none.
  const blocks = useMemo(() => groupBlocks(groups, items), [groups, items]);

  // Rows in reading order, for arrow-key moves.
  const rows = useMemo(() => {
    const out = [];
    for (const b of blocks) {
      if (collapsed.has(b.group.id)) continue;
      for (const t of b.top) {
        out.push(t);
        if (openParents.has(t.id)) for (const c of b.children.get(t.id) || []) out.push(c);
      }
    }
    return out;
  }, [blocks, collapsed, openParents]);
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

  const renderRow = (t, block, depth) => {
    const kids = block.children.get(t.id) || [];
    const open = openParents.has(t.id);
    const focusedHere = focus?.itemId === t.id;
    return (
      <View key={t.id}>
        <View style={{ flexDirection: 'row', height: ROW_H, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white }}>
          <View style={{ width: 6, backgroundColor: paletteHex(block.group.color) }} />
          <Pressable
            dataSet={{ cell: `${t.id}:-1` }}
            onPress={() => setFocus({ itemId: t.id, col: -1 })}
            onLongPress={(e) => mayEdit(t) && onOpenName(anchorOf(e), t)}
            style={({ hovered }) => ({
              width: NAME_W - 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: spacing.sm + depth * 22,
              paddingRight: spacing.xs, borderRightWidth: 1, borderColor: colors.gray[200],
              backgroundColor: hovered ? colors.gray[50] : 'transparent',
              outlineStyle: focusedHere && focus.col === -1 ? 'solid' : 'none', outlineWidth: 2, outlineColor: BRAND, outlineOffset: -2,
            })}
          >
            {kids.length ? (
              <Pressable onPress={() => toggleParent(t.id)} hitSlop={6} accessibilityLabel={open ? 'Hide sub-items' : 'Show sub-items'}>
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.gray[500]} />
              </Pressable>
            ) : <View style={{ width: 14 }} />}
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: t.is_done ? colors.gray[400] : colors.gray[800], textDecorationLine: t.is_done ? 'line-through' : 'none' }}>
              {t.title}
            </Text>
            {kids.length > 0 && <Text style={{ fontSize: 11, color: colors.gray[500] }}>{t.subtask_done_count}/{kids.length}</Text>}
            {t.comment_count > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Ionicons name="chatbubble-outline" size={13} color={colors.gray[500]} />
                <Text style={{ fontSize: 11, color: colors.gray[500] }}>{t.comment_count}</Text>
              </View>
            )}
            {mayEdit(t) && (
              <Pressable onPress={(e) => onOpenName(anchorOf(e), t)} hitSlop={4} accessibilityLabel="Rename" style={({ hovered }) => ({ opacity: hovered ? 1 : 0.55 })}>
                <Ionicons name="pencil-outline" size={14} color={colors.gray[500]} />
              </Pressable>
            )}
            <Pressable onPress={() => onOpenItem(t.id)} hitSlop={4} accessibilityLabel="Open" style={({ hovered }) => ({ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: hovered ? colors.brand[50] : 'transparent' })}>
              <Ionicons name="open-outline" size={15} color={colors.brand[600]} />
            </Pressable>
          </Pressable>
          {columns.map((c, ci) => (
            <View key={c.id} dataSet={{ cell: `${t.id}:${ci}` }}>
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
        {open && kids.map((k) => renderRow(k, block, depth + 1))}
      </View>
    );
  };

  return (
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
                <Pressable disabled={!b.group.id || !canAdd} onPress={(e) => onGroupMenu(anchorOf(e), b.group)}>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: paletteHex(b.group.color) }}>{b.group.name}</Text>
                </Pressable>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>{b.top.length} {b.top.length === 1 ? board.board.item_word.toLowerCase() : `${board.board.item_word.toLowerCase()}s`}</Text>
              </View>
              {!isCollapsed && (
                <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden', backgroundColor: colors.white }}>
                  <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.gray[200] }}>
                    <View style={{ width: 6, backgroundColor: paletteHex(b.group.color) }} />
                    <View style={{ width: NAME_W - 6, height: 34, justifyContent: 'center', paddingLeft: spacing.lg + 18, borderRightWidth: 1, borderColor: colors.gray[200] }}>
                      <Text style={{ fontSize: 13, color: colors.gray[600], fontWeight: '500' }}>{board.board.item_word}</Text>
                    </View>
                    {columns.map((c) => <HeaderCell key={c.id} column={c} width={c.width} canManage={canManage} onMenu={(e, col) => onColumnMenu(anchorOf(e), col)} />)}
                    <Pressable
                      disabled={!canManage}
                      onPress={(e) => onAddColumn(anchorOf(e))}
                      accessibilityLabel="Add column"
                      style={({ hovered }) => ({ width: ADD_W, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
                    >
                      {canManage && <Ionicons name="add" size={18} color={colors.gray[600]} />}
                    </Pressable>
                  </View>
                  {b.top.map((t) => renderRow(t, b, 0))}
                  {canAdd && <AddItemRow color={b.group.color} word={board.board.item_word} width={NAME_W} onAdd={(title) => onAddItem(title, b.group.id)} />}
                  <SummaryRow items={b.top} columns={columns} values={values} colors={colors} nameWidth={NAME_W} />
                </View>
              )}
            </View>
          );
        })}
        {canAdd && (
          <Pressable onPress={onAddGroup} style={({ hovered }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: hovered ? colors.gray[100] : colors.white })}>
            <Ionicons name="add" size={16} color={colors.gray[700]} />
            <Text style={{ fontSize: 14, color: colors.gray[700] }}>Add new group</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScrollView>
  );
}
