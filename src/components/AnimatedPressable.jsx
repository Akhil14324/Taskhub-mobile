import { memo, useRef, useCallback, useEffect, useState } from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import * as Haptics from 'expo-haptics';
import { haptic as webHaptic } from '../utils/feedback';
import { SPRING } from '../theme/motion';

const SCALE_DOWN = 0.985;
const MIN_DEPTH = 0.025;     // the press is a small, even dip: felt, never a wobble
const MIN_HOLD = 70;         // ms the dip is held at least, so a quick click is still seen

const AnimatedPressableView = Animated.createAnimatedComponent(Pressable);

/**
 * Press feedback shared by web and native: on finger-down the control dips a little (an even scale) and on
 * release it comes straight back. It runs on the UI thread, starts from the current value (so a second tap
 * mid-way never jumps) and respects reduced motion.
 */
function usePressSpring(style, scale) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const depth = Math.max(1 - scale, MIN_DEPTH);

  const animated = useAnimatedStyle(() => {
    return { transform: [{ scale: 1 - depth * p.value }] };
  });

  const downAt = useRef(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const down = useCallback(() => {
    clearTimeout(timer.current);
    downAt.current = Date.now();
    p.value = reduced ? withTiming(1, { duration: 80 }) : withSpring(1, SPRING.press);
  }, [p, reduced]);
  const up = useCallback(() => {
    const release = () => { p.value = reduced ? withTiming(0, { duration: 120 }) : withSpring(0, SPRING.release); };
    // A tap that lifts within a few frames would be over before it registers: hold the dip a moment.
    const held = Date.now() - downAt.current;
    clearTimeout(timer.current);
    if (!reduced && held < MIN_HOLD) timer.current = setTimeout(release, MIN_HOLD - held);
    else release();
  }, [p, reduced]);

  return { animated, down, up };
}

/**
 * Drop-in replacement for TouchableOpacity with the liquid squish press.
 * Props:
 * - haptic: boolean | 'light' | 'medium' | 'heavy' (default: false)
 * - scale: number (default 0.985); lower presses deeper (the squish never gets shallower than 4%)
 * - water: boolean; the pressed control ripples like a disturbed surface (default: on for glass controls)
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
  water,
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
        water={water}
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
  water,
  ...rest
}) {
  const { animated, down, up } = usePressSpring(style, scale);
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;

  // A press whose handler returns a promise (any async handler) locks the control until it settles: no second
  // click can start the same work twice, and `data-busy` dims it and shows the wait cursor (index.html).
  const pending = useRef(false);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { alive.current = false; }, []);

  const handlePress = useCallback((e) => {
    if (disabled || pending.current) return;
    if (hapticRef.current) webHaptic(hapticRef.current === true ? 'light' : hapticRef.current);
    const result = onPress?.(e);
    if (result && typeof result.then === 'function') {
      pending.current = true;
      // Only show the busy look when the work takes long enough to notice.
      const show = setTimeout(() => { if (alive.current && pending.current) setBusy(true); }, 150);
      const done = () => {
        clearTimeout(show);
        pending.current = false;
        if (alive.current) setBusy(false);
      };
      result.then(done, done);
    }
  }, [disabled, onPress]);

  // Respond on pointer-down, not on release: the squish starts the instant the finger lands.
  const handlePressIn = useCallback((e) => {
    down();
    onPressIn?.(e);
  }, [down, onPressIn]);

  const handlePressOut = useCallback((e) => {
    up();
    onPressOut?.(e);
  }, [up, onPressOut]);

  return (
    <AnimatedPressableView
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      // A button role lets Tab reach it and Enter / Space press it (keyboard-only use).
      accessibilityRole={onPress ? 'button' : undefined}
      style={[style, animated]}
      {...rest}
      dataSet={busy ? { ...rest.dataSet, busy: '1' } : rest.dataSet}
      aria-busy={busy || undefined}
    >
      {children}
    </AnimatedPressableView>
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
  const { animated, down, up } = usePressSpring(style, scale);
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;

  const triggerHaptic = useCallback(() => {
    if (!hapticRef.current || disabled) return;
    const hapticStyle = hapticRef.current === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy
      : hapticRef.current === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(hapticStyle);
  }, [disabled]);

  const handlePressIn = useCallback((e) => {
    down();
    onPressIn?.(e);
  }, [down, onPressIn]);

  const handlePressOut = useCallback((e) => {
    up();
    onPressOut?.(e);
  }, [up, onPressOut]);

  const handlePress = useCallback((e) => {
    if (disabled) return;
    if (haptic) triggerHaptic();
    onPress?.(e);
  }, [disabled, haptic, triggerHaptic, onPress]);

  // Extract layout-only props for the outer Pressable; full style goes on inner view
  const layoutStyle = StyleSheet.flatten(style);
  const layoutOnly = layoutStyle ? {
    flex: layoutStyle.flex,
    flexGrow: layoutStyle.flexGrow,
    flexShrink: layoutStyle.flexShrink,
    flexBasis: layoutStyle.flexBasis,
    width: layoutStyle.width,
    height: layoutStyle.height,
    minWidth: layoutStyle.minWidth,
    maxWidth: layoutStyle.maxWidth,
    maxHeight: layoutStyle.maxHeight,
    position: layoutStyle.position,
    top: layoutStyle.top,
    bottom: layoutStyle.bottom,
    left: layoutStyle.left,
    right: layoutStyle.right,
    margin: layoutStyle.margin,
    marginHorizontal: layoutStyle.marginHorizontal,
    marginVertical: layoutStyle.marginVertical,
    marginTop: layoutStyle.marginTop,
    marginBottom: layoutStyle.marginBottom,
    marginLeft: layoutStyle.marginLeft,
    marginRight: layoutStyle.marginRight,
    alignSelf: layoutStyle.alignSelf,
  } : undefined;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={layoutOnly}
      android_ripple={null}
      {...rest}
    >
      <Animated.View style={[style, animated]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default memo(AnimatedPressable);
