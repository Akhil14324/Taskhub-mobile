import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { useColors, useTheme } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { on } from '../utils/events';

/**
 * Global toast / in-app notification banner.
 * Toasts with a title render as a top banner (incoming notifications);
 * plain toasts render as a bottom snackbar (undo, confirmations).
 */
export default function ToastHost() {
  const colors = useColors();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, theme), [colors, theme]);
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const progress = useSharedValue(0);

  const clear = useCallback(() => setToast(null), []);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    progress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(clear)();
    });
  }, [progress, clear]);

  useEffect(() => on('toast:show', (options) => {
    clearTimeout(timerRef.current);
    setToast({ ...options, key: Date.now() });
    progress.value = 0;
    progress.value = withSpring(1, { damping: 18, stiffness: 260, mass: 0.7 });
    timerRef.current = setTimeout(hide, options.duration || (options.actionLabel ? 5000 : options.title ? 4500 : 2600));
  }), [hide, progress]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const isBanner = !!toast?.title;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * (isBanner ? -40 : 40) }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  if (!toast) return null;

  const tone = toast.tone || 'default';
  const iconColor = tone === 'success' ? colors.green[500] : tone === 'error' ? colors.red[500] : colors.brand[400];

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, isBanner ? { justifyContent: 'flex-start' } : { justifyContent: 'flex-end' }]}>
      <Animated.View
        style={[
          styles.wrap,
          isBanner ? { marginTop: insets.top + spacing.sm } : { marginBottom: insets.bottom + 72 },
          animatedStyle,
        ]}
      >
        <Pressable
          style={[styles.toast, isBanner && styles.banner]}
          onPress={() => {
            if (toast.onPress) {
              toast.onPress();
              hide();
            }
          }}
        >
          <Ionicons name={toast.icon || (tone === 'success' ? 'checkmark-circle' : tone === 'error' ? 'alert-circle' : 'notifications')} size={20} color={iconColor} />
          <View style={styles.texts}>
            {!!toast.title && <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>}
            {!!toast.message && <Text style={[styles.message, isBanner && styles.bannerMessage]} numberOfLines={2}>{toast.message}</Text>}
          </View>
          {!!toast.actionLabel && (
            <Pressable
              hitSlop={10}
              onPress={() => {
                toast.onAction?.();
                hide();
              }}
            >
              <Text style={styles.action}>{toast.actionLabel}</Text>
            </Pressable>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors, theme) => StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: theme === 'dark' ? '#334155' : '#1f2937',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  banner: {
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  texts: { flex: 1 },
  title: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.gray[900],
  },
  message: {
    fontSize: fontSize.base,
    color: '#f9fafb',
  },
  bannerMessage: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
    marginTop: 2,
  },
  action: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.brand[400],
  },
});
