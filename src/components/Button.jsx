import { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';

export function PrimaryButton({ children, onPress, disabled, style, loading }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.primary, disabled && styles.disabled, style]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text style={styles.primaryText}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({ children, onPress, disabled, style, loading }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.secondary, disabled && styles.disabled, style]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={colors.gray[600]} size="small" />
      ) : (
        <Text style={styles.secondaryText}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

export function DangerButton({ children, onPress, disabled, style, loading }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.danger, disabled && styles.disabled, style]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text style={styles.dangerText}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

export function GhostButton({ children, onPress, disabled, style }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.ghost, style]}
      activeOpacity={0.7}
    >
      <Text style={styles.ghostText}>{children}</Text>
    </TouchableOpacity>
  );
}

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
