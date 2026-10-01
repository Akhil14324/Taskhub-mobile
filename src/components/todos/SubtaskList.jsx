import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, DueChip } from '../kit';
import { showToast } from '../../utils/events';

/** Sub-tasks of one to-do: progress bar, tick-able rows and an inline "add" field. */
export default function SubtaskList({ parent, subtasks, onOpen }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { createTodo, toggleTodo } = useTodos();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  const done = subtasks.filter((s) => s.is_done).length;
  const percent = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;

  const add = async () => {
    const title = text.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    setText('');
    try {
      await createTodo({ title, parent_id: parent.id }, { silent: true });
    } catch (err) {
      setText(title);
      showToast({ message: err.response?.data?.error || 'Could not add the sub-task', tone: 'error' });
    }
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Sub-tasks{subtasks.length ? ` · ${done}/${subtasks.length}` : ''}</Text>
      </View>
      {subtasks.length > 0 && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      )}
      {subtasks.map((s) => (
        <View key={s.id} style={styles.row}>
          <TodoCheckbox checked={s.is_done} priority={s.priority} onPress={() => toggleTodo(s)} size={20} />
          <AnimatedPressable style={styles.rowBody} onPress={() => onOpen?.(s.id)} haptic="light">
            <Text style={[styles.title, s.is_done && styles.titleDone]} numberOfLines={2}>{s.title}</Text>
            {!!s.due_date && <DueChip date={s.due_date} time={s.due_time} done={s.is_done} compact />}
          </AnimatedPressable>
        </View>
      ))}
      {adding ? (
        <View style={styles.addRow}>
          <Ionicons name="return-down-forward" size={18} color={colors.gray[400]} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onSubmitEditing={add}
            onBlur={() => !text.trim() && setAdding(false)}
            blurOnSubmit={false}
            placeholder="Sub-task name, then Enter"
            placeholderTextColor={colors.gray[400]}
            style={styles.input}
            returnKeyType="done"
          />
          <AnimatedPressable onPress={add} haptic="light" hitSlop={8} disabled={!text.trim()}>
            <Ionicons name="arrow-up-circle" size={26} color={text.trim() ? colors.brand[600] : colors.gray[300]} />
          </AnimatedPressable>
        </View>
      ) : (
        <AnimatedPressable style={styles.addButton} onPress={() => setAdding(true)} haptic="light">
          <Ionicons name="add" size={18} color={colors.brand[600]} />
          <Text style={styles.addText}>Add sub-task</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.gray[200], marginHorizontal: spacing.sm, marginBottom: spacing.sm, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.brand[600] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 7, paddingHorizontal: spacing.sm },
  rowBody: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.base, color: colors.gray[900] },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  addText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  input: {
    flex: 1,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
});
