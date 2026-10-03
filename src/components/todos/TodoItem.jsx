import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useEngage } from '../../context/EngageContext';
import { spacing, fontSize } from '../../theme/theme';
import { TodoCheckbox, DueChip, AvatarStack, Avatar, ListGlyph } from '../kit';
import { daysFromToday, formatDue, timeAgo } from '../../utils/dates';
import { deadlineState } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';

const SWIPE_TRIGGER = 90;
const INDENT = 22;

/** Short text tag for states that are not "just open". */
function stateTag(todo) {
  if (todo.review_state === 'proposed') return { label: 'Suggested', icon: 'git-pull-request-outline' };
  if (todo.review_state === 'rejected') return { label: 'Declined', icon: 'close-circle-outline' };
  if (todo.status === 'in_review' && !todo.is_done) return { label: 'In review', icon: STATUS.in_review.icon };
  if (todo.status === 'on_hold' && !todo.is_done) return { label: 'On hold', icon: STATUS.on_hold.icon };
  return null;
}

/**
 * One to-do row. Swipe right to complete, swipe left to delete, tap to open.
 * `depth` indents it as a sub-task (any level); `selectMode` turns taps into selection (bulk actions);
 * `active` marks the row open in the desktop detail pane.
 */
function TodoItem({
  todo, list, showList, showBusiness, currentUserId, highlighted, active, onToggle, onOpen, onDelete,
  progress, depth = 0, parentTitle, selectMode, selected, onSelect, collapsed, onToggleCollapse, dragHandle, now,
  hasChildren,
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user: me } = useAuth();
  const { waitingIds } = useEngage();
  const simple = me?.preferences?.viewMode === 'simple'; // Simple view: only title, date, owner and progress
  const translateX = useSharedValue(0);
  const flash = useSharedValue(0);
  const canTick = todo.permissions ? todo.permissions.can_change_status : true;

  useEffect(() => {
    if (highlighted) {
      flash.value = withSequence(withTiming(1, { duration: 250 }), withTiming(0.4, { duration: 500 }), withTiming(1, { duration: 400 }), withTiming(0, { duration: 900 }));
    }
  }, [highlighted, flash]);

  const pan = Gesture.Pan()
    .enabled(!selectMode)
    .activeOffsetX([-16, 16])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_TRIGGER && canTick) {
        runOnJS(onToggle)(todo);
      } else if (e.translationX < -SWIPE_TRIGGER) {
        runOnJS(onDelete)(todo);
      }
      translateX.value = withTiming(0, { duration: 160 });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const leftBg = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
  }));
  const rightBg = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_TRIGGER, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.18 }));

  const others = (todo.members || []).filter((m) => m.id !== currentUserId);
  const fromSomeoneElse = !todo.business_id && todo.created_by !== currentUserId;
  const labels = todo.labels || [];
  const near = deadlineState(todo);
  const deadlineColor = todo.is_done ? colors.gray[400] : near ? near.color : colors.gray[500];
  const hasSubtasks = progress && progress.total > 0;
  const tag = stateTag(todo);

  const assignee = todo.assignee_id && todo.assignee_id !== currentUserId && todo.assignee_name ? todo : null;
  const doneLine = todo.is_done && todo.done_at
    ? `Completed${todo.done_by_name ? ` by ${todo.done_by === currentUserId ? 'you' : todo.done_by_name.split(' ')[0]}` : ''} · ${timeAgo(todo.done_at)}`
    : null;

  return (
    <View style={[styles.container, depth > 0 && { marginLeft: Math.min(depth, 5) * INDENT }]} dataSet={{ todoRow: String(todo.id) }}>
      <Animated.View style={[styles.swipeBg, styles.swipeLeft, leftBg]}>
        <Ionicons name={todo.is_done ? 'arrow-undo' : 'checkmark-circle'} size={22} color="#fff" />
        <Text style={styles.swipeText}>{todo.is_done ? 'Undo' : 'Done'}</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeRight, rightBg]}>
        <Text style={styles.swipeText}>{todo.business_id && !todo.permissions?.can_delete ? 'Ask to delete' : 'Delete'}</Text>
        <Ionicons name="trash" size={20} color="#fff" />
      </Animated.View>

      {/* touchAction keeps vertical page scrolling working on touch screens (web). */}
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={[styles.row, selected && styles.rowSelected, active && styles.rowActive, rowStyle]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.brand[500] }, flashStyle]} />
          {dragHandle}
          <View style={styles.check}>
            {selectMode ? (
              <Pressable onPress={() => onSelect?.(todo)} hitSlop={10}>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? colors.brand[600] : colors.gray[400]}
                />
              </Pressable>
            ) : (
              <TodoCheckbox
                checked={todo.is_done}
                priority={todo.priority}
                onPress={() => (canTick ? onToggle(todo) : onOpen(todo))}
                size={depth > 0 ? 19 : 22}
              />
            )}
          </View>
          <Pressable style={styles.body} onPress={() => (selectMode ? onSelect?.(todo) : onOpen(todo))}>
            {!!parentTitle && (
              <Text style={styles.parentHint} numberOfLines={1}>in {parentTitle}</Text>
            )}
            <Text
              style={[styles.title, depth > 0 && styles.titleSub, todo.is_done && styles.titleDone]}
              numberOfLines={3}
            >
              {todo.title}
            </Text>
            {!simple && !!todo.notes && !todo.is_done && (
              <Text style={styles.notes} numberOfLines={1}>{todo.notes}</Text>
            )}
            {!!doneLine && <Text style={styles.doneLine}>{doneLine}</Text>}
            <View style={styles.metaRow}>
              <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} compact />
              {!!todo.deadline_date && (
                <View style={styles.metaItem}>
                  <Ionicons name="alert-circle-outline" size={12} color={deadlineColor} />
                  <Text style={[styles.metaText, { color: deadlineColor, fontWeight: near ? '800' : '600' }]} numberOfLines={1}>
                    {near ? near.label : `Deadline ${formatDue(todo.deadline_date)}`}
                  </Text>
                </View>
              )}
              {hasSubtasks && (
                <View style={styles.metaItem}>
                  <Ionicons name="git-branch-outline" size={12} color={progress.done === progress.total ? colors.brand[600] : colors.gray[500]} />
                  <Text style={styles.metaText}>{progress.done}/{progress.total}</Text>
                </View>
              )}
              {!simple && todo.comment_count > 0 && (
                <View style={styles.metaItem}>
                  <Ionicons name="chatbubble-outline" size={11} color={colors.gray[500]} />
                  <Text style={styles.metaText}>{todo.comment_count}</Text>
                </View>
              )}
              {!!tag && (
                <View style={styles.tag}>
                  <Ionicons name={tag.icon} size={11} color={colors.brand[700]} />
                  <Text style={styles.tagText}>{tag.label}</Text>
                </View>
              )}
              {!todo.is_done && waitingIds.has(todo.id) && (
                <View style={styles.waiting}>
                  <Ionicons name="hourglass" size={10} color="#fff" />
                  <Text style={styles.waitingText}>Waiting on you</Text>
                </View>
              )}
              {todo.is_warned && !todo.is_done && (
                <View style={styles.metaItem}>
                  <Ionicons name="warning" size={12} color={colors.red[600]} />
                  <Text style={[styles.metaText, { color: colors.red[600], fontWeight: '600' }]}>Warned</Text>
                </View>
              )}
              {fromSomeoneElse && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-circle-outline" size={12} color={colors.brand[500]} />
                  <Text style={[styles.metaText, { color: colors.brand[500] }]} numberOfLines={1}>from {todo.created_by_name?.split(' ')[0]}</Text>
                </View>
              )}
              {!!assignee && (
                <View style={styles.metaItem}>
                  <Avatar name={assignee.assignee_name} uri={assignee.assignee_picture} size={16} />
                  <Text style={styles.metaText} numberOfLines={1}>{assignee.assignee_name.split(' ')[0]}</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              {showBusiness && !!todo.business_name && (
                <View style={styles.metaItem}>
                  <Ionicons name="briefcase-outline" size={11} color={colors.gray[500]} />
                  <Text style={styles.metaText} numberOfLines={1}>{todo.business_name}</Text>
                </View>
              )}
              {showList && list && (
                <View style={styles.metaItem}>
                  <ListGlyph list={list} size={11} color={colors.gray[500]} />
                  <Text style={styles.metaText} numberOfLines={1}>{list.name}</Text>
                </View>
              )}
              {!todo.business_id && others.length > 0 && <AvatarStack people={others} size={18} />}
            </View>
            {!simple && labels.length > 0 && (
              <View style={styles.labelRow}>
                {labels.slice(0, 4).map((l) => (
                  <Text key={l} style={styles.label}>+{l}</Text>
                ))}
                {labels.length > 4 && <Text style={styles.metaText}>+{labels.length - 4}</Text>}
              </View>
            )}
          </Pressable>
          {(hasChildren || hasSubtasks) && onToggleCollapse && !selectMode && (
            <Pressable onPress={() => onToggleCollapse(todo)} hitSlop={10} style={styles.chevron}>
              <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={18} color={colors.gray[400]} />
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brand[600], paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  waitingText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  container: { position: 'relative' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.gray[200], marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.brand[500] },
  swipeBg: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    borderRadius: 10,
  },
  swipeLeft: { backgroundColor: '#dc2626', justifyContent: 'flex-start' },
  swipeRight: { backgroundColor: '#dc2626', justifyContent: 'flex-end' },
  swipeText: { color: '#fff', fontWeight: '600', fontSize: fontSize.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.gray[50],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
    overflow: 'hidden',
  },
  rowSelected: { backgroundColor: colors.brand[50] },
  rowActive: { backgroundColor: colors.brand[50] },
  check: { paddingTop: 1, paddingRight: spacing.md, paddingLeft: spacing.xs },
  body: { flex: 1 },
  parentHint: { fontSize: 11, color: colors.gray[400], marginBottom: 1 },
  title: { fontSize: fontSize.md, color: colors.gray[900], lineHeight: 21, fontWeight: '500' },
  titleSub: { fontSize: fontSize.base },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400], fontWeight: '400' },
  notes: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  doneLine: { fontSize: 11, color: colors.gray[400], marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4, minHeight: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 160 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, backgroundColor: colors.brand[100],
  },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.brand[700] },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 3 },
  label: { fontSize: 11, fontWeight: '600', color: colors.brand[600] },
  chevron: { paddingLeft: spacing.sm, paddingTop: 2 },
});

export default memo(TodoItem);
export { INDENT };
