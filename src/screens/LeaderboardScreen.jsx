import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, EmptyHero } from '../components/kit';
import { formatSeconds } from '../utils/timeline';

const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: '30 days' },
  { key: 'quarter', label: '90 days' },
  { key: 'all', label: 'All time' },
];

function Metric({ icon, value, label }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', minWidth: 56 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Ionicons name={icon} size={13} color={colors.gray[500]} />
        <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900] }}>{value}</Text>
      </View>
      <Text style={{ fontSize: 10, color: colors.gray[500], marginTop: 1 }}>{label}</Text>
    </View>
  );
}

/** Who finished what. Simple counts, on-time share and streaks; no scores or weights. */
export default function LeaderboardScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { businesses } = useTodos();
  const [period, setPeriod] = useState('week');
  const [businessId, setBusinessId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p = period, b = businessId) => {
    try {
      const res = await api.get('/engage/leaderboard', { params: { period: p, business_id: b || undefined }, __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the leaderboard');
    }
  }, [period, businessId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const people = data?.people || [];
  const top = people.filter((p) => p.completed > 0).slice(0, 3);
  const best = people.reduce((m, p) => Math.max(m, p.completed), 0) || 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Leaderboard" style={styles.title} />
        <Text style={styles.subtitle}>Who finished the most work, and who keeps a streak going</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PERIODS.map((p) => (
            <Chip key={p.key} label={p.label} active={period === p.key} onPress={() => { setPeriod(p.key); load(p.key, businessId); }} />
          ))}
        </ScrollView>
        {businesses.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip icon="globe-outline" label={data?.company ? 'All businesses' : 'My businesses'} active={!businessId} onPress={() => { setBusinessId(null); load(period, null); }} />
            {businesses.map((b) => (
              <Chip key={b.id} icon="briefcase-outline" label={b.name} active={businessId === b.id} onPress={() => { setBusinessId(b.id); load(period, b.id); }} />
            ))}
          </ScrollView>
        )}

        {!data && !error && <SkeletonList count={5} type="notification" />}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}

        {!!data && (
          <View {...glass('card')} style={styles.totals}>
            <Metric icon="checkmark-done" value={data.totals.completed} label="finished" />
            <Metric icon="hourglass-outline" value={data.totals.open} label="open" />
            <Metric icon="alert-circle-outline" value={data.totals.overdue} label="overdue" />
            <Metric icon="people-outline" value={people.length} label="people" />
          </View>
        )}

        {top.length > 0 && (
          <View style={styles.podium}>
            {top.map((p) => (
              <View key={p.id} {...glass('card')} style={[styles.podiumCard, p.rank === 1 && styles.podiumFirst]}>
                <View style={styles.medal}><Text style={styles.medalText}>{p.rank}</Text></View>
                <Avatar name={p.name} uri={p.profile_picture} size={p.rank === 1 ? 54 : 44} />
                <Text style={styles.podiumName} numberOfLines={1}>{p.is_me ? 'You' : p.name.split(' ')[0]}</Text>
                <Text style={styles.podiumCount}>{p.completed}</Text>
                <Text style={styles.podiumLabel}>finished</Text>
              </View>
            ))}
          </View>
        )}

        {people.map((p) => (
          <View key={p.id} {...glass('card')} style={[styles.row, p.is_me && styles.rowMe]}>
            <Text style={styles.rank}>{p.completed > 0 ? p.rank : '-'}</Text>
            <Avatar name={p.name} uri={p.profile_picture} size={38} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={styles.name} numberOfLines={1}>{p.name}{p.is_me ? ' (you)' : ''}</Text>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(p.completed ? 4 : 0, Math.round((p.completed / best) * 100))}%` }]} /></View>
            </View>
            <View style={styles.metrics}>
              <Metric icon="checkmark-circle-outline" value={p.completed} label="finished" />
              <Metric icon="time-outline" value={p.on_time_rate === null ? '-' : `${p.on_time_rate}%`} label="on time" />
              <Metric icon="flame-outline" value={p.streak} label="streak" />
            </View>
          </View>
        ))}
        {!!data && people.length === 0 && <EmptyHero icon="trophy-outline" title="Nobody yet" message="Finish a task and you will show up here." />}
        {!!data && people.length > 0 && (
          <Text style={styles.foot}>
            Streak counts working days in a row with something finished. On time is the share of finished tasks done by their date.
            {top.length > 0 && people[0]?.avg_cycle_s ? ` The leader takes about ${formatSeconds(people[0].avg_cycle_s)} per task.` : ''}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.xs },
  totals: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white },
  podium: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, alignItems: 'flex-end' },
  podiumCard: { flex: 1, maxWidth: 240, alignItems: 'center', gap: 3, paddingVertical: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white },
  podiumFirst: { paddingVertical: spacing.lg },
  medal: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  podiumName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900], maxWidth: 100 },
  podiumCount: { fontSize: fontSize.xl, fontWeight: '800', color: colors.brand[700] },
  podiumLabel: { fontSize: 10, color: colors.gray[500] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white },
  rowMe: { borderWidth: 1.5, borderColor: colors.brand[400] },
  rank: { width: 22, textAlign: 'center', fontSize: fontSize.md, fontWeight: '800', color: colors.gray[500] },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand[600] },
  metrics: { flexDirection: 'row', gap: spacing.xs },
  foot: { fontSize: 12, color: colors.gray[500], marginHorizontal: spacing.lg, marginTop: spacing.lg, lineHeight: 18 },
});
