import { useMemo, useEffect, useRef, useState } from 'react';
import { View, Text, Modal as RNModal, StyleSheet, ScrollView, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize, type } from '../theme/theme';
import { glass } from '../theme/glass';
import { SPRING } from '../theme/motion';
import AnimatedPressable from './AnimatedPressable';
import useIsDesktop from '../hooks/useBreakpoint';
import useBackClose from '../hooks/useBackClose';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const CLOSE_SPRING = { ...SPRING.smooth, overshootClamping: true };
const CLOSE_MS = 300;

/** Phones: a tall sheet from the bottom. Desktop browsers: a compact centred dialog that fits its content (`width` sets its maximum). */
export default function Modal({ open, onClose, title, children, width = 460 }) {
  const desktop = useIsDesktop();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const overlayOpacity = useSharedValue(0);
  const materialize = useSharedValue(0);
  // Stay mounted while the exit spring plays, then unmount.
  const [mounted, setMounted] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setMounted(true);
      if (desktop) {
        translateY.value = 0;
        materialize.value = withSpring(1, SPRING.sheet);
      } else {
        translateY.value = withSpring(0, SPRING.sheet);
        materialize.value = 1;
      }
      overlayOpacity.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = desktop ? 0 : withSpring(SCREEN_HEIGHT, CLOSE_SPRING);
      materialize.value = withSpring(0, CLOSE_SPRING);
      overlayOpacity.value = withTiming(0, { duration: 220 });
      timer.current = setTimeout(() => setMounted(false), CLOSE_MS);
    }
    return () => clearTimeout(timer.current);
  }, [open, desktop, translateY, overlayOpacity, materialize]);

  useEffect(() => {
    if (!open || !desktop || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, desktop, onClose]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: desktop ? 0.94 + 0.06 * materialize.value : 1 }],
    opacity: desktop ? Math.min(1, materialize.value * 1.4) : 1,
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  useBackClose(open, onClose);

  if (!mounted && !open) return null;

  return (
    <RNModal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View {...glass('scrim')} style={[styles.overlay, desktop && styles.overlayDesktop, overlayStyle]}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View {...glass('sheet')} style={[styles.container, desktop ? [styles.dialog, { maxWidth: width }] : { paddingBottom: spacing.xxxl + insets.bottom }, sheetStyle]}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <AnimatedPressable onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close" haptic="light">
                  <Ionicons name="close" size={24} color={colors.gray[400]} />
                </AnimatedPressable>
              </View>
              <ScrollView style={desktop ? styles.bodyDesktop : styles.body} contentContainerStyle={desktop ? { padding: spacing.lg, paddingTop: spacing.md } : undefined} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  overlayDesktop: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  dialog: {
    height: 'auto', width: '100%', maxHeight: '88%', borderRadius: 28, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  bodyDesktop: { flexGrow: 0 },
  container: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  title: {
    ...type.headline,
    color: colors.gray[900],
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  body: {
    padding: spacing.lg,
  },
});
