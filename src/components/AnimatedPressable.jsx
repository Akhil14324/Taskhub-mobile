import { memo, useRef, useCallback, useState } from 'react';
import { Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const SPRING_CONFIG = { damping: 18, stiffness: 350, mass: 0.6, overshootClamping: true };
const SCALE_DOWN = 0.96;

/**
 * Drop-in replacement for TouchableOpacity with a spring scale-down on press.
 * - Scales to 0.96 on press-in, springs back on press-out
 * - Optional haptic feedback on press
 * - Works with all TouchableOpacity props (onPress, disabled, style, hitSlop, etc.)
 *
 * Props:
 * - haptic: boolean | 'light' | 'medium' | 'heavy' (default: false)
 * - scale: number (default: 0.96) — how much to scale down on press
 * - ...all Pressable props
 */
function AnimatedPressable({
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  haptic = false,
  scale = SCALE_DOWN,
  ...rest
}) {
  if (Platform.OS === 'web') {
    return (
      <WebPressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={style}
        haptic={haptic}
        scale={scale}
        {...rest}
      >
        {children}
      </WebPressable>
    );
  }

  return (
    <NativePressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      style={style}
      haptic={haptic}
      scale={scale}
      {...rest}
    >
      {children}
    </NativePressable>
  );
}

function WebPressable({
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  haptic,
  scale,
  ...rest
}) {
  const [pressed, setPressed] = useState(false);
  const hapticRef = useRef(haptic);

  const triggerHaptic = useCallback(() => {
    if (!hapticRef.current || disabled) return;
    const hapticStyle = hapticRef.current === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy
      : hapticRef.current === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(hapticStyle).catch(() => {});
  }, [disabled]);

  const handlePress = useCallback((e) => {
    if (disabled) return;
    if (haptic) triggerHaptic();
    onPress?.(e);
  }, [disabled, haptic, triggerHaptic, onPress]);

  const handlePressIn = useCallback((e) => {
    setPressed(true);
    onPressIn?.(e);
  }, [onPressIn]);

  const handlePressOut = useCallback((e) => {
    setPressed(false);
    onPressOut?.(e);
  }, [onPressOut]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[style, { transform: [{ scale: pressed ? scale : 1 }] }]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

function NativePressable({
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  style,
  haptic,
  scale,
  ...rest
}) {
  const isActive = useSharedValue(1);
  const hapticRef = useRef(haptic);

  const triggerHaptic = useCallback(() => {
    if (!hapticRef.current || disabled) return;
    const hapticStyle = hapticRef.current === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy
      : hapticRef.current === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(hapticStyle);
  }, [disabled]);

  const handlePressIn = useCallback((e) => {
    isActive.value = withTiming(scale, { duration: 80 });
    onPressIn?.(e);
  }, [scale, onPressIn]);

  const handlePressOut = useCallback((e) => {
    isActive.value = withSpring(1, SPRING_CONFIG);
    onPressOut?.(e);
  }, [onPressOut]);

  const handlePress = useCallback((e) => {
    if (disabled) return;
    if (haptic) triggerHaptic();
    onPress?.(e);
  }, [disabled, haptic, triggerHaptic, onPress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isActive.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
      {...rest}
    >
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default memo(AnimatedPressable);
