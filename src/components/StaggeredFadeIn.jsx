import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8, overshootClamping: false };
const FADE_DURATION = 400;
const STAGGER_MS = 60;
const MAX_STAGGER_ITEMS = 12;

/**
 * Wraps a single list item to fade-in + slide-up on first appearance.
 * Use the `index` prop to stagger items.
 *
 * Props:
 * - index: number (stagger delay = index * 60ms, capped at 12 items)
 * - children: ReactNode
 */
export const FadeInItem = memo(function FadeInItem({ index = 0, children, style }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  const delay = Math.min(index, MAX_STAGGER_ITEMS) * STAGGER_MS;

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: FADE_DURATION, easing: Easing.out(Easing.ease) }));
    translateY.value = withDelay(delay, withSpring(0, SPRING_CONFIG));
  }, [delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
});

/**
 * Wraps a list of items to stagger their entrance.
 * Renders children inside FadeInItem wrappers.
 *
 * Props:
 * - items: array (used for keys and count)
 * - renderItem: (item, index) => ReactNode
 * - maxStagger: number (default: 12) — items beyond this appear instantly
 */
export const StaggeredList = memo(function StaggeredList({ items, renderItem, style }) {
  const rendered = useMemo(
    () => items.map((item, index) => (
      <FadeInItem key={item.id ?? index} index={index}>
        {renderItem(item, index)}
      </FadeInItem>
    )),
    [items, renderItem],
  );

  return <View style={style}>{rendered}</View>;
});
