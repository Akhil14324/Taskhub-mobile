import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, DueChip } from '../kit';
import { formatDuration } from '../../utils/todoMeta';

const COLUMN_WIDTH = 270;

/**
 * Kanban board of one list: a column per section. Tap a card to open it, tick it with the
 * checkbox, or use the arrows icon to move it to another column.
 * columns = [{ key, title, section?, items }]; progressOf(todo) → { done, total }.
 */
export default function BoardView({ columns, progressOf, onOpen, onToggle, onMove, onAdd, onAddSection, onEditSection }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board} keyboardShouldPersistTaps="handled">
      {columns.map((col) => (
        <View key={col.key} style={styles.column}>
          <View style={styles.columnHead}>
            <Text style={styles.columnTitle} numberOfLines={1}>{col.title}</Text>
            <Text style={styles.columnCount}>{col.items.length}</Text>
            <View style={{ flex: 1 }} />
            {col.section && (
              <AnimatedPressable onPress={() => onEditSection(col.section)} hitSlop={8} haptic="light">
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[400]} />
              </AnimatedPressable>
            )}
            <AnimatedPressable onPress={() => onAdd(col)} hitSlop={8} haptic="light">
              <Ionicons name="add" size={22} color={colors.gray[500]} />
            </AnimatedPressable>
          </View>
          {col.items.map((t) => {
            const progress = progressOf(t);
            return (
              <Pressable key={t.id} style={styles.card} onPress={() => onOpen(t)}>
                <View style={styles.cardTop}>
                  <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => onToggle(t)} size={20} />
                  <Text style={[styles.cardTitle, t.is_done && styles.cardDone]} numberOfLines={3}>{t.title}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <DueChip date={t.due_date} time={t.due_time} recurrence={t.recurrence} done={t.is_done} compact />
                  {!!t.duration_minutes && (
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={11} color={colors.gray[500]} />
                      <Text style={styles.metaText}>{formatDuration(t.duration_minutes)}</Text>
                    </View>
                  )}
                  {progress.total > 0 && (
                    <View style={styles.metaItem}>
                      <Ionicons name="git-branch-outline" size={11} color={colors.gray[500]} />
                      <Text style={styles.metaText}>{progress.done}/{progress.total}</Text>
                    </View>
                  )}
                  {t.comment_count > 0 && (
                    <View style={styles.metaItem}>
                      <Ionicons name="chatbubble-outline" size={11} color={colors.gray[500]} />
                      <Text style={styles.metaText}>{t.comment_count}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <AnimatedPressable onPress={() => onMove(t)} hitSlop={8} haptic="light">
                    <Ionicons name="swap-horizontal" size={18} color={colors.gray[400]} />
                  </AnimatedPressable>
                </View>
                {(t.labels || []).length > 0 && (
                  <View style={styles.labels}>
                    {t.labels.slice(0, 3).map((l) => <Text key={l} style={styles.label}>+{l}</Text>)}
                  </View>
                )}
              </Pressable>
            );
          })}
          {col.items.length === 0 && <Text style={styles.empty}>Nothing here</Text>}
        </View>
      ))}
      <AnimatedPressable style={styles.addColumn} onPress={onAddSection} haptic="light">
        <Ionicons name="add" size={20} color={colors.brand[600]} />
        <Text style={styles.addColumnText}>Add section</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  board: { gap: spacing.md, paddingBottom: spacing.xl, paddingRight: spacing.lg },
  column: { width: COLUMN_WIDTH, backgroundColor: colors.gray[100], borderRadius: radius.xl, padding: spacing.sm, alignSelf: 'flex-start' },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  columnTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800], maxWidth: 150 },
  columnCount: { fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '600' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.base, color: colors.gray[900], lineHeight: 19 },
  cardDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  labels: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  label: { fontSize: 11, fontWeight: '600', color: colors.brand[600] },
  empty: { fontSize: fontSize.sm, color: colors.gray[400], textAlign: 'center', paddingVertical: spacing.lg },
  addColumn: {
    width: 150,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
    alignSelf: 'flex-start',
  },
  addColumnText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
});
