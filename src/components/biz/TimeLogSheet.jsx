import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import { formatDue, todayYmd, addDays } from '../../utils/dates';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

const QUICK = [15, 30, 60, 120, 240];
const label = (m) => (m < 60 ? `${m} min` : `${m / 60} h`);

/** Log time spent on a business task. `todo` is { id, title }. */
export default function TimeLogSheet({ visible, onClose, todo, onLogged }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMinutes(''); setDate(todayYmd()); setNote(''); setBillable(true); setDateOpen(false);
  }, [visible]);

  const value = parseInt(minutes, 10) || 0;
  const submit = async () => {
    if (value < 1 || value > 1440) return showToast({ message: 'Enter the time in minutes, from 1 to 1440', icon: 'alert-circle' });
    setBusy(true);
    try {
      await api.post('/time/log', { todo_id: todo.id, minutes: value, log_date: date, note: note.trim(), billable });
      showToast({ message: 'Time logged. A manager will review it.', icon: 'timer-outline' });
      onLogged?.();
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not log the time', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={560}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Log time</Text>
        <Text style={styles.hint} numberOfLines={2}>{todo?.title}</Text>

        <Text style={styles.label}>How long</Text>
        <View style={styles.row}>
          {QUICK.map((m) => <Chip key={m} small label={label(m)} active={value === m} onPress={() => setMinutes(String(m))} />)}
        </View>
        <TextInput value={minutes} onChangeText={(v) => setMinutes(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="Or type the minutes" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={4} />

        <Text style={styles.label}>When</Text>
        <View style={styles.row}>
          <Chip small label="Today" active={date === todayYmd()} onPress={() => setDate(todayYmd())} />
          <Chip small label="Yesterday" active={date === addDays(todayYmd(), -1)} onPress={() => setDate(addDays(todayYmd(), -1))} />
          <Chip small icon="calendar-outline" label={date !== todayYmd() && date !== addDays(todayYmd(), -1) ? formatDue(date) : 'Pick a day'} onPress={() => setDateOpen(true)} />
        </View>

        <TextInput value={note} onChangeText={setNote} placeholder="What did you do? (optional)" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { marginTop: spacing.md }]} maxLength={300} />
        <View style={styles.row}>
          <Chip small icon={billable ? 'cash' : 'cash-outline'} label={billable ? 'Billable' : 'Not billable'} active={billable} onPress={() => setBillable((b) => !b)} />
        </View>

        <PrimaryButton onPress={submit} loading={busy} disabled={value < 1} style={{ marginTop: spacing.lg }}>Log time</PrimaryButton>
      </View>
      <DueDatePicker visible={dateOpen} onClose={() => setDateOpen(false)} date={date} allowTime={false} onChange={({ date: d }) => { if (d && d <= todayYmd()) setDate(d); setDateOpen(false); }} />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, gap: 6 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500] },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  input: { marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100], fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
});
