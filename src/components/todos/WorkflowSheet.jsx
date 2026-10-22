import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { Chip } from '../kit';
import { formatDue, todayYmd } from '../../utils/dates';
import { showToast } from '../../utils/events';
import api from '../../api/client';

const EVERY = [{ key: 'weekly', label: 'Every week' }, { key: 'monthly', label: 'Every month' }, { key: 'daily', label: 'Every day' }];

/**
 * Make (or edit the basics of) a workflow: a process that starts itself and creates its to-do and steps each
 * round. `initial` fills it from a suggestion; `todoId` builds it from an existing to-do and its steps.
 */
export default function WorkflowSheet({ visible, onClose, initial = null, todoId = null, onSaved }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [lines, setLines] = useState('');
  const [recurrence, setRecurrence] = useState('monthly');
  const [sequential, setSequential] = useState(false);
  const [date, setDate] = useState(todayYmd());
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name || '');
    setLines((initial?.steps || []).map((s) => s.title).join('\n'));
    setRecurrence(initial?.recurrence || 'monthly');
    setSequential(!!initial?.sequential);
    setDate(initial?.next_run_date || todayYmd());
  }, [visible, initial]);

  const save = async () => {
    setSaving(true);
    try {
      if (todoId) {
        await api.post(`/workflows/from-todo/${todoId}`, { name: name.trim() || undefined, recurrence, sequential, next_run_date: date });
      } else {
        const titles = lines.split('\n').map((l) => l.trim()).filter(Boolean);
        // Keep each step's person and timing when its name is unchanged.
        const steps = titles.map((title, i) => {
          const old = (initial?.steps || [])[i];
          return old && old.title === title ? { title, assignee_id: old.assignee_id, offset_days: old.offset_days } : { title };
        });
        await api.post('/workflows', { name: name.trim(), steps, recurrence, sequential, next_run_date: date, business_id: initial?.business_id });
      }
      showToast({ message: 'Workflow saved. It will start by itself.', tone: 'success', icon: 'repeat' });
      onSaved?.();
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the workflow', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={700} avoidKeyboard>
      <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ paddingHorizontal: spacing.sm }} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Ionicons name="repeat" size={18} color={colors.brand[600]} />
          <Text style={styles.title}>Make it start by itself</Text>
        </View>
        <Text style={styles.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. GST filing" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} />

        {!todoId && (
          <>
            <Text style={styles.label}>Steps, one per line</Text>
            <TextInput value={lines} onChangeText={setLines} multiline placeholder={'Collect the invoices\nReconcile\nFile the return'} placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]} />
          </>
        )}
        {!!todoId && <Text style={styles.hint}>The steps of this to-do become the steps of every round.</Text>}

        <Text style={styles.label}>How often</Text>
        <View style={styles.chips}>
          {EVERY.map((e) => <Chip key={e.key} small label={e.label} active={recurrence === e.key} onPress={() => setRecurrence(e.key)} />)}
        </View>

        <Text style={styles.label}>First round starts</Text>
        <AnimatedPressable style={styles.dateBtn} onPress={() => setDateOpen(true)}>
          <Ionicons name="calendar-outline" size={17} color={colors.gray[600]} />
          <Text style={styles.dateText}>{formatDue(date)}</Text>
        </AnimatedPressable>

        <AnimatedPressable style={styles.toggle} onPress={() => setSequential((v) => !v)}>
          <Ionicons name={sequential ? 'toggle' : 'toggle-outline'} size={32} color={sequential ? colors.brand[600] : colors.gray[400]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>One step at a time</Text>
            <Text style={styles.hint}>The next step only appears once the person who set the work says "Go ahead" on the one before.</Text>
          </View>
        </AnimatedPressable>

        <AnimatedPressable style={[styles.go, (saving || !name.trim() && !todoId) && { opacity: 0.5 }]} disabled={saving || (!name.trim() && !todoId)} onPress={save}>
          <Text style={styles.goText}>{saving ? 'Saving...' : 'Save workflow'}</Text>
        </AnimatedPressable>
      </ScrollView>
      <DueDatePicker visible={dateOpen} onClose={() => setDateOpen(false)} date={date} allowTime={false} onChange={({ date: d }) => d && setDate(d)} />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  label: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.md, marginBottom: 6 },
  input: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: colors.gray[100], borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  dateText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[800] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.lg },
  toggleTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  go: { backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  goText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});
