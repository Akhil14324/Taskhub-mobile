import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { PrimaryButton } from '../Button';
import { formatDue } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import { openNotificationTarget } from '../../navigation/navigationRef';
import { glass } from '../../theme/glass';

/** Update one key result: type the new number, or see (and open) the to-dos it is measured by. */
export default function KeyResultSheet({ visible, onClose, kr, canManage, onChanged }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState('');
  const [todos, setTodos] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !kr) return;
    setValue(String(kr.current_value));
    setTodos(null);
    if (kr.kind === 'todos') {
      api.get(`/goals/key-results/${kr.id}/todos`, { __skipOops: true }).then((r) => setTodos(r.data.todos)).catch(() => setTodos([]));
    }
  }, [visible, kr]);

  if (!kr) return null;

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n)) return showToast({ message: 'Enter a number', icon: 'alert-circle' });
    setBusy(true);
    try {
      const res = await api.put(`/goals/key-results/${kr.id}`, { current_value: n });
      onChanged?.(res.data.goal);
      showToast({ message: 'Progress updated', icon: 'trending-up' });
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not update', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Remove this key result?', message: kr.title, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    try {
      const res = await api.delete(`/goals/key-results/${kr.id}`);
      onChanged?.(res.data.goal);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not remove', icon: 'alert-circle' });
    }
  };

  const unit = kr.unit ? ` ${kr.unit}` : '';
  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={560}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>{kr.title}</Text>
        {kr.kind === 'number' ? (
          <>
            <Text style={styles.sub}>From {kr.start_value}{unit} to {kr.target_value}{unit}. Where are you now?</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="numeric"
              editable={canManage}
              {...glass('inset')} style={styles.input}
              autoFocus={canManage}
              onSubmitEditing={save}
            />
            {canManage && <PrimaryButton onPress={save} loading={busy}>Update progress</PrimaryButton>}
          </>
        ) : (
          <>
            <Text style={styles.sub}>{kr.todos_done} of {kr.todos_total} linked to-dos are finished. This updates by itself.</Text>
            {todos === null && <Text style={styles.sub}>Loading...</Text>}
            {(todos || []).map((t) => (
              <AnimatedPressable
                key={t.id}
                disabled={t.hidden}
                onPress={() => { onClose(); setTimeout(() => openNotificationTarget({ todoId: t.id }), 80); }}
                style={styles.todo}
              >
                <Ionicons name={t.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={t.is_done ? colors.brand[600] : colors.gray[400]} />
                <Text style={[styles.todoText, t.is_done && { textDecorationLine: 'line-through', color: colors.gray[400] }]} numberOfLines={1}>{t.title}</Text>
                {!!t.due_date && <Text style={styles.sub}>{formatDue(t.due_date)}</Text>}
              </AnimatedPressable>
            ))}
            {todos && !todos.length && <Text style={styles.sub}>No to-dos are linked (or they were deleted).</Text>}
          </>
        )}
        {canManage && (
          <AnimatedPressable onPress={remove} style={styles.remove}>
            <Ionicons name="trash-outline" size={16} color={colors.red[600]} />
            <Text style={{ color: colors.red[600], fontWeight: '700', fontSize: fontSize.sm }}>Remove key result</Text>
          </AnimatedPressable>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 19 },
  input: { paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.gray[100], fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], outlineStyle: 'none' },
  todo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  todoText: { flex: 1, fontSize: fontSize.base, color: colors.gray[800], fontWeight: '600' },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.md },
});
