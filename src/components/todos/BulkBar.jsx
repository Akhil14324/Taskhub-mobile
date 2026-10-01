import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';

/** Floating action bar shown while selecting several to-dos. */
export default function BulkBar({ count, onComplete, onDate, onPriority, onMove, onDuplicate, onDelete }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const disabled = count === 0;
  const actions = [
    { icon: 'checkmark-circle-outline', label: 'Complete', onPress: onComplete },
    { icon: 'calendar-outline', label: 'Date', onPress: onDate },
    { icon: 'flag-outline', label: 'Priority', onPress: onPriority },
    { icon: 'albums-outline', label: 'Move', onPress: onMove },
    { icon: 'copy-outline', label: 'Duplicate', onPress: onDuplicate },
    { icon: 'trash-outline', label: 'Delete', onPress: onDelete, danger: true },
  ];
  return (
    <View style={[styles.bar, { bottom: 12 + insets.bottom }]}>
      <View style={styles.actions}>
        {actions.map((a) => (
          <AnimatedPressable key={a.label} disabled={disabled} onPress={a.onPress} haptic="light" style={[styles.action, disabled && { opacity: 0.4 }]}>
            <Ionicons name={a.icon} size={20} color={a.danger ? '#fca5a5' : '#fff'} />
            <Text style={[styles.actionText, a.danger && { color: '#fca5a5' }]}>{a.label}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: '#111827',
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  actions: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  action: { alignItems: 'center', paddingHorizontal: 4, paddingVertical: 2, gap: 1, minWidth: 48 },
  actionText: { color: '#fff', fontSize: 10, fontWeight: '600' },
});
