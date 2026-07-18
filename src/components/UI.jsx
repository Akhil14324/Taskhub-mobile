import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/theme';

export function Card({ children, style, onPress }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function Badge({ children, bg, color, style }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg || colors.brand[100] }, style]}>
      <Text style={[styles.badgeText, { color: color || colors.brand[700] }]}>
        {children}
      </Text>
    </View>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.successBanner}>
      <Text style={styles.successText}>{message}</Text>
    </View>
  );
}

export function LoadingSpinner() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

export function EmptyState({ icon, message }) {
  return (
    <View style={styles.emptyState}>
      {icon}
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function ProgressBar({ percent, color }) {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray[200],
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
});
