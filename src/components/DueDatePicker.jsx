import { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import BottomSheet from './BottomSheet';
import { toYmd, parseYmd, todayYmd, addDays, WEEKDAYS_SHORT, formatTime, formatDue } from '../utils/dates';

const TIME_PRESETS = ['09:00', '11:00', '14:00', '17:00', '19:00'];

function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return toYmd(d);
}

function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
  return toYmd(d);
}

/**
 * Todoist-style scheduler: quick picks, a month calendar and optional time.
 * onChange({ date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null })
 */
export default function DueDatePicker({ visible, onClose, date, time, onChange, allowTime = true }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState(() => parseYmd(date) || new Date());
  const [pickedTime, setPickedTime] = useState(time || null);

  useEffect(() => {
    if (visible) {
      setView(parseYmd(date) || new Date());
      setPickedTime(time || null);
    }
  }, [visible, date, time]);

  const choose = (ymd) => {
    onChange({ date: ymd, time: ymd ? pickedTime : null });
    onClose();
  };

  const quick = [
    { label: 'Today', icon: 'today-outline', color: '#058527', value: todayYmd() },
    { label: 'Tomorrow', icon: 'sunny-outline', color: '#ad6200', value: addDays(todayYmd(), 1) },
    { label: 'This weekend', icon: 'cafe-outline', color: '#246fe0', value: nextSaturday() },
    { label: 'Next week', icon: 'arrow-forward-circle-outline', color: '#692ec2', value: nextMonday() },
    { label: 'No date', icon: 'close-circle-outline', color: colors.gray[500], value: null },
  ];

  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayYmd();

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640}>
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.current}>{date ? `${formatDue(date)}${pickedTime ? ` · ${formatTime(pickedTime)}` : ''}` : 'No date'}</Text>
        {quick.map((q) => (
          <AnimatedPressable key={q.label} style={styles.quickRow} onPress={() => choose(q.value)} haptic="light">
            <Ionicons name={q.icon} size={20} color={q.color} />
            <Text style={styles.quickLabel}>{q.label}</Text>
            {q.value && <Text style={styles.quickHint}>{WEEKDAYS_SHORT[parseYmd(q.value).getDay()]}</Text>}
          </AnimatedPressable>
        ))}

        <View style={styles.calHeader}>
          <AnimatedPressable onPress={() => setView(new Date(year, month - 1, 1))} hitSlop={10} haptic="light">
            <Ionicons name="chevron-back" size={22} color={colors.gray[600]} />
          </AnimatedPressable>
          <Text style={styles.calTitle}>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          <AnimatedPressable onPress={() => setView(new Date(year, month + 1, 1))} hitSlop={10} haptic="light">
            <Ionicons name="chevron-forward" size={22} color={colors.gray[600]} />
          </AnimatedPressable>
        </View>
        <View style={styles.grid}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={`h${i}`} style={styles.weekday}>{d}</Text>
          ))}
          {cells.map((day, i) => {
            if (!day) return <View key={`e${i}`} style={styles.cell} />;
            const ymd = toYmd(new Date(year, month, day));
            const selected = ymd === date;
            const isToday = ymd === today;
            const past = ymd < today;
            return (
              <AnimatedPressable key={ymd} style={styles.cell} onPress={() => choose(ymd)} haptic="light">
                <View style={[styles.day, selected && styles.daySelected, isToday && !selected && styles.dayToday]}>
                  <Text style={[styles.dayText, past && styles.dayPast, selected && styles.dayTextSelected, isToday && !selected && styles.dayTextToday]}>
                    {day}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>

        {allowTime && (
          <>
            <Text style={styles.timeTitle}>Time (reminder)</Text>
            <View style={styles.timeRow}>
              <AnimatedPressable
                onPress={() => setPickedTime(null)}
                style={[styles.timeChip, !pickedTime && styles.timeChipActive]}
                haptic="light"
              >
                <Text style={[styles.timeText, !pickedTime && styles.timeTextActive]}>No time</Text>
              </AnimatedPressable>
              {TIME_PRESETS.map((tp) => (
                <AnimatedPressable
                  key={tp}
                  onPress={() => {
                    setPickedTime(tp);
                    onChange({ date: date || todayYmd(), time: tp });
                  }}
                  style={[styles.timeChip, pickedTime === tp && styles.timeChipActive]}
                  haptic="light"
                >
                  <Text style={[styles.timeText, pickedTime === tp && styles.timeTextActive]}>{formatTime(tp)}</Text>
                </AnimatedPressable>
              ))}
            </View>
            <Text style={styles.timeHint}>Tip: type times in quick add, e.g. "tomorrow 6:30pm".</Text>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  current: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray[900],
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  quickLabel: { flex: 1, fontSize: fontSize.base, color: colors.gray[800], fontWeight: '500' },
  quickHint: { fontSize: fontSize.sm, color: colors.gray[400] },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
  },
  calTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gray[900] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: fontSize.xs, color: colors.gray[400], fontWeight: '600', paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: '#dc4c3e' },
  dayToday: { borderWidth: 1.5, borderColor: '#dc4c3e' },
  dayText: { fontSize: fontSize.base, color: colors.gray[800] },
  dayPast: { color: colors.gray[400] },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dayTextToday: { color: '#dc4c3e', fontWeight: '700' },
  timeTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[600], marginTop: spacing.lg, paddingHorizontal: spacing.sm },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  timeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  timeChipActive: { backgroundColor: colors.brand[600] },
  timeText: { fontSize: fontSize.sm, color: colors.gray[700], fontWeight: '600' },
  timeTextActive: { color: colors.white },
  timeHint: { fontSize: fontSize.xs, color: colors.gray[400], marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
});
