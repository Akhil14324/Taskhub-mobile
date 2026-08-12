import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Modal, StyleSheet, Dimensions, Pressable } from 'react-native';
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

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING_CONFIG = { damping: 28, stiffness: 280, mass: 0.8, overshootClamping: true };
const CLOSE_DURATION = 220;

/**
 * Gesture-driven bottom sheet that slides in/out on the UI thread.
 * Drag down to dismiss. Tap overlay to dismiss.
 *
 * Props:
 * - visible: boolean
 * - onClose: () => void
 * - children: ReactNode
 * - maxHeight: number (optional, defaults to 60% of screen)
 */
export default function BottomSheet({ visible, onClose, children, maxHeight = SCREEN_HEIGHT * 0.6 }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);

  // Internal render gate: stays true during close animation so Modal doesn't unmount early
  const [shouldRender, setShouldRender] = useState(false);
  const closeTimerRef = useRef(null);

  const translateY = useSharedValue(maxHeight);
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
      translateY.value = withSpring(0, SPRING_CONFIG);
      overlayOpacity.value = withTiming(1, { duration: 200 });
    } else if (shouldRenderRef.current) {
      // Closing: animate out, then unmount after animation completes
      translateY.value = withTiming(maxHeight, { duration: CLOSE_DURATION });
      overlayOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
      closeTimerRef.current = setTimeout(() => {
        shouldRenderRef.current = false;
        setShouldRender(false);
      }, CLOSE_DURATION + 16);
    }
  }, [visible, maxHeight, translateY, overlayOpacity]);

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
        translateY.value = withSpring(0, SPRING_CONFIG);
        overlayOpacity.value = withTiming(1, { duration: 150 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
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
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { maxHeight }, sheetStyle]}>
            <View style={styles.handle} />
            {children}
          </Animated.View>
        </GestureDetector>
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
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: Math.max(insets.bottom, spacing.md),
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[300],
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
});
