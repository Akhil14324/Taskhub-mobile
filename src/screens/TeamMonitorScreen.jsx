import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { useColors, useTheme } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, EmptyHero } from '../components/kit';
import { HealthPill } from '../components/todos/TimeHealth';
import { formatSeconds, healthColor } from '../utils/timeline';

const RANGES = [7, 30, 90];
const FILTERS = [
  { key: 'all', label: 'Everyone', icon: 'people' },
  { key: 'attention', label: 'Needs attention', icon: 'alert-circle' },
  { key: 'blocked', label: 'Stuck', icon: 'hand-left' },
  { key: 'overdue', label: 'Overdue', icon: 'time' },
];

/** Higher = look at this person first. */
export function attentionScore(stats) {
  return stats.health.red * 3 + stats.blocked * 2 + stats.overdue * 2 + stats.health.orange;
}

/** Green / orange / red bar showing how their open work is doing. */
export function HealthBar({ health, height = 8 }) {
  const { theme } = useTheme();
  const colors = useColors();
  const total = health.green + health.orange + health.red;
  if (!total) return <View style={{ height, borderRadius: height / 2, backgroundColor: colors.gray[200] }} />;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.gray[200], flexDirection: 'row', overflow: 'hidden' }}>
      {['green', 'orange', 'red'].map((level) => (health[level] ? (
        <View key={level} style={{ flex: health[level], backgroundColor: healthColor(level, theme) }} />
      ) : null))}
    </View>
  );
}

export default function TeamMonitorScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (range = days) => {
    try {
      const res = await api.get('/monitor/overview', { params: { days: range }, __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the team');
    }
  }, [days]);

  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  const people = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.people
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (p.display_title || '').toLowerCase().includes(q))
      .filter((p) => filter === 'all'
        || (filter === 'attention' && attentionScore(p.stats) > 0)
        || (filter === 'blocked' && p.stats.blocked > 0)
        || (filter === 'overdue' && p.stats.overdue > 0))
      .sort((a, b) => attentionScore(b.stats) - attentionScore(a.stats) || a.name.localeCompare(b.name));
  }, [data, query, filter]);

  const team = data?.team;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Team monitor" style={styles.title} />
        <Text style={styles.subtitle}>To-dos, time taken and blockers of the people below you</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(days); setRefreshing(false); }} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.ranges}>
          {RANGES.map((r) => (
            <Chip key={r} label={`Last ${r} days`} active={days === r} onPress={() => { setDays(r); load(r); }} />
          ))}
        </View>

        {!data && !error && <SkeletonList count={5} type="notification" />}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}

        {team && (
          <View style={styles.teamCard}>
            <View style={styles.teamTop}>
              <Stat label="Open" value={team.open} />
              <Stat label="Overdue" value={team.overdue} level={team.overdue ? 'red' : null} />
              <Stat label="Stuck" value={team.blocked} level={team.blocked ? 'orange' : null} />
              <Stat label="Done" value={team.completed} level={team.completed ? 'green' : null} />
            </View>
            <HealthBar health={team.health} height={10} />
            <View style={styles.legend}>
              {['green', 'orange', 'red'].map((l) => (
                <HealthPill key={l} level={l} label={`${team.health[l]} ${l === 'green' ? 'on track' : l === 'orange' ? 'watch' : 'late'}`} compact />
              ))}
            </View>
            <View style={styles.avgRow}>
              <Avg label="On time" value={team.on_time_rate === null ? '–' : `${team.on_time_rate}%`} level={team.on_time_rate === null ? null : team.on_time_rate >= 80 ? 'green' : team.on_time_rate >= 50 ? 'orange' : 'red'} />
            </View>
          </View>
        )}

        {data && (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={colors.gray[400]} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search people"
                placeholderTextColor={colors.gray[400]}
                style={styles.searchInput}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {FILTERS.map((f) => (
                <Chip key={f.key} icon={f.icon} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </ScrollView>

            {people.map((p) => (
              <PersonRow key={p.id} person={p} onPress={() => navigation.navigate('PersonMonitor', { personId: p.id, name: p.name, days })} />
            ))}
            {!people.length && <EmptyHero icon="people" title="Nobody here" message={data.people.length ? 'No one matches this search or filter.' : 'There is nobody below you in the hierarchy yet.'} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PersonRow({ person, onPress }) {
  const colors = useColors();
  const { theme } = useTheme();
  const s = person.stats;
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{
      marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.sm,
    }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={person.name} uri={person.profile_picture} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] }} numberOfLines={1}>{person.name}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }} numberOfLines={1}>
            {[person.display_title, person.businesses?.[0]].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
      </View>
      <HealthBar health={s.health} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Mini label="open" value={s.open} />
        {s.overdue > 0 && <Mini label="overdue" value={s.overdue} color={healthColor('red', theme)} />}
        {s.blocked > 0 && <Mini label="blocked" value={s.blocked} color={healthColor('orange', theme)} />}
        <Mini label="done" value={s.completed} color={s.completed ? healthColor('green', theme) : undefined} />
        {s.on_time_rate !== null && <Mini label="on time" value={`${s.on_time_rate}%`} />}
      </View>
    </AnimatedPressable>
  );
}

function Mini({ label, value, color }) {
  const colors = useColors();
  return (
    <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>
      <Text style={{ fontWeight: '800', color: color || colors.gray[900] }}>{value}</Text> {label}
    </Text>
  );
}

export function Stat({ label, value, level }) {
  const colors = useColors();
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: '800', color: level ? healthColor(level, theme) : colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.gray[500], fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Avg({ label, value, level }) {
  const colors = useColors();
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: level ? healthColor(level, theme) : colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.gray[500] }}>{label}</Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  ranges: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  teamCard: {
    marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  teamTop: { flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  avgRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg, paddingHorizontal: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
