import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Avatar, EmptyHero } from '../components/kit';
import { healthColor } from '../utils/timeline';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import AskWhy from '../components/todos/AskWhy';
import PeriodChips, { periodParams } from '../components/todos/PeriodChips';
import Modal from '../components/Modal';
import MonitorFilter, { monitorModel, passesMonitor, activeCols } from '../components/monitor/MonitorFilter';
import MonitorTodoSheet from '../components/todos/MonitorTodoSheet';
import { todayYmd, addDays, toYmd, formatDue } from '../utils/dates';

const RANGES = [7, 30, 90];
/** First name, unless that is just an initial ("V Akhil"). */
const shortName = (name) => { const parts = String(name || '').split(' ').filter(Boolean); return parts.find((w) => w.length > 1) || parts[0] || ''; };
// One filter for the whole screen, the same Excel-style one a board has (Person, Business, Status, Due date, Entered
// date, Priority). "Needs attention" judges a person, not a task, so it sits beside it as a quick switch.
const QUICK = [['attention', 'Needs attention']];

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

/** First and last day (YYYY-MM-DD) of the chosen period. */
function rangeOf(value) {
  const today = todayYmd();
  return typeof value === 'string' ? { from: value, to: value } : { from: addDays(today, -value), to: today };
}
const dayOf = (iso) => (iso ? toYmd(new Date(iso)) : null);
const within = (iso, r) => { const d = dayOf(iso); return !!d && d >= r.from && d <= r.to; };

// What each tile counts. Every one of them opens the matching tasks.
const TILES = [
  { key: 'open', label: 'Open', test: (t) => !t.is_done },
  { key: 'overdue', label: 'Overdue', alert: true, test: (t, r, today) => !t.is_done && !!t.due_date && t.due_date < today },
  { key: 'stuck', label: 'Stuck', alert: true, test: (t) => !t.is_done && t.status === 'blocked' },
  { key: 'entered', label: 'Entered', test: (t, r) => within(t.created_at, r) },
  { key: 'done', label: 'Done', test: (t, r) => t.is_done && within(t.done_at, r) },
];

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
  const [filters, setFilters] = useState({ cols: {} });
  const [tasks, setTasks] = useState(null); // { personId: todos[] } for the current period
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tile, setTile] = useState(null); // the open tile key
  const [openId, setOpenId] = useState(null);
  const desktop = useIsDesktop();
  const win = useWindowDimensions();

  const load = useCallback(async (range = days) => {
    try {
      const res = await api.get('/monitor/overview', { params: periodParams(range), __skipOops: true });
      setData(res.data);
      setTasks(null);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the team');
    }
  }, [days]);
  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  // Task lists come from each person's page, fetched once per period and only when a tile or a business needs them.
  const ensureTasks = useCallback(async () => {
    if (!data || tasks || loadingTasks) return;
    setLoadingTasks(true);
    const out = {};
    const ids = data.people.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 6) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(ids.slice(i, i + 6).map(async (id) => {
        try { out[id] = (await api.get(`/monitor/people/${id}`, { params: periodParams(days), __skipOops: true })).data.todos || []; } catch { out[id] = []; }
      }));
    }
    setTasks(out);
    setLoadingTasks(false);
  }, [data, tasks, loadingTasks, days]);
  useEffect(() => { if (data) ensureTasks(); }, [data, ensureTasks]);

  const range = useMemo(() => rangeOf(days), [days]);
  const today = todayYmd();
  const colActive = activeCols(filters.cols) > 0;

  // Every task of every person, read through the shared filter model.
  const allRows = useMemo(() => {
    if (!tasks || !data) return null;
    return data.people.flatMap((p) => (tasks[p.id] || []).map((t) => ({ ...t, assignee_id: p.id, assignee_name: p.name, _person: p })));
  }, [tasks, data]);
  const model = useMemo(() => monitorModel(allRows, { withPerson: true }), [allRows]);
  const rows = useMemo(() => (allRows ? allRows.filter((t) => passesMonitor(t, model, filters.cols)) : null), [allRows, model, filters.cols]);
  const personIds = useMemo(() => new Set((rows || []).map((t) => t._person.id)), [rows]);

  const people = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.people
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (p.display_title || '').toLowerCase().includes(q))
      .filter((p) => !filters.attention || attentionScore(p.stats) > 0)
      .filter((p) => !colActive || !rows || personIds.has(p.id))
      .sort((a, b) => attentionScore(b.stats) - attentionScore(a.stats) || a.name.localeCompare(b.name));
  }, [data, query, filters.attention, colActive, rows, personIds]);

  // The tasks that pass the filter, of the people on screen.
  const scoped = useMemo(() => {
    if (!rows) return null;
    const ids = new Set(people.map((p) => p.id));
    return rows.filter((t) => ids.has(t._person.id));
  }, [rows, people]);

  const counts = useMemo(() => {
    if (!scoped) return null;
    const c = {};
    TILES.forEach((tl) => { c[tl.key] = scoped.filter((t) => tl.test(t, range, today)).length; });
    return c;
  }, [scoped, range, today]);

  // A person's numbers: the server's, or counted from the tasks that pass the filter once one is set.
  const statsOf = (p) => {
    if (!colActive || !scoped) return p.stats;
    const mine = scoped.filter((t) => t._person.id === p.id);
    const n = (key) => mine.filter((t) => TILES.find((x) => x.key === key).test(t, range, today)).length;
    return { ...p.stats, open: n('open'), overdue: n('overdue'), blocked: n('stuck'), completed: n('done'), on_time_rate: null };
  };

  const team = data?.team;
  // Server numbers while no column is filtered (they match the person cards); counted from the tasks for "Entered"
  // and whenever a filter is set.
  const value = (key) => {
    if (key === 'entered' || colActive) return counts ? counts[key] : null;
    if (!team) return '–';
    return { open: team.open, overdue: team.overdue, stuck: team.blocked, done: team.completed }[key];
  };
  const cols = desktop ? (win.width > 1750 ? 3 : win.width > 1350 ? 2 : 1) : 1;
  const railed = desktop && win.width > 1250;
  const openPerson = (p) => navigation.navigate('PersonBoard', { personId: p.id, name: p.name });
  const tileDef = TILES.find((x) => x.key === tile);
  const tileRows = tileDef && scoped ? scoped.filter((t) => tileDef.test(t, range, today)) : [];

  const attention = (
    <Panel title="Needs attention">
      {(data?.stalled || []).filter((p) => !colActive || (scoped && scoped.some((t) => t.id === p.id))).slice(0, 5).map((p) => (
        <View key={p.id} style={{ paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 4 }}>
          <AnimatedPressable onPress={() => setOpenId(p.id)} style={{ gap: 2 }}>
            <Text numberOfLines={1} style={{ fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] }}>{p.title}</Text>
            <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.gray[600] }}>
              {p.assignee_name} · {p.done} of {p.total} steps · idle {p.idle_days}d
              {p.days_to_due === null || p.days_to_due === undefined ? '' : p.days_to_due < 0 ? ` · ${-p.days_to_due}d late` : p.days_to_due === 0 ? ' · due today' : ` · due in ${p.days_to_due}d`}
            </Text>
          </AnimatedPressable>
          <AskWhy todoId={p.id} suggestion={`Nothing has been finished on "${p.title}" for ${p.idle_days} days. What is holding it up?`} />
        </View>
      ))}
      {data && people.filter((x) => statsOf(x).overdue || statsOf(x).blocked).slice(0, 6).map((x) => (
        <AnimatedPressable key={`p${x.id}`} onPress={() => openPerson(x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
          <Avatar name={x.name} uri={x.profile_picture} size={26} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.gray[800] }}>{x.name}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.gray[600] }}>{[statsOf(x).overdue ? `${statsOf(x).overdue} overdue` : null, statsOf(x).blocked ? `${statsOf(x).blocked} stuck` : null].filter(Boolean).join(' · ')}</Text>
        </AnimatedPressable>
      ))}
      {data && !people.some((x) => statsOf(x).overdue || statsOf(x).blocked) && <Text style={{ color: colors.gray[500], fontSize: fontSize.sm }}>Nothing needs attention.</Text>}
    </Panel>
  );

  const workload = data ? (
    <Panel title="Workload">
      {(() => {
        const ranked = [...people].filter((x) => statsOf(x).open).sort((a, b) => statsOf(b).open - statsOf(a).open).slice(0, 10);
        const max = Math.max(1, ...ranked.map((x) => statsOf(x).open));
        if (!ranked.length) return <Text style={{ color: colors.gray[500], fontSize: fontSize.sm }}>Nobody has open tasks.</Text>;
        return ranked.map((x) => (
          <AnimatedPressable key={x.id} onPress={() => openPerson(x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <Text numberOfLines={1} style={{ width: 96, fontSize: fontSize.sm, color: colors.gray[700] }}>{shortName(x.name)}</Text>
            <View style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.gray[100] }}>
              <View style={{ width: `${(statsOf(x).open / max) * 100}%`, height: 8, backgroundColor: colors.gray[700] }} />
            </View>
            <Text style={{ width: 28, textAlign: 'right', fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[900] }}>{statsOf(x).open}</Text>
          </AnimatedPressable>
        ));
      })()}
    </Panel>
  ) : null;

  const list = data && (
    <>
      <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: spacing.sm }}>
        <View {...glass('card')} style={[styles.searchBox, desktop && { flex: 1, marginHorizontal: 0, marginTop: 0 }]}>
          <Ionicons name="search" size={16} color={colors.gray[400]} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.gray[400]} style={styles.searchInput} />
        </View>
        <View style={[styles.filters, { flexDirection: 'row', alignItems: 'center' }, desktop && { paddingHorizontal: 0, paddingVertical: 0 }]}>
          <MonitorFilter rows={allRows} model={model} filters={filters} onChange={setFilters} quick={QUICK} shown={scoped ? scoped.length : undefined} total={allRows ? allRows.length : undefined} />
          {!!colActive && !allRows && <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>Loading tasks…</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: desktop ? -6 : 0, marginTop: desktop ? spacing.md : 0 }}>
        {people.map((p) => (
          <View key={p.id} style={{ width: `${100 / cols}%` }}>
            <PersonRow person={p} stats={statsOf(p)} grid={desktop} onPress={() => openPerson(p)} />
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
            <Text style={styles.subtitle}>The people below you: what is open, late, stuck, entered and done</Text>
          </View>
          {desktop ? (
            <View style={[styles.ranges, { paddingHorizontal: 0, paddingVertical: 0 }]}>
              <PeriodChips value={days} ranges={[7, 30, 90]} onChange={(v) => { setDays(v); load(v); }} />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ranges} style={{ flexGrow: 0 }}>
              <PeriodChips value={days} ranges={[7, 30, 90]} onChange={(v) => { setDays(v); load(v); }} />
            </ScrollView>
          )}
        </View>

        {!data && !error && <SkeletonList count={5} type="notification" />}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}

        {team && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: desktop ? 0 : spacing.lg, marginTop: desktop ? spacing.sm : 0 }}>
            {TILES.map((tl) => {
              const v = value(tl.key);
              return <Kpi key={tl.key} label={tl.label} value={v === null || v === undefined ? '…' : v} alert={tl.alert && v > 0} onPress={() => setTile(tl.key)} small={!desktop} />;
            })}
            <Kpi label="On time" value={team.on_time_rate === null ? '–' : `${team.on_time_rate}%`} small={!desktop} />
          </View>
        )}

        {data && (
          railed ? (
            <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start', marginTop: spacing.lg }}>
              <View style={{ flex: 1 }}>{list}</View>
              <View style={{ width: 380, gap: spacing.md }}>{attention}{workload}</View>
            </View>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <View style={{ gap: spacing.md, paddingHorizontal: desktop ? 0 : spacing.lg }}>{attention}</View>
              {list}
              <View style={{ marginTop: spacing.md, paddingHorizontal: desktop ? 0 : spacing.lg }}>{workload}</View>
            </View>
          )
        )}
      </ScrollView>

      <Modal open={!!tile} onClose={() => setTile(null)} title={`${tileDef?.label || ''}${scoped ? ` · ${tileRows.length}` : ''}${colActive ? ' · filtered' : ''}`} width={680}>
        {!scoped && <SkeletonList count={4} type="notification" />}
        {scoped && !tileRows.length && <Text style={{ color: colors.gray[500], paddingVertical: spacing.lg }}>Nothing here for this period.</Text>}
        {scoped && Object.values(tileRows.reduce((g, t) => { (g[t._person.id] = g[t._person.id] || { p: t._person, rows: [] }).rows.push(t); return g; }, {})).map(({ p, rows }) => (
          <View key={p.id} style={{ paddingVertical: spacing.sm, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
              <Avatar name={p.name} uri={p.profile_picture} size={22} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }}>{p.name}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>{rows.length}</Text>
            </View>
            {rows.map((t) => (
              <AnimatedPressable key={t.id} onPress={() => { setTile(null); setOpenId(t.id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 30 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.base, color: colors.gray[900] }}>{t.title}</Text>
                {!!t.business_name && <Text numberOfLines={1} style={{ fontSize: fontSize.xs, color: colors.gray[500], maxWidth: 120 }}>{t.business_name}</Text>}
                <Text style={{ fontSize: fontSize.xs, color: tileDef.key === 'overdue' ? colors.brand[700] : colors.gray[500] }}>
                  {tileDef.key === 'entered' ? `entered ${formatDue(dayOf(t.created_at))}` : tileDef.key === 'done' ? `done ${formatDue(dayOf(t.done_at))}` : t.due_date ? formatDue(t.due_date) : 'no date'}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        ))}
      </Modal>
      <MonitorTodoSheet todoId={openId} onClose={() => setOpenId(null)} />
    </View>
  );
}

/** One number with a label. It is a button when it opens something; the only colour is red for what is late or stuck. */
function Kpi({ label, value, alert, onPress, small }) {
  const colors = useColors();
  const Box = onPress ? AnimatedPressable : View;
  return (
    <Box onPress={onPress} accessibilityLabel={onPress ? `${label}: show the tasks` : undefined} style={{ flexGrow: 1, flexBasis: small ? '30%' : 140, minWidth: small ? 90 : 130, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], padding: small ? 10 : spacing.md, gap: 2 }}>
      <Text numberOfLines={1} style={{ fontSize: small ? 11 : fontSize.xs, color: colors.gray[600] }}>{label}</Text>
      <Text style={{ fontSize: small ? 22 : 28, fontWeight: '700', color: alert ? colors.brand[700] : colors.gray[900] }}>{value}</Text>
    </Box>
  );
}

/** A titled card in the side rail (stacked above or below the list on a phone). */
function Panel({ title, children }) {
  const colors = useColors();
  return (
    <View style={{ borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], padding: spacing.md, gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.gray[900], paddingBottom: 4 }}>{title}</Text>
      {children}
    </View>
  );
}

function PersonRow({ person, stats, onPress, grid }) {
  const colors = useColors();
  const s = stats || person.stats;
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{
      marginHorizontal: grid ? 6 : spacing.lg, marginTop: grid ? 0 : spacing.sm, marginBottom: grid ? 12 : 0, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.sm,
    }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={person.name} uri={person.profile_picture} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.gray[900] }} numberOfLines={1}>{person.name}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }} numberOfLines={1}>{[person.display_title, person.businesses?.[0]].filter(Boolean).join(' · ')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
        <Mini label="open" value={s.open} />
        {s.overdue > 0 && <Mini label="overdue" value={s.overdue} alert />}
        {s.blocked > 0 && <Mini label="stuck" value={s.blocked} alert />}
        <Mini label="done" value={s.completed} />
        {s.on_time_rate !== null && <Mini label="on time" value={`${s.on_time_rate}%`} />}
      </View>
    </AnimatedPressable>
  );
}

function Mini({ label, value, alert }) {
  const colors = useColors();
  return (
    <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>
      <Text style={{ fontWeight: '700', color: alert ? colors.brand[700] : colors.gray[900] }}>{value}</Text> {label}
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
