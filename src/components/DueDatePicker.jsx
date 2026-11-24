import { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import BottomSheet from './BottomSheet';
import { toYmd, parseYmd, todayYmd, addDays, WEEKDAYS_SHORT, formatTime, formatDue } from '../utils/dates';
import { glass } from '../theme/glass';


const DIAL = 216;
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * A clock face: the first tap picks the hour, the second the minute (which sets the time and closes it). The hour
 * and minute in the heading can be tapped to go back; +1 / -1 fine-tunes the minute.
 */
function ClockDial({ colors, value, onPick }) {
  const init = useMemo(() => {
    const [h, m] = (value || '09:00').split(':').map(Number);
    return { h, m };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [stage, setStage] = useState('hour');
  const [h12, setH12] = useState(init.h % 12 === 0 ? 12 : init.h % 12);
  const [pm, setPm] = useState(init.h >= 12);
  const [min, setMin] = useState(init.m);
  const to24 = (h, isPm) => (h % 12) + (isPm ? 12 : 0);
  const emit = (h, m, isPm, close) => onPick(`${pad2(to24(h, isPm))}:${pad2(m)}`, close);
  const c = DIAL / 2;
  const r = c - 28;
  const nums = stage === 'hour' ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i * 5);
  const activeVal = stage === 'hour' ? h12 : min;
  const activeAngle = stage === 'hour' ? (h12 % 12) * 30 : min * 6;
  const onDial = stage === 'hour' || min % 5 === 0;
  const pos = (deg, rad) => ({ x: c + rad * Math.sin((deg * Math.PI) / 180), y: c - rad * Math.cos((deg * Math.PI) / 180) });
  const tip = pos(activeAngle, r);
  const big = { fontSize: 34, fontWeight: '700' };
  return (
    <View style={{ alignItems: 'center', marginTop: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AnimatedPressable onPress={() => setStage('hour')} haptic="light"><Text style={[big, { color: stage === 'hour' ? colors.brand[600] : colors.gray[400] }]}>{pad2(h12)}</Text></AnimatedPressable>
          <Text style={[big, { color: colors.gray[400] }]}>:</Text>
          <AnimatedPressable onPress={() => setStage('minute')} haptic="light"><Text style={[big, { color: stage === 'minute' ? colors.brand[600] : colors.gray[400] }]}>{pad2(min)}</Text></AnimatedPressable>
        </View>
        <View style={{ gap: 4 }}>
          {[['AM', false], ['PM', true]].map(([label, isPm]) => (
            <AnimatedPressable key={label} onPress={() => { setPm(isPm); emit(h12, min, isPm, false); }} haptic="light" style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: pm === isPm ? colors.brand[600] : colors.gray[100] }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: pm === isPm ? '#fff' : colors.gray[600] }}>{label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>
      <View style={{ width: DIAL, height: DIAL, borderRadius: DIAL / 2, backgroundColor: colors.gray[100] }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: c - 1, top: c - r, width: 2, height: r, backgroundColor: colors.brand[600], transform: [{ rotate: `${activeAngle}deg` }], transformOrigin: '50% 100%' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: c - 3, top: c - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand[600] }} />
        {!onDial && <View pointerEvents="none" style={{ position: 'absolute', left: tip.x - 4, top: tip.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[600] }} />}
        {nums.map((n) => {
          const p = pos(stage === 'hour' ? (n % 12) * 30 : n * 6, r);
          const active = onDial && n === activeVal;
          return (
            <AnimatedPressable
              key={n}
              haptic="light"
              onPress={() => {
                if (stage === 'hour') { setH12(n); setStage('minute'); emit(n, min, pm, false); } else { setMin(n); emit(h12, n, pm, true); }
              }}
              style={{ position: 'absolute', left: p.x - 18, top: p.y - 18, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.brand[600] : 'transparent' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: active ? '#fff' : colors.gray[800] }}>{stage === 'hour' ? n : pad2(n)}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
      {stage === 'minute' && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[-1, 1].map((d) => (
            <AnimatedPressable key={d} haptic="light" onPress={() => { const m = (min + d + 60) % 60; setMin(m); emit(h12, m, pm, false); }} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.gray[100] }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[700] }}>{d > 0 ? '+1 min' : '-1 min'}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
    </View>
  );
}

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

/** "5pm", "5:30 pm", "17:30", "1730" -> 'HH:MM', or null. */
export function parseTimeText(text) {
  const m = String(text || '').trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0; const ap = m[3];
  if (min > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap[0] === 'p' ? 12 : 0); } else if (h > 23) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

const TIME_PRESETS = ['09:00', '12:00', '15:00', '17:00', '18:00'];

/**
 * Date and optional time in one compact window: a month calendar, quick picks, and a time that can be typed
 * ("5pm", "17:30"), tapped from presets or set on a clock. Picking a date does not close it, so a time can follow;
 * Done applies and closes (closing any other way changes nothing). onChange({ date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null }).
 */
export default function DueDatePicker({ visible, onClose, date, time, onChange, allowTime = true }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState(() => parseYmd(date) || new Date());
  const [d, setD] = useState(date || null);
  const [pickedTime, setPickedTime] = useState(time || null);
  const [text, setText] = useState(time ? formatTime(time) : '');
  const [clockOpen, setClockOpen] = useState(false);
  const initialDate = date; const initialTime = time;

  useEffect(() => {
    if (visible) {
      setView(parseYmd(date) || new Date());
      setD(date || null);
      setPickedTime(time || null);
      setText(time ? formatTime(time) : '');
      setClockOpen(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choices are kept inside until Done, so a date and a time can be set one after the other.
  const apply = (nextDate, nextTime) => {
    setD(nextDate); setPickedTime(nextTime);
    setText(nextTime ? formatTime(nextTime) : '');
  };
  const chooseDate = (ymd) => {
    if (!allowTime) { onChange({ date: ymd, time: null }); onClose(); return; }
    if (ymd) setView(parseYmd(ymd));
    apply(ymd, ymd ? pickedTime : null);
  };
  const chooseTime = (v) => apply(d || todayYmd(), v);
  const commitText = () => {
    if (!text.trim()) { if (pickedTime) chooseTime(null); return; }
    const v = parseTimeText(text);
    if (v) chooseTime(v); else setText(pickedTime ? formatTime(pickedTime) : '');
  };
  const finish = () => {
    const typed = text.trim() ? (parseTimeText(text) || pickedTime) : null;
    const date = d || (typed ? todayYmd() : null);
    if (date || date !== (initialDate || null) || typed !== (initialTime || null)) onChange({ date, time: date ? typed : null });
    onClose();
  };

  const quick = [
    { label: 'Today', value: todayYmd() },
    { label: 'Tomorrow', value: addDays(todayYmd(), 1) },
    { label: 'Weekend', value: nextSaturday() },
    { label: 'Next week', value: nextMonday() },
    { label: 'No date', value: null },
  ];

  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayYmd();

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={720}>
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.sm }}>
        <Text style={styles.current}>{d ? `${formatDue(d)}${pickedTime ? ` · ${formatTime(pickedTime)}` : ''}` : 'No date'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {quick.map((q) => {
            const active = q.value === d;
            return (
              <AnimatedPressable key={q.label} onPress={() => chooseDate(q.value)} haptic="light" style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && { color: '#fff' }]}>{q.label}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        <View style={styles.calHeader}>
          <AnimatedPressable onPress={() => setView(new Date(year, month - 1, 1))} hitSlop={10} haptic="light" accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={22} color={colors.gray[600]} />
          </AnimatedPressable>
          <Text style={styles.calTitle}>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          <AnimatedPressable onPress={() => setView(new Date(year, month + 1, 1))} hitSlop={10} haptic="light" accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={colors.gray[600]} />
          </AnimatedPressable>
        </View>
        <View style={styles.grid}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
            <Text key={`h${i}`} style={styles.weekday}>{w}</Text>
          ))}
          {cells.map((day, i) => {
            if (!day) return <View key={`e${i}`} style={styles.cell} />;
            const ymd = toYmd(new Date(year, month, day));
            const selected = ymd === d;
            const isToday = ymd === today;
            const past = ymd < today;
            return (
              <AnimatedPressable key={ymd} style={styles.cell} onPress={() => chooseDate(ymd)} haptic="light">
                <View style={[styles.day, selected && styles.daySelected, isToday && !selected && styles.dayToday]}>
                  <Text style={[styles.dayText, past && styles.dayPast, selected && styles.dayTextSelected, isToday && !selected && styles.dayTextToday]}>{day}</Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>

        {allowTime && (
          <View style={styles.timeBlock}>
            <View style={styles.timeFieldRow}>
              <Ionicons name="time-outline" size={18} color={pickedTime ? colors.brand[600] : colors.gray[500]} />
              <TextInput
                value={text}
                onChangeText={setText}
                onBlur={commitText}
                onSubmitEditing={commitText}
                placeholder="Time, e.g. 5pm or 17:30 (optional)"
                placeholderTextColor={colors.gray[400]}
                accessibilityLabel="Time"
                style={styles.timeInput}
              />
              <AnimatedPressable onPress={() => setClockOpen((o) => !o)} hitSlop={8} haptic="light" accessibilityLabel="Pick the time on a clock">
                <Ionicons name={clockOpen ? 'chevron-up-circle-outline' : 'stopwatch-outline'} size={22} color={clockOpen ? colors.brand[600] : colors.gray[500]} />
              </AnimatedPressable>
              {!!pickedTime && (
                <AnimatedPressable onPress={() => { setClockOpen(false); chooseTime(null); }} hitSlop={8} haptic="light" accessibilityLabel="Remove the time">
                  <Ionicons name="close-circle" size={22} color={colors.gray[400]} />
                </AnimatedPressable>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {TIME_PRESETS.map((v) => (
                <AnimatedPressable key={v} onPress={() => chooseTime(v)} haptic="light" style={[styles.chip, pickedTime === v && styles.chipActive]}>
                  <Text style={[styles.chipText, pickedTime === v && { color: '#fff' }]}>{formatTime(v)}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
            {clockOpen && (
              <ClockDial colors={colors} value={pickedTime} onPick={(v, close) => { chooseTime(v); if (close) setClockOpen(false); }} />
            )}
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <AnimatedPressable onPress={() => { onChange({ date: null, time: null }); onClose(); }} haptic="light" style={styles.footerGhost}>
          <Text style={{ fontSize: fontSize.base, fontWeight: '600', color: colors.gray[600] }}>Clear</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={finish} haptic="light" style={styles.footerPrimary}>
          <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: '#fff' }}>Done</Text>
        </AnimatedPressable>
      </View>
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
  daySelected: { backgroundColor: '#D4621A' },
  dayToday: { borderWidth: 1.5, borderColor: '#D4621A' },
  dayText: { fontSize: fontSize.base, color: colors.gray[800] },
  dayPast: { color: colors.gray[400] },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dayTextToday: { color: '#D4621A', fontWeight: '700' },
  chips: { gap: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.gray[100] },
  chipActive: { backgroundColor: '#D4621A' },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[700] },
  timeBlock: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  timeInput: { flex: 1, paddingVertical: 8, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm, paddingHorizontal: spacing.sm },
  footerGhost: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.gray[100] },
  footerPrimary: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: '#D4621A' },
  timeTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[600], marginTop: spacing.lg, paddingHorizontal: spacing.sm },
  timeFieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.gray[100] },
  timeField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.gray[100], borderWidth: 1, borderColor: 'transparent' },
  timeFieldOpen: { borderColor: colors.brand[600] },
  timeFieldText: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
});
