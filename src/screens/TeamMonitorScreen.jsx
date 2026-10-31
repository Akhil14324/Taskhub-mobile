import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, useWindowDimensions } from 'react-native';
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
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import ProgressDot from '../components/ProgressDot';
import AskWhy from '../components/todos/AskWhy';

const RANGES = [7, 30, 90];
/** First name, unless that is just an initial ("V Akhil"). */
const shortName = (name) => { const parts = String(name || '').split(' ').filter(Boolean); return parts.find((w) => w.length > 1) || parts[0] || ''; };
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
  const { theme } = useTheme();
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
  const desktop = useIsDesktop();
  const win = useWindowDimensions();
  // People as cards in a grid on a wide screen; the right rail holds what needs attention and the workload.
  const cols = desktop ? (win.width > 1750 ? 3 : win.width > 1350 ? 2 : 1) : 1;
  const railed = desktop && win.width > 1250;
  const open = (p) => navigation.navigate('PersonMonitor', { personId: p.id, name: p.name, days });

  const kpis = team ? [
    ['Open tasks', team.open, 'blue', 'list-outline'],
    ['Overdue', team.overdue, team.overdue ? 'red' : 'grey', 'alert-circle-outline'],
    ['Stuck', team.blocked, team.blocked ? 'orange' : 'grey', 'hand-left-outline'],
    ['Tasks done', team.completed, team.completed ? 'green' : 'grey', 'checkmark-done-outline'],
    ['Steps done', team.steps?.finished || 0, team.steps?.finished ? 'green' : 'grey', 'footsteps-outline'],
    ['Stalled', team.steps?.stalled || 0, team.steps?.stalled ? 'red' : 'grey', 'hourglass-outline'],
  ] : [];

  const attention = (
    <Panel title="Needs attention" icon="alert-circle-outline" hint="Tasks made of steps where nothing has been finished for a few days and the date is close.">
      {(data?.stalled || []).map((p) => (
        <View key={p.id} style={{ paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 4 }}>
          <AnimatedPressable onPress={() => navigation.navigate('PersonMonitor', { personId: p.assignee_id, name: p.assignee_name, days })} style={{ gap: 2 }}>
            <Text numberOfLines={1} style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }}>{p.title}</Text>
            <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.gray[600] }}>
              {p.assignee_name} · {p.done} of {p.total} steps · nothing finished in {p.idle_days} days
              {p.days_to_due === null || p.days_to_due === undefined ? '' : p.days_to_due < 0 ? ` · ${-p.days_to_due}d late` : p.days_to_due === 0 ? ' · due today' : ` · due in ${p.days_to_due}d`}
            </Text>
          </AnimatedPressable>
          <AskWhy todoId={p.id} suggestion={`Nothing has been finished on "${p.title}" for ${p.idle_days} days. What is holding it up?`} />
        </View>
      ))}
      {data && people.filter((x) => x.stats.overdue || x.stats.blocked).slice(0, 5).map((x) => (
        <AnimatedPressable key={`p${x.id}`} onPress={() => open(x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
          <Avatar name={x.name} uri={x.profile_picture} size={26} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.gray[800] }}>{x.name}</Text>
          {x.stats.overdue > 0 && <Text style={{ fontSize: fontSize.xs, color: healthColor('red', theme), fontWeight: '700' }}>{x.stats.overdue} overdue</Text>}
          {x.stats.blocked > 0 && <Text style={{ fontSize: fontSize.xs, color: healthColor('orange', theme), fontWeight: '700' }}>{x.stats.blocked} stuck</Text>}
        </AnimatedPressable>
      ))}
      {data && !(data.stalled || []).length && !people.some((x) => x.stats.overdue || x.stats.blocked) && (
        <Text style={{ color: colors.gray[500], fontSize: fontSize.sm }}>Nothing needs attention. Everyone is moving.</Text>
      )}
    </Panel>
  );

  const workload = data ? (
    <Panel title="Workload" icon="people-outline" hint="Open tasks per person. The red part is overdue.">
      {(() => {
        const rows = [...data.people].filter((x) => x.stats.open).sort((a, b) => b.stats.open - a.stats.open).slice(0, 10);
        const max = Math.max(1, ...rows.map((x) => x.stats.open));
        if (!rows.length) return <Text style={{ color: colors.gray[500], fontSize: fontSize.sm }}>Nobody has open tasks.</Text>;
        return rows.map((x) => (
          <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Text numberOfLines={1} style={{ width: 96, fontSize: fontSize.sm, color: colors.gray[700] }}>{shortName(x.name)}</Text>
            <View style={{ flex: 1, height: 12, flexDirection: 'row', borderRadius: 3, overflow: 'hidden', backgroundColor: colors.gray[100] }}>
              <View style={{ width: `${((x.stats.open - x.stats.overdue) / max) * 100}%`, backgroundColor: colors.brand[500] }} />
              <View style={{ width: `${(x.stats.overdue / max) * 100}%`, backgroundColor: healthColor('red', theme) }} />
            </View>
            <Text style={{ width: 28, textAlign: 'right', fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }}>{x.stats.open}</Text>
          </View>
        ));
      })()}
    </Panel>
  ) : null;

  const steps = data && team?.steps?.total > 0 ? (
    <Panel title="Steps" icon="footsteps-outline" hint="How far the open tasks have got, counted from their steps and weighted by the time planned for each step.">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <ProgressDot pct={team.steps.pct ?? 0} size={46} stroke={6} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] }}>{team.steps.pct ?? 0}%</Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.gray[600] }}>{team.steps.done} of {team.steps.total} steps done in {team.steps.processes} open tasks</Text>
        </View>
      </View>
      {[...data.people].filter((x) => x.stats.steps?.total).sort((a, b) => (a.stats.steps.pct ?? 0) - (b.stats.steps.pct ?? 0)).slice(0, 8).map((x) => (
        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}>
          <Text numberOfLines={1} style={{ width: 96, fontSize: fontSize.sm, color: colors.gray[700] }}>{shortName(x.name)}</Text>
          <View style={{ flex: 1 }}><StepBar done={x.stats.steps.pct ?? 0} total={100} /></View>
          <Text style={{ width: 36, textAlign: 'right', fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }}>{x.stats.steps.pct ?? 0}%</Text>
        </View>
      ))}
    </Panel>
  ) : null;

  const list = data && (
    <>
      <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: spacing.sm, marginHorizontal: desktop ? 0 : 0 }}>
        <View {...glass('card')} style={[styles.searchBox, desktop && { flex: 1, marginHorizontal: 0, marginTop: 0 }]}>
          <Ionicons name="search" size={16} color={colors.gray[400]} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.gray[400]} style={styles.searchInput} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, desktop && { paddingHorizontal: 0, paddingVertical: 0 }]} style={{ flexGrow: 0 }}>
          {FILTERS.map((f) => <Chip key={f.key} icon={f.icon} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: desktop ? -6 : 0, marginTop: desktop ? spacing.md : 0 }}>
        {people.map((p) => (
          <View key={p.id} style={{ width: `${100 / cols}%` }}>
            <PersonRow person={p} grid={desktop} onPress={() => open(p)} />
          </View>
        ))}
      </View>
      {!people.length && <EmptyHero icon="people" title="Nobody here" message={data.people.length ? 'No one matches this search or filter.' : 'There is nobody below you in the hierarchy yet.'} />}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[{ paddingBottom: 60 + insets.bottom }, desktop && { paddingHorizontal: spacing.xl, maxWidth: 2200, width: '100%', alignSelf: 'center' }]}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(days); setRefreshing(false); }} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, desktop && { paddingHorizontal: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
          <View>
            <BackTitle title="Team monitor" style={styles.title} />
            <Text style={styles.subtitle}>To-dos, steps, time taken and blockers of the people below you</Text>
          </View>
          <View style={[styles.ranges, desktop && { paddingHorizontal: 0, paddingVertical: 0 }]}>
            {RANGES.map((r) => <Chip key={r} label={`Last ${r} days`} active={days === r} onPress={() => { setDays(r); load(r); }} />)}
          </View>
        </View>

        {!data && !error && <SkeletonList count={5} type="notification" />}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}

        {team && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: desktop ? 0 : spacing.lg, marginTop: desktop ? spacing.md : 0 }}>
            {kpis.map(([label, value, tone, icon]) => <Kpi key={label} label={label} value={value} tone={tone} icon={icon} />)}
            <Kpi label="On time" value={team.on_time_rate === null ? '–' : `${team.on_time_rate}%`} tone={team.on_time_rate === null ? 'grey' : team.on_time_rate >= 80 ? 'green' : team.on_time_rate >= 50 ? 'orange' : 'red'} icon="timer-outline" />
          </View>
        )}
        {team && (
          <View style={[desktop ? { marginTop: spacing.md } : { marginHorizontal: spacing.lg, marginTop: spacing.md }, { gap: 6 }]}>
            <HealthBar health={team.health} height={10} />
            <View style={styles.legend}>
              {['green', 'orange', 'red'].map((l) => (
                <HealthPill key={l} level={l} label={`${team.health[l]} ${l === 'green' ? 'on track' : l === 'orange' ? 'watch' : 'late'}`} compact />
              ))}
            </View>
          </View>
        )}

        {data && (
          railed ? (
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start', marginTop: spacing.lg }}>
              <View style={{ flex: 1 }}>{list}</View>
              <View style={{ width: 420, gap: spacing.md }}>{attention}{steps}{workload}</View>
            </View>
          ) : (
            <View style={{ marginTop: spacing.md, paddingHorizontal: desktop ? 0 : 0 }}>
              <View style={{ gap: spacing.md, paddingHorizontal: desktop ? 0 : spacing.lg }}>{attention}{steps}</View>
              {list}
              <View style={{ marginTop: spacing.md, paddingHorizontal: desktop ? 0 : spacing.lg }}>{workload}</View>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

/** A number with a label and a coloured edge: the tiles along the top. */
function Kpi({ label, value, tone, icon }) {
  const colors = useColors();
  const edge = { blue: '#0073ea', green: '#00c875', red: '#e2445c', orange: '#fdab3d', grey: colors.gray[300] }[tone] || colors.gray[300];
  return (
    <View style={{ flexGrow: 1, flexBasis: 150, minWidth: 140, borderRadius: radius.lg, borderLeftWidth: 4, borderLeftColor: edge, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], padding: spacing.md, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={colors.gray[500]} />
        <Text numberOfLines={1} style={{ fontSize: fontSize.xs, color: colors.gray[600] }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.gray[900] }}>{value}</Text>
    </View>
  );
}

/** A titled card in the side rail (stacked above or below the list on a phone). */
function Panel({ title, icon, hint, children }) {
  const colors = useColors();
  return (
    <View style={{ borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], padding: spacing.md, gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
        <Ionicons name={icon} size={16} color={colors.gray[600]} />
        <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] }}>{title}</Text>
        {!!hint && <Ionicons name="help-circle-outline" size={15} color={colors.gray[400]} accessibilityLabel={hint} />}
      </View>
      {children}
    </View>
  );
}

function PersonRow({ person, onPress, grid }) {
  const colors = useColors();
  const { theme } = useTheme();
  const s = person.stats;
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{
      marginHorizontal: grid ? 6 : spacing.lg, marginTop: grid ? 0 : spacing.sm, marginBottom: grid ? 12 : 0, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white,
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
      {(s.open > 0 || s.completed > 0) && <HealthBar health={s.health} />}
      {s.steps?.total > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.gray[700] }}>
            <Text style={{ fontWeight: '800', color: colors.gray[900] }}>{s.steps.done} of {s.steps.total}</Text> steps done in {s.steps.processes} open task{s.steps.processes === 1 ? '' : 's'}
          </Text>
          <StepBar done={s.steps.done} total={s.steps.total} />
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Mini label="open" value={s.open} />
        {s.overdue > 0 && <Mini label="overdue" value={s.overdue} color={healthColor('red', theme)} />}
        {s.blocked > 0 && <Mini label="blocked" value={s.blocked} color={healthColor('orange', theme)} />}
        <Mini label="done" value={s.completed} color={s.completed ? healthColor('green', theme) : undefined} />
        {s.steps?.finished > 0 && <Mini label="steps done" value={s.steps.finished} color={healthColor('green', theme)} />}
        {s.on_time_rate !== null && <Mini label="on time" value={`${s.on_time_rate}%`} />}
      </View>
    </AnimatedPressable>
  );
}

/** How far the steps (sub-tasks) of the open tasks have got. */
function StepBar({ done, total }) {
  const colors = useColors();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View accessibilityLabel={`${pct} percent of steps done`} style={{ height: 8, borderRadius: 4, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 8, backgroundColor: pct >= 100 ? '#00c875' : colors.brand[500] }} />
    </View>
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
  container: { flex: 1, backgroundColor: colors.page },
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
