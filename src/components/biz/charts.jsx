import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { STATUS } from '../../utils/timeline';
import { formatDue } from '../../utils/dates';

const CHART_HEIGHT = 110;

/** Remaining points for each day of a sprint (bars) against the ideal pace (line). */
export function Burndown({ days }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!days || !days.length) return null;
  const top = Math.max(1, ...days.map((d) => Math.max(d.ideal, d.remaining ?? 0)));
  return (
    <View style={styles.chart}>
      <View style={[styles.plot, { height: CHART_HEIGHT }]}>
        {days.map((d) => {
          const barH = d.remaining === null ? 0 : Math.round((d.remaining / top) * CHART_HEIGHT);
          const idealH = Math.round((d.ideal / top) * CHART_HEIGHT);
          return (
            <View key={d.date} style={styles.col}>
              <View style={[styles.ideal, { bottom: idealH }]} />
              <View style={[styles.bar, { height: barH, backgroundColor: colors.brand[500] }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.hint}>{formatDue(days[0].date)}</Text>
        <Text style={styles.hint}>Bars: points left. Line: ideal pace.</Text>
        <Text style={styles.hint}>{formatDue(days[days.length - 1].date)}</Text>
      </View>
    </View>
  );
}

// Bottom of the stack to the top; every status gets its own shade of the one red.
const FLOW_STACK = ['done', 'in_review', 'in_progress', 'blocked', 'on_hold', 'todo'];
const FLOW_SHADE = { done: 700, in_review: 500, in_progress: 400, blocked: 900, on_hold: 300, todo: 200 };

/** Cumulative flow: how many tasks sat in each status at the end of each day. */
export function FlowChart({ days }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!days || !days.length) return null;
  const totalOf = (d) => FLOW_STACK.reduce((sum, k) => sum + (d[k] || 0), 0);
  const top = Math.max(1, ...days.map(totalOf));
  return (
    <View style={styles.chart}>
      <View style={[styles.plot, { height: CHART_HEIGHT }]}>
        {days.map((d) => (
          <View key={d.date} style={[styles.col, { justifyContent: 'flex-end' }]}>
            {/* Laid out top to bottom, so the first status of the stack (Done) goes last, at the bottom. */}
            {[...FLOW_STACK].reverse().map((k) => (
              <View key={k} style={{ height: Math.round(((d[k] || 0) / top) * CHART_HEIGHT), backgroundColor: colors.brand[FLOW_SHADE[k]] }} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        <Text style={styles.hint}>{formatDue(days[0].date)}</Text>
        <Text style={styles.hint}>{formatDue(days[days.length - 1].date)}</Text>
      </View>
      <View style={styles.legend}>
        {[...FLOW_STACK].reverse().map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.brand[FLOW_SHADE[k]] }]} />
            <Text style={styles.hint}>{STATUS[k].label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Vertical bars with a label under each: velocity per sprint, tasks finished per week. */
export function Columns({ rows, unit = '' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!rows || !rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.value || 0));
  return (
    <View style={styles.chart}>
      <View style={[styles.plot, { height: CHART_HEIGHT, alignItems: 'flex-end' }]}>
        {rows.map((r) => (
          <View key={r.key} style={[styles.col, { alignItems: 'center', justifyContent: 'flex-end' }]}>
            <Text style={styles.value}>{r.value === null || r.value === undefined ? '' : `${r.value}${unit}`}</Text>
            <View style={[styles.bar, { height: Math.max(2, Math.round(((r.value || 0) / top) * (CHART_HEIGHT - 16))), backgroundColor: colors.brand[500] }]} />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {rows.map((r) => <Text key={r.key} style={[styles.hint, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{r.label}</Text>)}
      </View>
    </View>
  );
}

/** Horizontal bars: who carries how much. */
export function HBars({ rows }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!rows || !rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.value || 0));
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => (
        <View key={r.key} style={{ gap: 3 }}>
          <View style={styles.hRow}>
            <Text style={styles.hLabel} numberOfLines={1}>{r.label}</Text>
            <Text style={styles.hint}>{r.note}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(((r.value || 0) / top) * 100)}%`, backgroundColor: r.hot ? colors.brand[700] : colors.brand[400] }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A number with a caption. */
export function Stat({ label, value, hint }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  chart: { gap: 4 },
  plot: { flexDirection: 'row', gap: 2 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  ideal: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.gray[400] },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  hint: { fontSize: 11, color: colors.gray[500] },
  value: { fontSize: 10, fontWeight: '800', color: colors.gray[700], marginBottom: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  hRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  hLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.gray[200], overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stat: { flex: 1, minWidth: 96, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray[100], gap: 2 },
  statValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  statLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[600] },
});
