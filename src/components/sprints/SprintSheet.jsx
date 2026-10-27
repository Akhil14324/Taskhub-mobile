import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import { formatDue, todayYmd, addDays } from '../../utils/dates';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

const DEFAULT_LENGTH_DAYS = 13;

/** Create or edit a sprint of one business. `sprint` is the sprint being edited, or null to create one. */
export default function SprintSheet({ visible, onClose, onSaved, businessId, sprint }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState(todayYmd());
  const [end, setEnd] = useState(addDays(todayYmd(), DEFAULT_LENGTH_DAYS));
  const [picking, setPicking] = useState(null); // 'start' | 'end' | null
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(sprint?.name || '');
    setGoal(sprint?.goal || '');
    setStart(sprint?.starts_on || todayYmd());
    setEnd(sprint?.ends_on || addDays(todayYmd(), DEFAULT_LENGTH_DAYS));
    setPicking(null);
  }, [visible, sprint]);

  const submit = async () => {
    if (!name.trim()) return showToast({ message: 'Give the sprint a name', icon: 'alert-circle' });
    if (end < start) return showToast({ message: 'The end date must be after the start', icon: 'alert-circle' });
    setBusy(true);
    try {
      const body = { name: name.trim(), goal: goal.trim(), starts_on: start, ends_on: end };
      const res = sprint
        ? await api.put(`/sprints/${sprint.id}`, body)
        : await api.post('/sprints', { ...body, business_id: businessId });
      showToast({ message: sprint ? 'Sprint saved' : 'Sprint planned', icon: 'flag' });
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the sprint', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const lengthDays = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={620}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>{sprint ? 'Edit sprint' : 'Plan a sprint'}</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Sprint name, e.g. Sprint 14" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={120} autoFocus />
        <TextInput value={goal} onChangeText={setGoal} placeholder="Sprint goal (optional)" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { minHeight: 56 }]} multiline maxLength={300} />

        <Text style={styles.label}>Dates</Text>
        <View style={styles.row}>
          <Chip small icon="play" label={`Starts ${formatDue(start)}`} onPress={() => setPicking('start')} />
          <Chip small icon="flag" label={`Ends ${formatDue(end)}`} onPress={() => setPicking('end')} />
        </View>
        <Text style={styles.hint}>{lengthDays} day{lengthDays === 1 ? '' : 's'}. Only one sprint can run at a time in a business.</Text>

        <PrimaryButton onPress={submit} loading={busy} style={{ marginTop: spacing.lg }}>{sprint ? 'Save sprint' : 'Plan sprint'}</PrimaryButton>
        <AnimatedPressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
      </ScrollView>
      <DueDatePicker
        visible={picking !== null}
        onClose={() => setPicking(null)}
        date={picking === 'end' ? end : start}
        allowTime={false}
        onChange={({ date }) => {
          if (date) {
            if (picking === 'start') setStart(date);
            else setEnd(date);
          }
          setPicking(null);
        }}
      />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 6 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.sm },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.md },
  hint: { fontSize: fontSize.xs, color: colors.gray[500], lineHeight: 17 },
  input: {
    marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100],
    fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[600] },
});
