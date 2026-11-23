import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Chip } from '../kit';
import DueDatePicker from '../DueDatePicker';

export const PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'],
  ['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_month', 'Last month'],
];
export const DEFAULT_RANGE = { preset: 'last30' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "23 November 2026" from a YYYY-MM-DD. */
export const longDate = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  return y ? `${d} ${MONTHS[m - 1]} ${y}` : '';
};

/**
 * The date filter of the Team monitor: a row of compact presets plus a custom range (start, end, Apply, Reset).
 * `value` is what is applied: { preset } or { preset: 'custom', from, to }. The server resolves the presets, so the
 * days are always the company's calendar days.
 */
export default function DateFilterBar({ value, onChange, resolved }) {
  const colors = useColors();
  const custom = value.preset === 'custom';
  const [panel, setPanel] = useState(custom);
  const [from, setFrom] = useState(value.from || resolved?.from || null);
  const [to, setTo] = useState(value.to || resolved?.to || null);
  const [picking, setPicking] = useState(null); // 'from' | 'to'
  const [problem, setProblem] = useState('');

  // The panel starts from the days now showing.
  useEffect(() => { if (resolved && !custom) { setFrom(resolved.from); setTo(resolved.to); } }, [resolved, custom]);

  const apply = () => {
    if (!from || !to) { setProblem('Choose a start date and an end date.'); return; }
    if (from > to) { setProblem('The start date cannot be later than the end date.'); return; }
    setProblem('');
    onChange({ preset: 'custom', from, to });
  };
  const reset = () => { setProblem(''); setPanel(false); onChange(DEFAULT_RANGE); };
  const dateButton = (label, ymd, which) => (
    <AnimatedPressable onPress={() => setPicking(which)} accessibilityLabel={`${label}: ${ymd ? longDate(ymd) : 'not chosen'}`} style={{ flexGrow: 1, flexBasis: 170, borderWidth: 1, borderColor: problem ? colors.red[300] : colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.white }}>
      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: fontSize.base, fontWeight: '600', color: ymd ? colors.gray[900] : colors.gray[400] }}>{ymd ? longDate(ymd) : 'Choose a date'}</Text>
    </AnimatedPressable>
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, alignItems: 'center' }} style={{ flexGrow: 0 }}>
        {PRESETS.map(([key, label]) => (
          <Chip key={key} label={label} active={value.preset === key} onPress={() => { setPanel(false); setProblem(''); onChange({ preset: key }); }} />
        ))}
        <Chip icon="calendar-outline" label="Custom date range" active={custom || panel} onPress={() => setPanel((v) => !v)} />
      </ScrollView>
      {panel && (
        <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {dateButton('Start date', from, 'from')}
            {dateButton('End date', to, 'to')}
          </View>
          {!!problem && <Text style={{ color: colors.red[600], fontSize: fontSize.sm }}>{problem}</Text>}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <AnimatedPressable onPress={apply} accessibilityLabel="Apply filter" style={{ backgroundColor: colors.brand[600], borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.sm }}>Apply filter</Text>
            </AnimatedPressable>
            <AnimatedPressable onPress={reset} accessibilityLabel="Reset" style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="refresh" size={14} color={colors.gray[700]} />
              <Text style={{ color: colors.gray[800], fontWeight: '600', fontSize: fontSize.sm }}>Reset</Text>
            </AnimatedPressable>
          </View>
        </View>
      )}
      <DueDatePicker
        visible={!!picking}
        onClose={() => setPicking(null)}
        date={picking === 'from' ? from : to}
        allowTime={false}
        onChange={({ date }) => { if (date) { if (picking === 'from') setFrom(date); else setTo(date); setProblem(''); } }}
      />
    </View>
  );
}
