import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/theme';

const SHIMMER_DURATION = 1200;

/**
 * A single shimmering skeleton block.
 * Props:
 * - width: number | string (default: '100%')
 * - height: number (default: 16)
 * - radius: number (default: radius.sm)
 * - style: additional style overrides
 */
export const SkeletonBlock = memo(function SkeletonBlock({ width = '100%', height = 16, style }) {
  const colors = useColors();
  const shimmer = useSharedValue(0);

  // Start the shimmer loop
  useMemo(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.4, 0.8, 0.4], Extrapolation.CLAMP),
  }));

  return (
    <View
      style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.gray[200], overflow: 'hidden' }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.gray[300] }, animatedStyle]} />
    </View>
  );
});

/**
 * Skeleton placeholder for a task card.
 */
export const TaskCardSkeleton = memo(function TaskCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.cardHeader}>
        <View style={skeletonStyles.cardInfo}>
          <SkeletonBlock width="60%" height={18} />
          <View style={{ height: spacing.xs }} />
          <SkeletonBlock width="40%" height={14} />
          <View style={{ height: spacing.xs }} />
          <SkeletonBlock width="80%" height={14} />
        </View>
        <SkeletonBlock width={60} height={24} />
      </View>
      <View style={{ height: spacing.md }} />
      <View style={skeletonStyles.actionsRow}>
        <SkeletonBlock width={80} height={32} />
        <SkeletonBlock width={80} height={32} />
        <SkeletonBlock width={80} height={32} />
      </View>
    </View>
  );
});

/**
 * Skeleton placeholder for a conversation list item.
 */
export const ConversationSkeleton = memo(function ConversationSkeleton() {
  return (
    <View style={skeletonStyles.convItem}>
      <SkeletonBlock width={44} height={44} style={{ borderRadius: 22 }} />
      <View style={skeletonStyles.convContent}>
        <View style={skeletonStyles.convHeader}>
          <SkeletonBlock width="50%" height={16} />
          <SkeletonBlock width={40} height={12} />
        </View>
        <View style={{ height: spacing.xs }} />
        <SkeletonBlock width="70%" height={14} />
      </View>
    </View>
  );
});

/**
 * Skeleton placeholder for a notification card.
 */
export const NotificationSkeleton = memo(function NotificationSkeleton() {
  return (
    <View style={skeletonStyles.notifCard}>
      <SkeletonBlock width={40} height={40} style={{ borderRadius: 20 }} />
      <View style={skeletonStyles.notifContent}>
        <SkeletonBlock width="80%" height={14} />
        <View style={{ height: spacing.xs }} />
        <SkeletonBlock width={50} height={12} />
      </View>
    </View>
  );
});

/**
 * A list of skeleton placeholders.
 * Props:
 * - count: number (default: 5)
 * - type: 'task' | 'conversation' | 'notification' (default: 'task')
 */
export const SkeletonList = memo(function SkeletonList({ count = 5, type = 'task' }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const SkeletonComponent = type === 'conversation' ? ConversationSkeleton
    : type === 'notification' ? NotificationSkeleton
    : TaskCardSkeleton;

  return (
    <View style={skeletonStyles.list}>
      {items.map((i) => <SkeletonComponent key={i} />)}
    </View>
  );
});

const skeletonStyles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: 'transparent',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  convContent: {
    flex: 1,
  },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  notifContent: {
    flex: 1,
  },
});
