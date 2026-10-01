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

const SWIPE_TRIGGER = 90;

/**
 * One to-do row. Swipe right to complete, swipe left to delete, tap to open.
 */
function TodoItem({ todo, list, showList, currentUserId, highlighted, onToggle, onOpen, onDelete }) {
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

  return (
    <View style={styles.container}>
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
        <Animated.View style={[styles.row, rowStyle]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.brand[500] }, flashStyle]} />
          <View style={styles.check}>
            <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => onToggle(todo)} />
          </View>
          <Pressable style={styles.body} onPress={() => onOpen(todo)}>
            <Text
              style={[styles.title, todo.is_done && styles.titleDone]}
              numberOfLines={3}
            >
              {todo.title}
            </Text>
            {!!todo.notes && (
              <Text style={styles.notes} numberOfLines={1}>{todo.notes}</Text>
            )}
            <View style={styles.metaRow}>
              <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} compact />
              {fromSomeoneElse && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-circle-outline" size={12} color={colors.brand[500]} />
                  <Text style={[styles.metaText, { color: colors.brand[500] }]} numberOfLines={1}>from {todo.created_by_name?.split(' ')[0]}</Text>
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
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { position: 'relative' },
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
  check: { paddingTop: 1, paddingRight: spacing.md, paddingLeft: spacing.xs },
  body: { flex: 1 },
  title: { fontSize: fontSize.md, color: colors.gray[900], lineHeight: 21 },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  notes: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, minHeight: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 140 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  listDot: { width: 7, height: 7, borderRadius: 4 },
});

export default memo(TodoItem);
