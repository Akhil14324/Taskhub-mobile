import { memo, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';

function useThemedStyles() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, styles };
}

export function Screen({ children, style, bottomOffset = 0 }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, paddingTop: insets.top }, style]}>
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }) {
  const { styles } = useThemedStyles();
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function Badge({ children, bg, color, style }) {
  const { colors, styles } = useThemedStyles();
  return (
    <View style={[styles.badge, { backgroundColor: bg || colors.brand[100] }, style]}>
      <Text style={[styles.badgeText, { color: color || colors.brand[700] }]}>
        {children}
      </Text>
    </View>
  );
}

export function ErrorBanner({ message }) {
  const { styles } = useThemedStyles();
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }) {
  const { styles } = useThemedStyles();
  if (!message) return null;
  return (
    <View style={styles.successBanner}>
      <Text style={styles.successText}>{message}</Text>
    </View>
  );
}

export function LoadingSpinner() {
  const { styles } = useThemedStyles();
  const { t } = useLang();
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>{t('loading')}</Text>
    </View>
  );
}

export function Header({ title, lang, toggleLang, theme, toggleTheme }) {
  const { colors, styles } = useThemedStyles();
  return (
    <View style={[styles.header, { paddingTop: spacing.md }]}>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerActions}>
        <AnimatedPressable onPress={toggleLang} style={styles.langBtn} haptic="light">
          <Text style={styles.langText}>{lang === 'en' ? 'EN' : 'TE'}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={toggleTheme} style={styles.iconBtn} haptic="light">
          <Ionicons name={theme === 'light' ? 'moon-outline' : 'sunny-outline'} size={20} color={colors.gray[600]} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

export function MoreMenu({ visible, onClose, title, items, onItemPress }) {
  const { colors, styles } = useThemedStyles();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const sheetTranslateY = useSharedValue(400);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      sheetTranslateY.value = withSpring(0, { damping: 24, stiffness: 280, mass: 0.8, overshootClamping: true });
      overlayOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
    }
  }, [visible, sheetTranslateY, overlayOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }, sheetStyle]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title || t('more')}</Text>
            <AnimatedPressable onPress={onClose} style={styles.sheetCloseBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close" haptic="light">
              <Ionicons name="close-outline" size={22} color={colors.gray[400]} />
            </AnimatedPressable>
          </View>
          <View style={styles.sheetItems}>
            {items.map((item, index) => (
              <AnimatedPressable
                key={index}
                style={styles.sheetItem}
                onPress={() => {
                  onClose();
                  onItemPress(item);
                }}
                haptic="light"
              >
                <Ionicons name={item.icon} size={22} color={item.color || colors.gray[600]} />
                <Text style={[styles.sheetItemText, { color: item.color || colors.gray[700] }]}>{item.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export const EmptyState = memo(function EmptyState({ icon, message }) {
  const { styles } = useThemedStyles();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });
    translateY.value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.8 });
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.emptyState, animatedStyle]}>
      {icon}
      <Text style={styles.emptyText}>{message}</Text>
    </Animated.View>
  );
});

export function ProgressBar({ percent, color }) {
  const { colors, styles } = useThemedStyles();
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${percent}%`, backgroundColor: color || colors.brand[600] },
        ]}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: colors.red[50],
    borderWidth: 1,
    borderColor: colors.red[100],
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.red[700],
  },
  successBanner: {
    backgroundColor: colors.green[50],
    borderWidth: 1,
    borderColor: colors.green[100],
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    fontSize: fontSize.sm,
    color: colors.green[700],
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.gray[400],
  },
  emptyState: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xxxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.gray[400],
    marginTop: spacing.md,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    backgroundColor: colors.gray[200],
    borderRadius: radius.full,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.brand[600],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  langBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  langText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray[600],
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  sheetTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
  },
  sheetCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  sheetItems: {
    paddingVertical: spacing.sm,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetItemText: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
});
