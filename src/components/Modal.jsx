import { useMemo, useEffect } from 'react';
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
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import useIsDesktop from '../hooks/useBreakpoint';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING_CONFIG = { damping: 24, stiffness: 280, mass: 0.8, overshootClamping: true };

/** Phones: a tall sheet from the bottom. Desktop browsers: a compact centred dialog that fits its content (`width` sets its maximum). */
export default function Modal({ open, onClose, title, children, width = 460 }) {
  const desktop = useIsDesktop();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (open && desktop) {
      translateY.value = 0;
      overlayOpacity.value = withTiming(1, { duration: 160 });
    } else if (open) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      overlayOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
    }
  }, [open, desktop, translateY, overlayOpacity]);

  useEffect(() => {
    if (!open || !desktop || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, desktop, onClose]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!open) return null;

  return (
    <RNModal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, desktop && styles.overlayDesktop, overlayStyle]}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View style={[styles.container, desktop ? [styles.dialog, { maxWidth: width }] : { paddingBottom: spacing.xxxl + insets.bottom }, sheetStyle]}>
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
    height: 'auto', width: '100%', maxHeight: '88%', borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  bodyDesktop: { flexGrow: 0 },
  container: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
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
