import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Chip } from '../components/kit';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';

const RANGES = [{ days: 1, label: 'Yesterday' }, { days: 7, label: 'This week' }, { days: 30, label: '30 days' }];

function Tile({ label, value, hot, styles }) {
  return (
    <View {...glass('card')} style={styles.tile}>
      <Text style={[styles.tileValue, hot && styles.hot]}>{value ?? '-'}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Block({ title, icon, rows, styles, colors, onOpen }) {
  if (!rows.length) return null;
  return (
    <View {...glass('card')} style={styles.block}>
      <View style={styles.blockHead}>
        <Ionicons name={icon} size={16} color={colors.brand[600]} />
        <Text style={styles.blockTitle}>{title}</Text>
      </View>
      {rows.map((r, i) => (
        <AnimatedPressable key={i} style={styles.line} onPress={r.id ? () => onOpen(r.id) : undefined}>
          <Text style={styles.lineMain} numberOfLines={1}>{r.main}</Text>
          <Text style={styles.lineSub} numberOfLines={2}>{r.sub}</Text>
        </AnimatedPressable>
      ))}
    </View>
  );
}

/** The weekly report for leadership: the numbers the app keeps, in the order a leader reads them. */
export default function ReportsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const route = useRoute();
  const [days, setDays] = useState(route.params?.range === 1 ? 1 : 7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (d = days) => {
    try {
      const res = d === 1
        ? await api.get('/reports/daily', { __skipOops: true, timeout: 60000 })
        : await api.get('/reports/weekly', { params: { days: d }, __skipOops: true, timeout: 60000 });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the report');
    }
  }, [days]);
  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  const open = (id) => navigation.navigate('Main', { screen: 'Todos', params: { highlightId: id } });
  const t = data?.totals;

  return (
    <View style={{ flex: 1, paddingTop: desktop ? spacing.lg : insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(days); setRefreshing(false); }} />}
      >
        <BackTitle title="Weekly report" />
        <View style={styles.ranges}>
          {RANGES.map((r) => <Chip key={r.days} small label={r.label} active={days === r.days} onPress={() => { setDays(r.days); setData(null); }} />)}
        </View>

        {!data && !error && <SkeletonList count={4} />}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {data && (
          <>
            {!!data.narrative && (
              <View {...glass('card')} style={styles.narrative}>
                <View style={styles.blockHead}><Ionicons name="sparkles" size={16} color={colors.brand[600]} /><Text style={styles.blockTitle}>{days === 1 ? 'Yesterday in short' : 'In short'}</Text></View>
                <Text style={styles.narrativeText}>{data.narrative}</Text>
              </View>
            )}
            {days === 1 && t && (
              <>
                <View style={styles.tiles}>
                  <Tile styles={styles} label="Finished" value={t.finished} />
                  <Tile styles={styles} label="New roadblocks" value={t.new_blockers} hot={t.new_blockers > 0} />
                  <Tile styles={styles} label="Overdue now" value={t.overdue} hot={t.overdue > 0} />
                </View>
                <Block styles={styles} colors={colors} onOpen={open} title="Who finished the most" icon="trophy-outline"
                  rows={(data.top || []).map((p) => ({ main: p.who || 'Someone', sub: `${p.n} finished${p.business ? ` in ${p.business}` : ''}` }))} />
                <Block styles={styles} colors={colors} onOpen={open} title="New roadblocks" icon="hand-left-outline"
                  rows={(data.blockers || []).map((b) => ({ main: b.title, sub: b.business || '' }))} />
                <Block styles={styles} colors={colors} onOpen={open} title="By business" icon="briefcase-outline"
                  rows={(data.businesses || []).map((b) => ({ main: b.name, sub: `${b.finished} finished · ${b.overdue} overdue · ${b.blocked} stuck` }))} />
              </>
            )}
            {days !== 1 && t && (
              <View style={styles.tiles}>
                <Tile styles={styles} label="Finished" value={t.completed} />
                <Tile styles={styles} label="Open" value={t.open} />
                <Tile styles={styles} label="Overdue" value={t.overdue} hot={t.overdue > 0} />
                <Tile styles={styles} label="Stuck" value={t.blocked} hot={t.blocked > 0} />
              </View>
            )}

            {days !== 1 && data.businesses.length > 0 && (
              <View {...glass('card')} style={styles.block}>
                <View style={styles.blockHead}><Ionicons name="briefcase-outline" size={16} color={colors.brand[600]} /><Text style={styles.blockTitle}>Businesses, weakest first</Text></View>
                {data.businesses.map((b) => (
                  <View key={b.id} style={styles.line}>
                    <View style={styles.bizTop}>
                      <Text style={styles.lineMain} numberOfLines={1}>{b.name}</Text>
                      <Text style={[styles.score, b.level === 'red' && styles.hot]}>{b.score}</Text>
                    </View>
                    <Text style={styles.lineSub}>
                      {b.completed} finished{b.completed_change !== null ? ` (${b.completed_change > 0 ? '+' : ''}${b.completed_change}%)` : ''}
                      {b.on_time_rate !== null ? ` · ${b.on_time_rate}% on time` : ''} · {b.open} open · {b.overdue} overdue · {b.blocked} stuck
                    </Text>
                    {!!(b.reasons || []).length && <Text style={styles.lineSub}>{b.reasons.join(' · ')}</Text>}
                  </View>
                ))}
              </View>
            )}

            {days !== 1 && <>
            <Block styles={styles} colors={colors} onOpen={open} title="Waiting on a decision" icon="flag-outline"
              rows={data.waiting.map((w) => ({ id: w.id, main: w.title, sub: `${w.parent} · waiting ${w.days} day${w.days === 1 ? '' : 's'}` }))} />
            <Block styles={styles} colors={colors} onOpen={open} title="Stuck for 2+ days" icon="hand-left-outline"
              rows={data.stuck.map((s) => ({ id: s.id, main: s.title, sub: `${s.business}${s.who ? ` · ${s.who}` : ''} · ${s.days} days${s.note ? ` · ${s.note}` : ''}` }))} />
            <Block styles={styles} colors={colors} onOpen={open} title="Most overdue" icon="alarm-outline"
              rows={data.late.map((l) => ({ id: l.id, main: l.title, sub: `${l.business}${l.who ? ` · ${l.who}` : ''} · ${l.days_late} day${l.days_late === 1 ? '' : 's'} late` }))} />
            <Block styles={styles} colors={colors} onOpen={open} title="Overloaded people" icon="people-outline"
              rows={data.overloaded.map((p) => ({ main: p.name, sub: `${p.open} open, ${p.overdue} overdue` }))} />
            </>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  ranges: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  error: { color: colors.red[600], fontSize: fontSize.base },
  narrative: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  narrativeText: { fontSize: fontSize.base, lineHeight: 22, color: colors.gray[800], marginTop: 6 },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  tile: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  tileValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  tileLabel: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  hot: { color: colors.brand[600] },
  block: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  blockTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  line: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  lineMain: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900], flex: 1 },
  lineSub: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  bizTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[700] },
});
