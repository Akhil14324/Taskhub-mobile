import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import PersonSheet from './PersonSheet';
import useDirectory from '../../hooks/useDirectory';
import { formatDue } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import { glass } from '../../theme/glass';

export const RELEASE_STAGES = [
  { key: 'plan', label: 'Planning' },
  { key: 'build', label: 'Building' },
  { key: 'test', label: 'Testing' },
  { key: 'released', label: 'Released' },
];

/** Create or edit an epic or a release (`kind`). `value` is the item being edited, or null to create one. */
export default function WorkItemSheet({ visible, onClose, kind, businessId, value, onSaved }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { people } = useDirectory();
  const isEpic = kind === 'epic';
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [ownerId, setOwnerId] = useState(null);
  const [date, setDate] = useState(null);
  const [stage, setStage] = useState('plan');
  const [done, setDone] = useState(false);
  const [picking, setPicking] = useState(null); // 'owner' | 'date' | null
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(value?.name || '');
    setText((isEpic ? value?.description : value?.notes) || '');
    setOwnerId(value?.owner_id || null);
    setDate((isEpic ? value?.due_on : value?.release_on) || null);
    setStage(value?.stage || 'plan');
    setDone(value?.status === 'done');
    setPicking(null);
  }, [visible, value, isEpic]);

  const path = isEpic ? 'epics' : 'releases';
  const ownerName = people.find((p) => p.id === ownerId)?.name || value?.owner_name || null;

  const save = async () => {
    if (!name.trim()) return showToast({ message: `Give the ${isEpic ? 'epic' : 'release'} a name`, icon: 'alert-circle' });
    setBusy(true);
    try {
      const body = isEpic
        ? { name: name.trim(), description: text.trim(), owner_id: ownerId, due_on: date, ...(value ? { status: done ? 'done' : 'open' } : {}) }
        : { name: name.trim(), notes: text.trim(), owner_id: ownerId, release_on: date, ...(value ? { stage } : {}) };
      const res = value
        ? await api.put(`/workspace/${path}/${value.id}`, body)
        : await api.post(`/workspace/${path}`, { ...body, business_id: businessId });
      onSaved(res.data);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${value.name}”?`,
      message: 'Its tasks stay where they are, just without it.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await api.delete(`/workspace/${path}/${value.id}`);
      onSaved(res.data);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete', icon: 'alert-circle' });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={640}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>{value ? `Edit ${isEpic ? 'epic' : 'release'}` : `New ${isEpic ? 'epic' : 'release'}`}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={isEpic ? 'Epic name, e.g. Onboarding' : 'Release name, e.g. v1.4'} placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={120} autoFocus />
        <TextInput value={text} onChangeText={setText} placeholder={isEpic ? 'What is this epic about? (optional)' : 'Notes (optional)'} placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { minHeight: 56 }]} multiline maxLength={500} />

        <Text style={styles.label}>{isEpic ? 'Owner and date' : 'Owner and release date'}</Text>
        <View style={styles.row}>
          <Chip small icon="person-outline" label={ownerName || 'No owner'} active={!!ownerId} onPress={() => setPicking('owner')} />
          <Chip small icon="calendar-outline" label={date ? formatDue(date) : 'No date'} active={!!date} onPress={() => setPicking('date')} />
          {!!date && <Chip small icon="close" label="Clear date" onPress={() => setDate(null)} />}
        </View>

        {!!value && !isEpic && (
          <>
            <Text style={styles.label}>Stage</Text>
            <View style={styles.row}>
              {RELEASE_STAGES.map((s) => <Chip key={s.key} small label={s.label} active={stage === s.key} onPress={() => setStage(s.key)} />)}
            </View>
          </>
        )}
        {!!value && isEpic && (
          <View style={styles.row}>
            <Chip small icon={done ? 'checkmark-circle' : 'ellipse-outline'} label={done ? 'Done' : 'Still open'} active={done} onPress={() => setDone((d) => !d)} />
          </View>
        )}

        <PrimaryButton onPress={save} loading={busy} style={{ marginTop: spacing.lg }}>{value ? 'Save' : 'Create'}</PrimaryButton>
        {!!value && (
          <AnimatedPressable onPress={remove} style={styles.remove}>
            <Text style={styles.removeText}>Delete {isEpic ? 'epic' : 'release'}</Text>
          </AnimatedPressable>
        )}
      </ScrollView>
      <PersonSheet visible={picking === 'owner'} onClose={() => setPicking(null)} businessId={businessId} title="Who owns it?" onPick={(p) => setOwnerId(p.id)} />
      <DueDatePicker
        visible={picking === 'date'}
        onClose={() => setPicking(null)}
        date={date}
        allowTime={false}
        onChange={({ date: d }) => { if (d) setDate(d); setPicking(null); }}
      />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 6 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.sm },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.md },
  input: {
    marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100],
    fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  remove: { alignItems: 'center', paddingVertical: spacing.md },
  removeText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
});
