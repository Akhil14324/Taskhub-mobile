import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Modal, StyleSheet, Dimensions, Pressable, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/theme';
import { glass } from '../theme/glass';
import { SPRING, project } from '../theme/motion';
import useKeyboardInset from '../hooks/useKeyboardInset';
import useIsDesktop from '../hooks/useBreakpoint';
import useBackClose from '../hooks/useBackClose';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Open with a slightly lively spring; close with a critically damped one (nothing to overshoot while leaving).
const CLOSE_SPRING = { ...SPRING.smooth, overshootClamping: true };
const CLOSE_DURATION = 300; // how long the exit spring is given before the Modal unmounts

/**
 * Gesture-driven bottom sheet that slides in/out on the UI thread.
 * Drag down to dismiss. Tap overlay to dismiss.
 *
 * Props:
 * - visible: boolean
 * - onClose: () => void
 * - children: ReactNode
 * - maxHeight: number (optional, defaults to 60% of screen)
 * - avoidKeyboard: lift the sheet above the on-screen keyboard (forms)
 */
export default function BottomSheet({ visible, onClose, children, maxHeight: requestedMaxHeight = SCREEN_HEIGHT * 0.6, avoidKeyboard = false }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const keyboardInset = useKeyboardInset();
  const { height: windowHeight } = useWindowDimensions();
  const desktop = useIsDesktop();
  const liftBy = avoidKeyboard ? keyboardInset : 0;
  // On a desktop browser the sheet is a centred dialog that fades in instead of sliding up.
  const maxHeight = Math.min(desktop ? Math.max(requestedMaxHeight, 640) : requestedMaxHeight, windowHeight - liftBy - insets.top - 24);
  const hiddenY = desktop ? 14 : maxHeight;

  // Internal render gate: stays true during close animation so Modal doesn't unmount early
  const [shouldRender, setShouldRender] = useState(false);
  const closeTimerRef = useRef(null);

  const translateY = useSharedValue(hiddenY);
  const overlayOpacity = useSharedValue(0);
  const materialize = useSharedValue(0); // 0 -> 1 as the glass arrives: scale and fade together
  const shouldRenderRef = useRef(false);

  useEffect(() => {
    if (visible) {
      // Opening: mount immediately, animate in
      clearTimeout(closeTimerRef.current);
      if (!shouldRenderRef.current) {
        shouldRenderRef.current = true;
        setShouldRender(true);
      }
      translateY.value = withSpring(0, SPRING.sheet);
      materialize.value = withSpring(1, SPRING.sheet);
      overlayOpacity.value = withTiming(1, { duration: 220 });
    } else if (shouldRenderRef.current) {
      // Closing: animate out, then unmount after animation completes
      translateY.value = withSpring(hiddenY, CLOSE_SPRING);
      materialize.value = withSpring(0, CLOSE_SPRING);
      overlayOpacity.value = withTiming(0, { duration: 220 });
      closeTimerRef.current = setTimeout(() => {
        shouldRenderRef.current = false;
        setShouldRender(false);
      }, CLOSE_DURATION + 16);
    }
  }, [visible, maxHeight, hiddenY, translateY, overlayOpacity, materialize]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  useBackClose(visible, onClose);

  // Esc closes the sheet (keyboard use).
  useEffect(() => {
    if (!visible || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  // Touch screens: pulling the sheet down from anywhere closes it, as long as whatever scrolls inside it
  // is already at the top (otherwise the pull is just scrolling).
  const touch = useRef(null);
  const scrolledAway = (node) => {
    for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return true;
    }
    return false;
  };
  const touchHandlers = desktop ? {} : {
    onTouchStart: (e) => {
      const t = e.nativeEvent.touches?.[0];
      touch.current = t ? { y: t.pageY, x: t.pageX, active: false, off: scrolledAway(e.target), lastY: t.pageY, lastT: Date.now(), vy: 0 } : null;
    },
    onTouchMove: (e) => {
      const s = touch.current;
      const t = e.nativeEvent.touches?.[0];
      if (!s || !t || s.off) return;
      const dy = t.pageY - s.y;
      if (!s.active) {
        if (dy > 14 && Math.abs(t.pageX - s.x) < dy) s.active = true;
        else return;
      }
      // Track the finger's speed (px/s) so release can hand it to the spring.
      const now = Date.now();
      if (now > s.lastT) s.vy = ((t.pageY - s.lastY) / (now - s.lastT)) * 1000;
      s.lastY = t.pageY; s.lastT = now;
      translateY.value = Math.max(0, dy - 14);
      overlayOpacity.value = interpolate(translateY.value, [0, maxHeight], [1, 0], Extrapolation.CLAMP);
    },
    onTouchEnd: (e) => {
      const s = touch.current;
      touch.current = null;
      if (!s || !s.active) return;
      const t = e.nativeEvent.changedTouches?.[0];
      const dy = t ? t.pageY - s.y : 0;
      // Decide from where the flick is heading, not where the finger let go.
      const heading = translateY.value + project(s.vy, 0.99);
      if (dy > 110 || heading > maxHeight * 0.45) {
        translateY.value = withSpring(maxHeight, { ...CLOSE_SPRING, velocity: s.vy });
        overlayOpacity.value = withTiming(0, { duration: 220 });
        onClose();
      } else {
        translateY.value = withSpring(0, { ...SPRING.sheet, velocity: s.vy });
        overlayOpacity.value = withTiming(1, { duration: 160 });
      }
    },
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: desktop ? 0.94 + 0.06 * materialize.value : 1 }],
    opacity: desktop ? Math.min(1, materialize.value * 1.4) : 1,
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!shouldRender) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View {...glass('scrim')} style={[styles.overlay, desktop && { justifyContent: 'center', padding: 24 }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View {...glass('sheet')} style={[styles.sheet, desktop && styles.dialog, { maxHeight, marginBottom: liftBy }, liftBy > 0 && { paddingBottom: spacing.md }, sheetStyle]} {...touchHandlers}>
          {/* Swipe-down handling is the touch handlers above (works from anywhere once content is at the top). */}
          {desktop ? <View style={{ height: spacing.sm }} /> : (
            <View style={styles.handleZone}>
              <View style={styles.handle} />
            </View>
          )}
          {children}
        </Animated.View>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const createStyles = (colors, insets) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  dialog: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 620,
    borderRadius: 28,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Math.max(insets.bottom, spacing.md),
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  handleZone: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    marginTop: -spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[400],
    opacity: 0.55,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
});
