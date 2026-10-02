import { forwardRef, useMemo, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { parseQuickAdd } from '../../utils/quickAdd';
import { showToast } from '../../utils/events';

/**
 * A box that stays open at the top of the list: type, press Enter, the to-do is added and the box is ready
 * for the next one. Understands the same shortcuts as Quick add (dates, +labels, p1, "for 2h").
 */
const InlineQuickAdd = forwardRef(function InlineQuickAdd({ defaults = {}, lists = [], placeholder }, ref) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { createTodo } = useTodos();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const parsed = parseQuickAdd(text, lists);
    if (!parsed.title || saving) return;
    setSaving(true);
    try {
      await createTodo({
        title: parsed.title,
        due_date: parsed.due_date ?? defaults.due_date,
        due_time: parsed.due_time,
        priority: parsed.priority,
        recurrence: parsed.recurrence,
        list_id: defaults.business_id ? undefined : (parsed.list?.id ?? defaults.list_id),
        business_id: defaults.business_id || undefined,
        labels: [...new Set([...(parsed.labels || []), ...(defaults.labels || [])])],
        deadline_date: parsed.deadline_date,
        duration_minutes: parsed.duration_minutes,
      });
      setText('');
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add it', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Ionicons name="add-circle-outline" size={20} color={colors.brand[600]} />
      <TextInput
        ref={ref}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        blurOnSubmit={false}
        placeholder={placeholder || 'Add a to-do and press Enter. Try "Call supplier tomorrow 4pm p1"'}
        placeholderTextColor={colors.gray[400]}
        style={styles.input}
        returnKeyType="done"
      />
    </View>
  );
});

export default InlineQuickAdd;

const createStyles = (colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  input: { flex: 1, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
});
