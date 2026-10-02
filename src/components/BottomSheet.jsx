import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Modal, StyleSheet, Dimensions, Pressable, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
import useKeyboardInset from '../hooks/useKeyboardInset';
import useIsDesktop from '../hooks/useBreakpoint';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING_CONFIG = { damping: 28, stiffness: 280, mass: 0.8, overshootClamping: true };
const CLOSE_DURATION = 180;
const OPEN_DURATION = 200;

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
  const shouldRenderRef = useRef(false);

  useEffect(() => {
    if (visible) {
      // Opening: mount immediately, animate in
      clearTimeout(closeTimerRef.current);
      if (!shouldRenderRef.current) {
        shouldRenderRef.current = true;
        setShouldRender(true);
      }
      translateY.value = withTiming(0, { duration: OPEN_DURATION });
      overlayOpacity.value = withTiming(1, { duration: 160 });
    } else if (shouldRenderRef.current) {
      // Closing: animate out, then unmount after animation completes
      translateY.value = withTiming(hiddenY, { duration: CLOSE_DURATION });
      overlayOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
      closeTimerRef.current = setTimeout(() => {
        shouldRenderRef.current = false;
        setShouldRender(false);
      }, CLOSE_DURATION + 16);
    }
  }, [visible, maxHeight, hiddenY, translateY, overlayOpacity]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX(8)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
      overlayOpacity.value = interpolate(
        translateY.value,
        [0, maxHeight],
        [1, 0],
        Extrapolation.CLAMP,
      );
    })
    .onEnd((e) => {
      const shouldClose = e.translationY > maxHeight * 0.35 || e.velocityY > 800;
      if (shouldClose) {
        // Start animation immediately on UI thread, then notify JS to unmount
        translateY.value = withTiming(maxHeight, { duration: CLOSE_DURATION });
        overlayOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 140 });
        overlayOpacity.value = withTiming(1, { duration: 120 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: desktop ? overlayOpacity.value : 1,
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
      <Animated.View style={[styles.overlay, desktop && { justifyContent: 'center', padding: 24 }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[styles.sheet, desktop && styles.dialog, { maxHeight, marginBottom: liftBy }, liftBy > 0 && { paddingBottom: spacing.md }, sheetStyle]}>
          {/* Drag only from the grip so scrollable content inside the sheet keeps scrolling. */}
          {desktop ? <View style={{ height: spacing.sm }} /> : (
            <GestureDetector gesture={pan}>
              <View style={styles.handleZone}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>
          )}
          {children}
        </Animated.View>
      </Animated.View>
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
    borderRadius: radius.xl,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: Math.max(insets.bottom, spacing.md),
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  handleZone: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    marginTop: -spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[300],
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
});
