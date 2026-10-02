import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../context/ThemeContext';
import { useEngage } from '../context/EngageContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import BackTitle from '../components/BackTitle';
import { Chip } from '../components/kit';
import useIsDesktop from '../hooks/useBreakpoint';
import { parseYmd, WEEKDAYS_SHORT, MONTHS_SHORT } from '../utils/dates';
import { formatSeconds } from '../utils/timeline';

const fmtDay = (ymd) => {
  const d = parseYmd(ymd);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

/** How this week compares with the one before it. `lowerIsBetter` flips what counts as good. */
function Delta({ now, before, lowerIsBetter = false, unit = '', colors }) {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  const diff = now - before;
  if (diff === 0) return <Text style={{ fontSize: 11, color: colors.gray[400], fontWeight: '700' }}>Same as last week</Text>;
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={good ? colors.brand[700] : colors.gray[500]} />
      <Text style={{ fontSize: 11, fontWeight: '800', color: good ? colors.brand[700] : colors.gray[500] }}>
        {Math.abs(Math.round(diff))}{unit} vs last week
      </Text>
    </View>
  );
}

/**
 * Your week in review: what you finished, how fast and how reliably, next to the week before.
 * It only ever compares you with yourself.
 */
export default function RecapScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { loadRecap } = useEngage();
  const [week, setWeek] = useState(1);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await loadRecap(week)); } catch { /* keep */ }
  }, [loadRecap, week]);
  useEffect(() => { setData(null); load(); }, [load]);

  const cur = data?.current;
  const prev = data?.previous;
  const max = Math.max(1, ...(cur?.days || []).map((x) => x.count));

  const tiles = cur ? [
    { icon: 'checkmark-done', label: 'Finished', value: cur.completed, delta: <Delta now={cur.completed} before={prev.completed} colors={colors} /> },
    {
      icon: 'alarm', label: 'On time', value: cur.on_time_rate === null ? '-' : `${cur.on_time_rate}%`,
      delta: <Delta now={cur.on_time_rate} before={prev.on_time_rate} unit=" pts" colors={colors} />,
    },
    {
      icon: 'speedometer', label: 'Average time to finish', value: cur.avg_cycle_s ? formatSeconds(cur.avg_cycle_s) : '-',
      delta: <Delta now={cur.avg_cycle_s ? Math.round(cur.avg_cycle_s / 3600) : null} before={prev.avg_cycle_s ? Math.round(prev.avg_cycle_s / 3600) : null} unit="h" lowerIsBetter colors={colors} />,
    },
    { icon: 'document-text', label: 'Updates posted', value: cur.updates, delta: <Delta now={cur.updates} before={prev.updates} colors={colors} /> },
    { icon: 'hand-left', label: 'Blockers cleared', value: cur.blockers_cleared, delta: <Delta now={cur.blockers_cleared} before={prev.blockers_cleared} colors={colors} /> },
    { icon: 'heart', label: 'Kudos received', value: cur.kudos_received, delta: <Delta now={cur.kudos_received} before={prev.kudos_received} colors={colors} /> },
  ] : [];

  return (
    <View style={[styles.container, { paddingTop: desktop ? spacing.lg : insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 80 + insets.bottom }]}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <BackTitle title="Week in review" style={styles.title} />
        <View style={styles.tabs}>
          <Chip label="Last week" active={week === 1} onPress={() => setWeek(1)} />
          <Chip label="This week so far" active={week === 0} onPress={() => setWeek(0)} />
          <Chip label="Two weeks ago" active={week === 2} onPress={() => setWeek(2)} />
        </View>

        {!cur ? (
          <Text style={styles.sub}>Loading your week...</Text>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.range}>{fmtDay(cur.start)} to {fmtDay(cur.end)}</Text>
              <Text style={styles.big}>{cur.completed}</Text>
              <Text style={styles.bigLabel}>{cur.completed === 1 ? 'task finished' : 'tasks finished'}</Text>
              <Delta now={cur.completed} before={prev.completed} colors={colors} />
              <View style={styles.bars}>
                {cur.days.map((x) => (
                  <View key={x.day} style={styles.barCol}>
                    <Text style={styles.barCount}>{x.count || ''}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${Math.max(x.count ? 8 : 3, (x.count / max) * 100)}%` }, x.day === cur.busiest_day && styles.barTop]} />
                    </View>
                    <Text style={[styles.barLabel, x.day === cur.busiest_day && { color: colors.gray[900], fontWeight: '800' }]}>{WEEKDAYS_SHORT[parseYmd(x.day).getDay()][0]}</Text>
                  </View>
                ))}
              </View>
              {cur.busiest_day && <Text style={styles.sub}>Busiest day: {WEEKDAYS_SHORT[parseYmd(cur.busiest_day).getDay()]} {fmtDay(cur.busiest_day)}</Text>}
            </View>

            <View style={styles.grid}>
              {tiles.map((t) => (
                <View key={t.label} style={styles.tile}>
                  <View style={styles.tileIcon}><Ionicons name={t.icon} size={16} color={colors.brand[700]} /></View>
                  <Text style={styles.tileValue}>{t.value}</Text>
                  <Text style={styles.tileLabel}>{t.label}</Text>
                  <View style={{ marginTop: 4 }}>{t.delta}</View>
                </View>
              ))}
            </View>

            {cur.quickest && (
              <View style={styles.card}>
                <Ionicons name="flash" size={18} color={colors.brand[600]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Quickest finish</Text>
                  <Text style={styles.sub} numberOfLines={2}>{cur.quickest.title} in {formatSeconds(cur.quickest.cycle_s)}</Text>
                </View>
              </View>
            )}
            <View style={styles.card}>
              <Ionicons name="flame" size={18} color={colors.brand[600]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{data.streak}-day streak</Text>
                <Text style={styles.sub}>Your best is {data.longest_streak} days.</Text>
              </View>
            </View>
            <Text style={styles.foot}>This only compares you with your own previous week.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 820, width: '100%', alignSelf: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  hero: {
    alignItems: 'center', padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 2,
  },
  range: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] },
  big: { fontSize: 64, fontWeight: '800', color: colors.brand[600], letterSpacing: -2, lineHeight: 72 },
  bigLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[700], marginBottom: 4 },
  bars: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.xl },
  barCol: { flex: 1, alignItems: 'center' },
  barCount: { fontSize: 11, fontWeight: '800', color: colors.gray[600], height: 16 },
  barTrack: { height: 90, width: '100%', maxWidth: 30, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6, backgroundColor: colors.brand[200] },
  barTop: { backgroundColor: colors.brand[600] },
  barLabel: { fontSize: 11, color: colors.gray[400], marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1, flexBasis: 150, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  tileIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand[50], alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  tileLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.gray[500], marginTop: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900] },
  foot: { fontSize: fontSize.xs, color: colors.gray[400], textAlign: 'center', marginTop: spacing.sm },
});
