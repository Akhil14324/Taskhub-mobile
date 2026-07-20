import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';

function useThemedStyles() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, styles };
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
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

export function Header({ title, lang, toggleLang, theme, toggleTheme }) {
  const { colors, styles } = useThemedStyles();
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerActions}>
        <TouchableOpacity onPress={toggleLang} style={styles.langBtn} activeOpacity={0.7}>
          <Text style={styles.langText}>{lang === 'en' ? 'EN' : 'TE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleTheme} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name={theme === 'light' ? 'moon-outline' : 'sunny-outline'} size={20} color={colors.gray[600]} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function MoreMenu({ visible, onClose, title, items, onItemPress }) {
  const { colors, styles } = useThemedStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title || 'More'}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close-outline" size={22} color={colors.gray[400]} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetItems}>
            {items.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.sheetItem}
                onPress={() => {
                  onClose();
                  onItemPress(item);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon} size={22} color={item.color || colors.gray[600]} />
                <Text style={[styles.sheetItemText, { color: item.color || colors.gray[700] }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

export function EmptyState({ icon, message }) {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.emptyState}>
      {icon}
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
  },
  langText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.gray[600],
  },
  iconBtn: {
    padding: spacing.xs,
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
