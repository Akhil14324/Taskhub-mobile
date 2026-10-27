import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { parseYmd, todayYmd, formatDue } from '../../utils/dates';

/** Whole days from one 'YYYY-MM-DD' to another, without timezone shifts. */
export function dayDiff(from, to) {
  const a = parseYmd(from);
  const b = parseYmd(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/** "4 days left", "Starts 3 Nov", "Ended 2 days ago" for a sprint row. */
export function sprintTiming(sprint) {
  if (sprint.status === 'completed') return 'Finished';
  if (sprint.status === 'planned') return `Starts ${formatDue(sprint.starts_on)}`;
  const left = dayDiff(todayYmd(), sprint.ends_on);
  if (left > 1) return `${left} days left`;
  if (left === 1) return '1 day left';
  if (left === 0) return 'Ends today';
  return `${-left} day${left === -1 ? '' : 's'} over`;
}

/** The plain surface every workspace tab is built from. */
export function Card({ children, style }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Small capital heading above a group of cards. */
export function Heading({ children, right }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.headingRow}>
      <Text style={styles.heading}>{children}</Text>
      {right}
    </View>
  );
}

/** A quiet sentence of help or an empty state. */
export function Note({ children }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.note}>{children}</Text>;
}

/** A thin progress line. */
export function Meter({ percent }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.meter}>
      <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

/** "12 min" / "2 h 5 min" for a number of minutes. */
export function minutesText(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export const POINT_STEPS = [null, 1, 2, 3, 5, 8, 13, 21];
export const nextPoints = (current) => POINT_STEPS[(POINT_STEPS.indexOf(current ?? null) + 1) % POINT_STEPS.length];
export const pointsLabel = (p) => (p === null || p === undefined ? 'Points?' : `${p} pt${p === 1 ? '' : 's'}`);

export const TYPE_LABEL = { task: 'Task', feature: 'Feature', bug: 'Bug' };
export const TYPE_ICON = { task: 'checkbox-outline', feature: 'sparkles-outline', bug: 'bug-outline' };

const createStyles = (colors) => StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.xl,
    backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.sm,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: 2 },
  heading: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] },
  note: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 20 },
  meter: { height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' },
  meterFill: { height: 6, backgroundColor: colors.brand[500] },
});
