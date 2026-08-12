import { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { spacing } from '../theme/theme';

const DOT_SIZE = 6;
const BOUNCE_HEIGHT = 4;
const DURATION = 400;
const STAGGER = 150;

function TypingDot({ delay, color }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(-BOUNCE_HEIGHT, { duration: DURATION / 2, easing: Easing.inOut(Easing.ease) })),
        withTiming(0, { duration: DURATION / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />
  );
}

/**
 * Three bouncing dots typing indicator.
 * Props:
 * - color: dot color (defaults to gray[400])
 */
function TypingIndicator({ color: customColor }) {
  const colors = useColors();
  const color = customColor || colors.gray[400];

  return (
    <View style={styles.container}>
      <TypingDot delay={0} color={color} />
      <TypingDot delay={STAGGER} color={color} />
      <TypingDot delay={STAGGER * 2} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: DOT_SIZE + BOUNCE_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});

export default memo(TypingIndicator);
