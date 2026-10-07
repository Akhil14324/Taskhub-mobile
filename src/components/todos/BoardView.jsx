import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, DueChip, Avatar } from '../kit';
import { formatDuration, deadlineState } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';
import { makeDraggable } from '../../hooks/useWebReorder';
import { glass } from '../../theme/glass';

const COLUMN_WIDTH = 300;
const GAP = 14;
const PEEK = 26; // how much of the next column a phone shows, so it is clear you can swipe
const MARK_TOP = 'inset 0 3px 0 #dc2626';

/**
 * Kanban board laid out like Todoist's: each column fills the height and scrolls on its own, with
 * "Add task" under its cards. On a phone (`paged`) a column is nearly the screen wide, the board snaps
 * one column per swipe and dots underneath show where you are (the + adds a column).
 * A column is { key, title, icon?, items, canAdd?, section?, bucket? }; cards are to-dos. Drag a card to
 * another column (desktop) or use its move button (touch): onDrop(id, columnKey, ids) decides what that
 * means. Dragging inside a column reorders it; onReorder(ids) gets that column's new order of ids.
 * A card with sub-tasks opens them inside the card from its "1/3" chip (subtasksOf(todo) = its children).
 */
export default function BoardView({
  columns, progressOf, subtasksOf, onOpen, onToggle, onMove, onDrop, onReorder, onAdd, onAddColumn, onEditColumn,
  addColumnLabel = 'Add section', selectedId, currentUserId, paged = false, emptyText = 'No tasks yet',
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const handlers = useRef({ onDrop, onReorder });
  handlers.current = { onDrop, onReorder };
  const [height, setHeight] = useState(0);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const colWidth = paged ? Math.max(240, windowWidth - spacing.lg * 2 - PEEK) : COLUMN_WIDTH;
  const toggleExpanded = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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

  const goToPage = (i) => scrollRef.current?.scrollTo?.({ x: i * (colWidth + GAP), animated: true });
  const dotsH = paged ? 34 : 0;
  const colHeight = Math.max(260, height - dotsH - spacing.sm);

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={!paged}
        style={[{ flexGrow: 0 }, paged && styles.snap]}
        contentContainerStyle={[styles.board, paged && { paddingHorizontal: spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={paged ? (e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / (colWidth + GAP));
          if (i !== page) setPage(i);
        } : undefined}
      >
        <View ref={rootRef} style={styles.boardInner}>
          {columns.map((col) => (
            <View key={col.key} style={[styles.column, { width: colWidth, height: colHeight }, paged && styles.snapItem]} dataSet={{ boardCol: String(col.key) }}>
              <View style={styles.columnHead}>
                {!!col.icon && <Ionicons name={col.icon} size={15} color={colors.gray[500]} />}
                <Text style={styles.columnTitle} numberOfLines={1}>{col.title}</Text>
                <Text style={styles.columnCount}>{col.items.length}</Text>
                <View style={{ flex: 1 }} />
                {!!(col.section || col.bucket) && onEditColumn && (
                  <AnimatedPressable onPress={() => onEditColumn(col.section || col.bucket)} hitSlop={8} accessibilityLabel="Column options">
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[400]} />
                  </AnimatedPressable>
                )}
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.cards} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {col.items.map((t) => (
                  <Card
                    key={t.id}
                    todo={t}
                    colKey={col.key}
                    progress={progressOf?.(t)}
                    subtasks={expanded.has(t.id) ? subtasksOf?.(t) || [] : null}
                    onToggleSubtasks={() => toggleExpanded(t.id)}
                    selected={selectedId === t.id}
                    currentUserId={currentUserId}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onMove={onMove}
                    styles={styles}
                  />
                ))}
                {col.items.length === 0 && <Text style={styles.empty}>{emptyText}</Text>}
                {!paged && col.canAdd !== false && onAdd && (
                  <AnimatedPressable style={styles.addTask} onPress={() => onAdd(col)} accessibilityLabel={`Add task to ${col.title}`}>
                    <Ionicons name="add" size={19} color={colors.brand[600]} />
                    <Text style={styles.addTaskText}>Add task</Text>
                  </AnimatedPressable>
                )}
              </ScrollView>
              {paged && col.canAdd !== false && onAdd && (
                <AnimatedPressable {...glass('button')} style={styles.addTaskPill} onPress={() => onAdd(col)} accessibilityLabel={`Add task to ${col.title}`}>
                  <Ionicons name="add" size={20} color={colors.gray[700]} />
                  <Text style={styles.addTaskPillText}>Add task</Text>
                </AnimatedPressable>
              )}
            </View>
          ))}
          {onAddColumn && !paged && (
            <AnimatedPressable style={styles.addColumn} onPress={onAddColumn}>
              <Ionicons name="add" size={20} color={colors.brand[600]} />
              <Text style={styles.addColumnText}>{addColumnLabel}</Text>
            </AnimatedPressable>
          )}
        </View>
      </ScrollView>
      {paged && (
        <View style={styles.dots}>
          {columns.map((col, i) => (
            <Pressable key={col.key} onPress={() => goToPage(i)} hitSlop={6} accessibilityLabel={col.title}>
              <View style={[styles.dot, i === page && styles.dotOn]} />
            </Pressable>
          ))}
          {onAddColumn && (
            <Pressable onPress={onAddColumn} hitSlop={8} accessibilityLabel={addColumnLabel}>
              <Ionicons name="add" size={16} color={colors.gray[400]} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Card({ todo: t, colKey, progress, subtasks, onToggleSubtasks, selected, currentUserId, onOpen, onToggle, onMove, styles }) {
  const colors = useColors();
  const canTick = t.permissions ? t.permissions.can_change_status : true;
  const tag = t.review_state === 'proposed' ? 'Suggested'
    : t.status === 'in_review' && !t.is_done ? 'In review'
      : t.status === 'blocked' && !t.is_done ? 'Stuck'
        : t.status === 'on_hold' && !t.is_done ? 'On hold' : null;
  const deadline = deadlineState(t);
  const hasKids = !!progress && progress.total > 0;
  return (
    <View ref={makeDraggable} dataSet={{ boardCard: String(t.id), col: String(colKey) }} style={styles.cardWrap}>
      <View {...glass('card')} style={[styles.card, selected && styles.cardSelected]}>
        <Pressable onPress={() => onOpen(t)} style={styles.cardMain}>
          <View style={styles.cardTop}>
            <TodoCheckbox
              checked={t.is_done}
              priority={t.priority}
              onPress={() => (canTick ? onToggle(t) : onOpen(t))}
              size={20}
            />
            <Text style={[styles.cardTitle, t.is_done && styles.cardDone]} numberOfLines={3}>{t.title}</Text>
          </View>
          {!!t.notes && <Text style={styles.cardNotes} numberOfLines={2}>{t.notes}</Text>}
          <View style={styles.cardMeta}>
            {hasKids && (
              <AnimatedPressable onPress={onToggleSubtasks} hitSlop={6} style={styles.metaItem} accessibilityLabel={subtasks ? 'Hide sub-tasks' : 'Show sub-tasks'}>
                <Ionicons name="git-branch-outline" size={12} color={colors.gray[500]} />
                <Text style={styles.metaText}>{progress.done}/{progress.total}</Text>
                <Ionicons name={subtasks ? 'chevron-down' : 'chevron-forward'} size={11} color={colors.gray[500]} />
              </AnimatedPressable>
            )}
            {t.comment_count > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="chatbox-outline" size={12} color={colors.gray[500]} />
                <Text style={styles.metaText}>{t.comment_count}</Text>
              </View>
            )}
            <DueChip date={t.due_date} time={t.due_time} recurrence={t.recurrence} done={t.is_done} compact />
            {!!deadline && (
              <View style={styles.metaItem}>
                <Ionicons name="alert-circle" size={11} color={deadline.color} />
                <Text style={[styles.metaText, { color: deadline.color, fontWeight: '800' }]}>{deadline.label}</Text>
              </View>
            )}
            {!!t.duration_minutes && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={11} color={colors.gray[500]} />
                <Text style={styles.metaText}>{formatDuration(t.duration_minutes)}</Text>
              </View>
            )}
            {(t.labels || []).slice(0, 3).map((l) => (
              <View key={l} style={styles.metaItem}>
                <Ionicons name="pricetag-outline" size={11} color={colors.brand[600]} />
                <Text style={[styles.metaText, { color: colors.brand[600] }]}>{l}</Text>
              </View>
            ))}
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
                <Ionicons name="swap-horizontal" size={16} color={colors.gray[400]} />
              </AnimatedPressable>
            )}
          </View>
        </Pressable>
        {!!subtasks && subtasks.map((s) => (
          <Pressable key={s.id} onPress={() => onOpen(s)} style={styles.sub}>
            <TodoCheckbox
              checked={s.is_done}
              priority={s.priority}
              onPress={() => ((s.permissions ? s.permissions.can_change_status : true) ? onToggle(s) : onOpen(s))}
              size={18}
            />
            <Text style={[styles.subTitle, s.is_done && styles.cardDone]} numberOfLines={2}>{s.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const BOARD_STATUS_COLUMNS = ['todo', 'in_progress', 'in_review', 'blocked', 'on_hold', 'done'].map((key) => ({
  key,
  title: STATUS[key].label,
  icon: STATUS[key].icon,
}));

const createStyles = (colors) => StyleSheet.create({
  board: { paddingRight: spacing.lg },
  // Phones: the board snaps one column per swipe (CSS scroll snap; react-native-web passes it through).
  snap: { scrollSnapType: 'x mandatory', scrollPaddingLeft: spacing.lg },
  snapItem: { scrollSnapAlign: 'start' },
  boardInner: { flexDirection: 'row', gap: GAP, alignItems: 'flex-start' },
  column: { borderRadius: radius.lg },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.md },
  columnTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  columnCount: { fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '500' },
  cards: { paddingBottom: spacing.lg },
  cardWrap: { marginBottom: spacing.sm, borderRadius: radius.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    overflow: 'hidden',
  },
  cardMain: { padding: spacing.md },
  cardSelected: { borderColor: colors.brand[500], borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.base, color: colors.gray[900], lineHeight: 20, fontWeight: '400' },
  cardNotes: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2, marginLeft: 20 + spacing.sm, lineHeight: 16 },
  cardDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, marginLeft: 20 + spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: colors.brand[100] },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.brand[700] },
  sub: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 9, paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200],
  },
  subTitle: { flex: 1, fontSize: fontSize.sm, color: colors.gray[800], lineHeight: 18 },
  empty: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  addTask: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  addTaskText: { fontSize: fontSize.sm, color: colors.gray[500] },
  addTaskPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginTop: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.gray[100],
  },
  addTaskPillText: { fontSize: fontSize.base, color: colors.gray[700], fontWeight: '500' },
  addColumn: { width: 220, height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm },
  addColumnText: { color: colors.gray[500], fontWeight: '500', fontSize: fontSize.base },
  dots: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gray[300] },
  dotOn: { backgroundColor: colors.gray[700] },
});
