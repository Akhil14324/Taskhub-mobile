import { memo, useRef, useCallback, useEffect } from 'react';
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
import { waterPress } from '../utils/water';

const SCALE_DOWN = 0.985;
const MIN_DEPTH = 0.04;      // even the gentlest press squishes a little: that is what makes it feel liquid
const MIN_HOLD = 120;        // ms the compression is held at least, so a quick click is still seen and felt
const MORPH = 0.3;           // corners tighten by this fraction while pressed (small shapes only)
const MAX_MORPH_RADIUS = 40; // pills and circles keep their shape; the squish alone carries them

// Controls (as opposed to rows and cards) behave like water when touched: the squish plus a ripple distortion.
const WATER_GLASS = new Set(['button', 'accent', 'accent-deep', 'inset', 'capsule', 'tint']);

const AnimatedPressableView = Animated.createAnimatedComponent(Pressable);

/**
 * Press feedback shared by web and native: a spring-driven "squish". On finger-down the control
 * compresses (shorter, a touch wider) and its corners tighten, and on release the spring overshoots
 * so it wobbles back like a drop of liquid. It all runs on the UI thread, starts from the current
 * value (so a second tap mid-wobble never jumps) and respects reduced motion (a short fade of scale).
 */
function usePressSpring(style, scale) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const depth = Math.max(1 - scale, MIN_DEPTH);
  const flat = StyleSheet.flatten(style) || {};
  const radiusPx = typeof flat.borderRadius === 'number' && flat.borderRadius <= MAX_MORPH_RADIUS ? flat.borderRadius : 0;

  const animated = useAnimatedStyle(() => {
    const out = {
      transform: [
        { scaleX: 1 + depth * 0.3 * p.value },
        { scaleY: 1 - depth * p.value },
      ],
    };
    if (radiusPx) out.borderRadius = radiusPx * (1 - MORPH * p.value);
    return out;
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

  const handlePress = useCallback((e) => {
    if (disabled) return;
    if (hapticRef.current) webHaptic(hapticRef.current === true ? 'light' : hapticRef.current);
    onPress?.(e);
  }, [disabled, onPress]);

  // Respond on pointer-down, not on release: the squish starts the instant the finger lands.
  const wet = water ?? WATER_GLASS.has(rest.dataSet?.glass);
  const handlePressIn = useCallback((e) => {
    down();
    if (wet && !disabled) waterPress(e?.currentTarget);
    onPressIn?.(e);
  }, [down, onPressIn, wet, disabled]);

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
