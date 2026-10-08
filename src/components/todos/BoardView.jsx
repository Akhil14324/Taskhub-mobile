import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, DueChip, Avatar, PRIORITY } from '../kit';
import { formatDuration, deadlineState } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';
import { makeDraggable } from '../../hooks/useWebReorder';
import { glass } from '../../theme/glass';

const COLUMN_WIDTH = 288;
const MARK_TOP = 'inset 0 3px 0 #dc2626';

/**
 * Kanban board. A column is { key, title, icon?, items, accepts?, canAdd?, section? }; cards are
 * to-dos. Drag a card to another column (desktop) or use its move button (touch): onMove(todo, column)
 * decides what that means (change status, assignee, priority or section). Dragging inside a column
 * reorders it; onReorder(ids) gets that column's new order of ids, which is saved for the viewer.
 */
export default function BoardView({
  columns, progressOf, onOpen, onToggle, onMove, onDrop, onReorder, onReorderColumns, onAdd, onAddColumn, onEditColumn, onStarter, selectedId,
  currentUserId, emptyText = 'Nothing here',
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rootRef = useRef(null);
  const handlers = useRef({ onDrop, onReorder, onReorderColumns });
  handlers.current = { onDrop, onReorder, onReorderColumns };

  // Drag a column by its title to a new place (desktop; on touch the column menu has Move earlier / later).
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const root = rootRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;
    let dragged = null;
    let mark = null;
    let place = null;
    const colOf = (el) => (el && el.closest ? el.closest('[data-col-section]') : null);
    const clear = () => { if (mark) mark.style.boxShadow = ''; mark = null; };
    const onStart = (e) => {
      const handle = e.target && e.target.closest ? e.target.closest('[data-col-handle]') : null;
      const col = colOf(handle);
      if (!col) return;
      dragged = col;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', col.dataset.colSection);
      if (e.dataTransfer.setDragImage && handle) e.dataTransfer.setDragImage(handle, 20, 14);
      col.style.opacity = '0.5';
    };
    const onOver = (e) => {
      if (!dragged) return;
      const col = colOf(e.target);
      clear();
      if (!col || col === dragged) { place = null; return; }
      e.preventDefault();
      const rect = col.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      place = { target: col, after };
      mark = col;
      col.style.boxShadow = after ? 'inset -3px 0 0 #dc2626' : 'inset 3px 0 0 #dc2626';
    };
    const onDropCol = (e) => {
      if (!dragged || !place) return;
      e.preventDefault();
      const others = [...root.querySelectorAll('[data-col-section]')].filter((c) => c !== dragged);
      others.splice(others.indexOf(place.target) + (place.after ? 1 : 0), 0, dragged);
      const ids = others.map((c) => Number(c.dataset.colSection));
      clear();
      place = null;
      handlers.current.onReorderColumns?.(ids);
    };
    const onEnd = () => { if (dragged) dragged.style.opacity = ''; clear(); dragged = null; place = null; };
    root.addEventListener('dragstart', onStart);
    root.addEventListener('dragover', onOver);
    root.addEventListener('drop', onDropCol);
    root.addEventListener('dragend', onEnd);
    return () => {
      root.removeEventListener('dragstart', onStart);
      root.removeEventListener('dragover', onOver);
      root.removeEventListener('drop', onDropCol);
      root.removeEventListener('dragend', onEnd);
      onEnd();
    };
  }, []);

  // Drag and drop (desktop browsers).
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const root = rootRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;
    let dragId = null;
    let fromCol = null;
    let mark = null;
    let hoverCol = null;

    const cardOf = (el) => (el && el.closest ? el.closest('[data-board-card]') : null);
    const colOf = (el) => (el && el.closest ? el.closest('[data-board-col]') : null);
    const clear = () => {
      if (mark) mark.style.boxShadow = '';
      if (hoverCol) hoverCol.style.outline = '';
      mark = null;
      hoverCol = null;
    };
    /** The card the dragged one would land before (null = at the end of the column). */
    const beforeCard = (col, y) => {
      const cards = [...col.querySelectorAll('[data-board-card]')].filter((c) => c.dataset.boardCard !== String(dragId));
      return cards.find((c) => {
        const r = c.getBoundingClientRect();
        return y < r.top + r.height / 2;
      }) || null;
    };

    const onDragStart = (e) => {
      const card = cardOf(e.target);
      if (!card) return;
      dragId = Number(card.dataset.boardCard);
      fromCol = card.dataset.col;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
      card.style.opacity = '0.45';
    };
    const onDragOver = (e) => {
      if (dragId == null) return;
      const col = colOf(e.target);
      if (!col) return;
      e.preventDefault();
      clear();
      hoverCol = col;
      col.style.outline = '2px dashed #dc2626';
      col.style.outlineOffset = '-2px';
      const before = beforeCard(col, e.clientY);
      if (before) {
        mark = before;
        before.style.boxShadow = MARK_TOP;
      }
    };
    const onDropEvent = (e) => {
      if (dragId == null) return;
      const col = colOf(e.target);
      if (!col) return;
      e.preventDefault();
      const before = beforeCard(col, e.clientY);
      const ids = [...col.querySelectorAll('[data-board-card]')]
        .map((c) => Number(c.dataset.boardCard))
        .filter((id) => id !== dragId);
      const at = before ? ids.indexOf(Number(before.dataset.boardCard)) : ids.length;
      ids.splice(at, 0, dragId);
      const toCol = col.dataset.boardCol;
      const id = dragId;
      clear();
      if (toCol === fromCol) handlers.current.onReorder?.(ids, toCol);
      else handlers.current.onDrop?.(id, toCol, ids);
    };
    const onDragEnd = (e) => {
      const card = cardOf(e.target);
      if (card) card.style.opacity = '';
      clear();
      dragId = null;
      fromCol = null;
    };
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDropEvent);
    root.addEventListener('dragend', onDragEnd);
    return () => {
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDropEvent);
      root.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.board} keyboardShouldPersistTaps="handled">
      <View ref={rootRef} style={styles.boardInner}>
        {columns.map((col) => (
          <View key={col.key} style={styles.column} dataSet={col.section && onReorderColumns ? { boardCol: String(col.key), colSection: String(col.section.id) } : { boardCol: String(col.key) }}>
            <View
              ref={col.section && onReorderColumns ? makeDraggable : undefined}
              dataSet={col.section && onReorderColumns ? { colHandle: '1' } : undefined}
              style={[styles.columnHead, col.section && onReorderColumns && { cursor: 'grab' }]}
            >
              {!!col.icon && <Ionicons name={col.icon} size={15} color={colors.gray[500]} />}
              <Text style={styles.columnTitle} numberOfLines={1}>{col.title}</Text>
              <Text style={styles.columnCount}>{col.items.length}</Text>
              <View style={{ flex: 1 }} />
              {!!col.section && onEditColumn && (
                <AnimatedPressable onPress={() => onEditColumn(col.section)} hitSlop={8}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[400]} />
                </AnimatedPressable>
              )}
              {col.canAdd !== false && onAdd && (
                <AnimatedPressable onPress={() => onAdd(col)} hitSlop={8}>
                  <Ionicons name="add" size={22} color={colors.gray[500]} />
                </AnimatedPressable>
              )}
            </View>
            {!!col.section?.description && <Text style={styles.columnNote}>{col.section.description}</Text>}
            <View style={styles.cards}>
              {col.items.map((t) => (
                <Card
                  key={t.id}
                  todo={t}
                  colKey={col.key}
                  progress={progressOf?.(t)}
                  selected={selectedId === t.id}
                  currentUserId={currentUserId}
                  onOpen={onOpen}
                  onToggle={onToggle}
                  onMove={onMove}
                  styles={styles}
                />
              ))}
              {col.items.length === 0 && <Text style={styles.empty}>{emptyText}</Text>}
            </View>
          </View>
        ))}
        {onStarter && (
          <AnimatedPressable style={styles.addColumn} onPress={onStarter}>
            <Ionicons name="sparkles-outline" size={18} color={colors.brand[600]} />
            <Text style={styles.addColumnText}>Start with 3 sections</Text>
          </AnimatedPressable>
        )}
        {onAddColumn && (
          <AnimatedPressable style={styles.addColumn} onPress={onAddColumn}>
            <Ionicons name="add" size={20} color={colors.brand[600]} />
            <Text style={styles.addColumnText}>Add section</Text>
          </AnimatedPressable>
        )}
      </View>
    </ScrollView>
  );
}

function Card({ todo: t, colKey, progress, selected, currentUserId, onOpen, onToggle, onMove, styles }) {
  const colors = useColors();
  const canTick = t.permissions ? t.permissions.can_change_status : true;
  const tag = t.review_state === 'proposed' ? 'Suggested'
    : t.status === 'in_review' && !t.is_done ? 'In review'
      : t.status === 'blocked' && !t.is_done ? 'Stuck'
        : t.status === 'on_hold' && !t.is_done ? 'On hold' : null;
  return (
    <View ref={makeDraggable} dataSet={{ boardCard: String(t.id), col: String(colKey) }} style={styles.cardWrap}>
      <Pressable {...glass('card')} style={[styles.card, selected && styles.cardSelected]} onPress={() => onOpen(t)}>
        <View style={styles.cardTop}>
          <TodoCheckbox
            checked={t.is_done}
            priority={t.priority}
            onPress={() => (canTick ? onToggle(t) : onOpen(t))}
            size={20}
          />
          <Text style={[styles.cardTitle, t.is_done && styles.cardDone]} numberOfLines={3}>{t.title}</Text>
        </View>
        <View style={styles.cardMeta}>
          <DueChip date={t.due_date} time={t.due_time} recurrence={t.recurrence} done={t.is_done} compact />
          {!!deadlineState(t) && (
            <View style={styles.metaItem}>
              <Ionicons name="alert-circle" size={11} color={deadlineState(t).color} />
              <Text style={[styles.metaText, { color: deadlineState(t).color, fontWeight: '800' }]}>{deadlineState(t).label}</Text>
            </View>
          )}
          {t.priority < 4 && !t.is_done && (
            <View style={styles.metaItem}>
              <Ionicons name="flag" size={11} color={PRIORITY[t.priority].color} />
              <Text style={[styles.metaText, { color: PRIORITY[t.priority].color, fontWeight: '700' }]}>{PRIORITY[t.priority].short}</Text>
            </View>
          )}
          {!!t.duration_minutes && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={11} color={colors.gray[500]} />
              <Text style={styles.metaText}>{formatDuration(t.duration_minutes)}</Text>
            </View>
          )}
          {!!progress && progress.total > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="git-branch-outline" size={11} color={colors.gray[500]} />
              <Text style={styles.metaText}>{progress.done}/{progress.total} · {Math.round((progress.done / progress.total) * 100)}%</Text>
            </View>
          )}
          {t.comment_count > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="chatbubble-outline" size={11} color={colors.gray[500]} />
              <Text style={styles.metaText}>{t.comment_count}</Text>
            </View>
          )}
          {!!tag && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {!!t.assignee_name && t.assignee_id !== currentUserId && (
            <Avatar name={t.assignee_name} uri={t.assignee_picture} size={20} />
          )}
          {onMove && (
            <AnimatedPressable onPress={() => onMove(t)} hitSlop={8} accessibilityLabel="Move to another column">
              <Ionicons name="swap-horizontal" size={17} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </View>
        {(t.labels || []).length > 0 && (
          <View style={styles.labels}>
            {t.labels.slice(0, 3).map((l) => <Text key={l} style={styles.label}>+{l}</Text>)}
          </View>
        )}
      </Pressable>
    </View>
  );
}

export const BOARD_STATUS_COLUMNS = ['todo', 'in_progress', 'in_review', 'blocked', 'on_hold', 'done'].map((key) => ({
  key,
  title: STATUS[key].label,
  icon: STATUS[key].icon,
}));

const createStyles = (colors) => StyleSheet.create({
  board: { paddingBottom: spacing.xl, paddingRight: spacing.lg, minHeight: 320 },
  boardInner: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  column: {
    width: COLUMN_WIDTH, backgroundColor: colors.gray[100], borderRadius: radius.xl, padding: spacing.sm,
    minHeight: 120,
  },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  columnTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800], maxWidth: 160 },
  columnNote: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  columnCount: { fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '600' },
  cards: { minHeight: 40 },
  cardWrap: { marginBottom: spacing.sm, borderRadius: radius.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  cardSelected: { borderColor: colors.brand[500], borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.base, color: colors.gray[900], lineHeight: 19, fontWeight: '500' },
  cardDone: { textDecorationLine: 'line-through', color: colors.gray[400], fontWeight: '400' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: colors.brand[100] },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.brand[700] },
  labels: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  label: { fontSize: 11, fontWeight: '600', color: colors.brand[600] },
  empty: { fontSize: fontSize.sm, color: colors.gray[400], textAlign: 'center', paddingVertical: spacing.lg },
  addColumn: {
    width: 150,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
  },
  addColumnText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
});
