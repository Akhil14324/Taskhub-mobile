import { memo, useMemo } from 'react';
import { Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';

export const PrimaryButton = memo(function PrimaryButton({ children, onPress, disabled, style, loading }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.primary, disabled && styles.disabled, style]}
      haptic="light"
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text style={styles.primaryText}>{children}</Text>
      )}
    </AnimatedPressable>
  );
});

export const SecondaryButton = memo(function SecondaryButton({ children, onPress, disabled, style, loading }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.secondary, disabled && styles.disabled, style]}
      haptic="light"
    >
      {loading ? (
        <ActivityIndicator color={colors.gray[600]} size="small" />
      ) : (
        <Text style={styles.secondaryText}>{children}</Text>
      )}
    </AnimatedPressable>
  );
});

export const DangerButton = memo(function DangerButton({ children, onPress, disabled, style, loading }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.danger, disabled && styles.disabled, style]}
      haptic="medium"
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text style={styles.dangerText}>{children}</Text>
      )}
    </AnimatedPressable>
  );
});

export const GhostButton = memo(function GhostButton({ children, onPress, disabled, style }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.ghost, style]}
      haptic="light"
    >
      <Text style={styles.ghostText}>{children}</Text>
    </AnimatedPressable>
  );
});

const createStyles = (colors) => StyleSheet.create({
  primary: {
    backgroundColor: colors.brand[600],
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primaryText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  secondary: {
    backgroundColor: colors.gray[100],
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  secondaryText: {
    color: colors.gray[700],
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  danger: {
    backgroundColor: colors.red[600],
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dangerText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  ghost: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    color: colors.brand[600],
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
});
