import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { TodoCheckbox, DueChip, AvatarStack, accent } from '../kit';
import { HealthPill } from './TimeHealth';
import { daysFromToday, formatDue } from '../../utils/dates';
import { formatDuration } from '../../utils/todoMeta';
import { todoHealth, todoMetrics, formatSecondsShort, HEALTH } from '../../utils/timeline';

const SWIPE_TRIGGER = 90;

/**
 * One to-do row. Swipe right to complete, swipe left to delete, tap to open.
 * `indent` draws it as a sub-task; `selectMode` turns taps into selection (bulk actions).
 */
function TodoItem({
  todo, list, showList, currentUserId, highlighted, onToggle, onOpen, onDelete,
  progress, indent, parentTitle, selectMode, selected, onSelect, collapsed, onToggleCollapse, dragHandle, now,
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateX = useSharedValue(0);
  const flash = useSharedValue(0);

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
      if (e.translationX > SWIPE_TRIGGER) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        runOnJS(onToggle)(todo);
      } else if (e.translationX < -SWIPE_TRIGGER) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        runOnJS(onDelete)(todo);
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 260 });
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
  const fromSomeoneElse = todo.created_by !== currentUserId;
  const labels = todo.labels || [];
  const deadlineDiff = todo.deadline_date ? daysFromToday(todo.deadline_date) : null;
  const deadlineColor = todo.is_done ? colors.gray[400] : deadlineDiff < 0 ? '#991b1b' : deadlineDiff <= 1 ? '#dc2626' : colors.gray[500];
  const hasSubtasks = progress && progress.total > 0;

  // Time status: a coloured pill for anything that is blocked, running late or about to be.
  const health = useMemo(() => todoHealth(todo, now || Date.now()), [todo, now]);
  const timePill = useMemo(() => {
    const at = now || Date.now();
    if (todo.is_done) {
      return health.level === 'red' || health.level === 'orange' ? { level: health.level, label: health.reasons[0] } : null;
    }
    if (todo.status === 'blocked') {
      const blocked = todoMetrics(todo, at).status_s.blocked;
      return { level: health.level === 'red' ? 'red' : 'orange', label: `Blocked ${formatSecondsShort(blocked)}`, icon: 'hand-left' };
    }
    if (health.level === 'red' || health.level === 'orange') return { level: health.level, label: health.reasons[0] || HEALTH[health.level].label };
    if (todo.status === 'in_progress') {
      return { level: health.level === 'green' ? 'green' : 'none', label: `In progress ${formatSecondsShort(todoMetrics(todo, at).status_s.in_progress)}`, icon: 'play' };
    }
    return null;
  }, [todo, health, now]);
  const assigneeElsewhere = !!todo.assignee_id && todo.assignee_id !== currentUserId && !!todo.assignee_name;

  return (
    <View style={[styles.container, indent && styles.indent]}>
      <Animated.View style={[styles.swipeBg, styles.swipeLeft, leftBg]}>
        <Ionicons name={todo.is_done ? 'arrow-undo' : 'checkmark-circle'} size={24} color="#fff" />
        <Text style={styles.swipeText}>{todo.is_done ? 'Undo' : 'Done'}</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeRight, rightBg]}>
        <Text style={styles.swipeText}>Delete</Text>
        <Ionicons name="trash" size={22} color="#fff" />
      </Animated.View>

      {/* touchAction keeps vertical page scrolling working on touch screens (web). */}
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={[styles.row, selected && styles.rowSelected, rowStyle]}>
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
              <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => onToggle(todo)} size={indent ? 19 : 22} />
            )}
          </View>
          <Pressable style={styles.body} onPress={() => (selectMode ? onSelect?.(todo) : onOpen(todo))}>
            {!!parentTitle && (
              <Text style={styles.parentHint} numberOfLines={1}>in {parentTitle}</Text>
            )}
            <Text
              style={[styles.title, indent && styles.titleSub, todo.is_done && styles.titleDone]}
              numberOfLines={3}
            >
              {todo.title}
            </Text>
            {!!todo.notes && (
              <Text style={styles.notes} numberOfLines={1}>{todo.notes}</Text>
            )}
            <View style={styles.metaRow}>
              <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} compact />
              {!!todo.deadline_date && (
                <View style={styles.metaItem}>
                  <Ionicons name="alert-circle-outline" size={12} color={deadlineColor} />
                  <Text style={[styles.metaText, { color: deadlineColor, fontWeight: '600' }]} numberOfLines={1}>
                    Deadline {formatDue(todo.deadline_date)}
                  </Text>
                </View>
              )}
              {!!todo.duration_minutes && (
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={12} color={colors.gray[500]} />
                  <Text style={styles.metaText}>{formatDuration(todo.duration_minutes)}</Text>
                </View>
              )}
              {hasSubtasks && (
                <View style={styles.metaItem}>
                  <Ionicons name="git-branch-outline" size={12} color={progress.done === progress.total ? colors.brand[600] : colors.gray[500]} />
                  <Text style={styles.metaText}>{progress.done}/{progress.total}</Text>
                </View>
              )}
              {todo.comment_count > 0 && (
                <View style={styles.metaItem}>
                  <Ionicons name="chatbubble-outline" size={11} color={colors.gray[500]} />
                  <Text style={styles.metaText}>{todo.comment_count}</Text>
                </View>
              )}
              {!!timePill && <HealthPill level={timePill.level} label={timePill.label} icon={timePill.icon} compact />}
              {fromSomeoneElse && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-circle-outline" size={12} color={colors.brand[500]} />
                  <Text style={[styles.metaText, { color: colors.brand[500] }]} numberOfLines={1}>from {todo.created_by_name?.split(' ')[0]}</Text>
                </View>
              )}
              {assigneeElsewhere && (
                <View style={styles.metaItem}>
                  <Ionicons name="arrow-forward-circle-outline" size={12} color={colors.gray[500]} />
                  <Text style={styles.metaText} numberOfLines={1}>{todo.assignee_name.split(' ')[0]}</Text>
                </View>
              )}
              {todo.is_done && todo.done_by && todo.done_by !== currentUserId && (
                <Text style={styles.metaText}>ticked by {todo.done_by_name?.split(' ')[0]}</Text>
              )}
              <View style={{ flex: 1 }} />
              {showList && list && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaText} numberOfLines={1}>{list.emoji || ''} {list.name}</Text>
                  <View style={[styles.listDot, { backgroundColor: accent(list.color) }]} />
                </View>
              )}
              {others.length > 0 && <AvatarStack people={others} size={18} />}
            </View>
            {labels.length > 0 && (
              <View style={styles.labelRow}>
                {labels.slice(0, 4).map((l) => (
                  <Text key={l} style={styles.label}>+{l}</Text>
                ))}
                {labels.length > 4 && <Text style={styles.metaText}>+{labels.length - 4}</Text>}
              </View>
            )}
          </Pressable>
          {hasSubtasks && onToggleCollapse && !selectMode && (
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
  container: { position: 'relative' },
  indent: { marginLeft: spacing.xl },
  swipeBg: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    borderRadius: 12,
  },
  swipeLeft: { backgroundColor: '#dc2626', justifyContent: 'flex-start' },
  swipeRight: { backgroundColor: '#dc2626', justifyContent: 'flex-end' },
  swipeText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
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
  check: { paddingTop: 1, paddingRight: spacing.md, paddingLeft: spacing.xs },
  body: { flex: 1 },
  parentHint: { fontSize: 11, color: colors.gray[400], marginBottom: 1 },
  title: { fontSize: fontSize.md, color: colors.gray[900], lineHeight: 21 },
  titleSub: { fontSize: fontSize.base },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  notes: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4, minHeight: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 160 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  listDot: { width: 7, height: 7, borderRadius: 4 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 3 },
  label: { fontSize: 11, fontWeight: '600', color: colors.brand[600] },
  chevron: { paddingLeft: spacing.sm, paddingTop: 2 },
});

export default memo(TodoItem);
