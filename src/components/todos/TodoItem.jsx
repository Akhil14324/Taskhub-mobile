import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useEngage } from '../../context/EngageContext';
import { spacing, fontSize, radius } from '../../theme/theme';
import { glass } from '../../theme/glass';
import { SPRING, project, rubberband } from '../../theme/motion';
import { haptic as webHaptic } from '../../utils/feedback';
import { TodoCheckbox, DueChip, AvatarStack, Avatar, ListGlyph } from '../kit';
import { daysFromToday, formatDue, timeAgo } from '../../utils/dates';
import { deadlineState } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';

const ACTION_W = 84;          // a swipe opens this far and rests on its glass action button
const COMMIT_PROJECTED = 230; // a flick that would carry past this commits the action outright
const COMMIT_VISUAL = 170;    // past here the button swells and ticks: the point of no return
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

  const startX = useSharedValue(0);
  const width = useSharedValue(360);
  const dragging = useSharedValue(false);
  const tick = () => webHaptic('light');
  const closeRow = () => { translateX.value = withSpring(0, SPRING.smooth); };

  const pan = Gesture.Pan()
    .enabled(!selectMode)
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onStart(() => {
      // Grab it wherever it is (mid-spring or resting open): never snap back to 0 first.
      startX.value = translateX.value;
      dragging.value = true;
    })
    .onUpdate((e) => {
      let x = startX.value + e.translationX;
      if (!canTick && x > 0) x = 0;
      const limit = width.value * 0.82;
      if (Math.abs(x) > limit) x = (x < 0 ? -1 : 1) * (limit + rubberband(Math.abs(x) - limit, width.value));
      translateX.value = x;
    })
    .onEnd((e) => {
      dragging.value = false;
      // Where the flick is heading, not where the finger let go; then hand its velocity to the spring.
      let end = translateX.value + project(e.velocityX, 0.99);
      if (!canTick && end > 0) end = 0;
      const spring = { ...SPRING.momentum, velocity: e.velocityX };
      if (end > COMMIT_PROJECTED && canTick) {
        runOnJS(onToggle)(todo);
        translateX.value = withSpring(0, spring);
      } else if (end < -COMMIT_PROJECTED) {
        runOnJS(onDelete)(todo);
        translateX.value = withSpring(0, spring);
      } else if (end > ACTION_W * 0.5 && canTick) {
        translateX.value = withSpring(ACTION_W, spring);
      } else if (end < -ACTION_W * 0.5) {
        translateX.value = withSpring(-ACTION_W, spring);
      } else {
        translateX.value = withSpring(0, spring);
      }
    });

  const swell = useSharedValue(0);
  useAnimatedReaction(
    () => Math.abs(translateX.value) > COMMIT_VISUAL,
    (past, was) => {
      swell.value = withSpring(past ? 1 : 0, SPRING.press);
      if (past && !was && dragging.value) runOnJS(tick)();
    },
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // Each glass action grows out of the card's edge as the card slides away, and swells once committed.
  const leftBg = useAnimatedStyle(() => {
    const x = Math.max(translateX.value, 0);
    return {
      opacity: interpolate(x, [0, 24, ACTION_W], [0, 0.6, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(x, [0, ACTION_W], [0.55, 1], Extrapolation.CLAMP) * (1 + 0.1 * swell.value) }],
    };
  });
  const rightBg = useAnimatedStyle(() => {
    const x = Math.max(-translateX.value, 0);
    return {
      opacity: interpolate(x, [0, 24, ACTION_W], [0, 0.6, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(x, [0, ACTION_W], [0.55, 1], Extrapolation.CLAMP) * (1 + 0.1 * swell.value) }],
    };
  });
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
    <View
      style={[styles.container, depth > 0 && { marginLeft: Math.min(depth, 5) * INDENT }]}
      dataSet={{ todoRow: String(todo.id) }}
      onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
    >
      <View style={styles.swipeLayer} pointerEvents="box-none">
        <Animated.View style={[styles.action, styles.actionLeft, leftBg]} {...glass('accent')}>
          <Pressable
            style={styles.actionHit}
            accessibilityLabel={todo.is_done ? 'Reopen' : 'Mark done'}
            onPress={() => { onToggle(todo); closeRow(); }}
          >
            <Ionicons name={todo.is_done ? 'arrow-undo' : 'checkmark'} size={22} color="#fff" />
            <Text style={styles.swipeText}>{todo.is_done ? 'Undo' : 'Done'}</Text>
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.action, styles.actionRight, rightBg]} {...glass('accent-deep')}>
          <Pressable
            style={styles.actionHit}
            accessibilityLabel="Delete"
            onPress={() => { onDelete(todo); closeRow(); }}
          >
            <Ionicons name="trash-outline" size={21} color="#fff" />
            <Text style={styles.swipeText}>{todo.business_id && !todo.permissions?.can_delete ? 'Request' : 'Delete'}</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* touchAction keeps vertical page scrolling working on touch screens (web). */}
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View {...glass('card')} style={[styles.row, rowStyle]}>
          {(selected || active) && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.brand[500], opacity: selected ? 0.2 : 0.13 }]} />}
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
          <Pressable
            style={styles.body}
            onPress={() => {
              if (Math.abs(translateX.get()) > 6) closeRow();
              else if (selectMode) onSelect?.(todo);
              else onOpen(todo);
            }}
          >
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
  container: { position: 'relative', marginVertical: 3 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.gray[200], marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.brand[500] },
  swipeLayer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  action: {
    position: 'absolute', top: 2, bottom: 2, width: ACTION_W - 14, borderRadius: radius.xl,
    backgroundColor: colors.brand[600], overflow: 'hidden',
  },
  actionLeft: { left: 4 },
  actionRight: { right: 4, backgroundColor: colors.brand[700] },
  actionHit: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  swipeText: { color: '#fff', fontWeight: '700', fontSize: 11, letterSpacing: 0.2 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl + 2,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  check: { paddingTop: 1, paddingRight: spacing.md, paddingLeft: spacing.xs },
  body: { flex: 1 },
  parentHint: { fontSize: 11, color: colors.gray[400], marginBottom: 1 },
  title: { fontSize: fontSize.md, color: colors.gray[900], lineHeight: 21, fontWeight: '600', letterSpacing: -0.25 },
  titleSub: { fontSize: fontSize.base, fontWeight: '500' },
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
