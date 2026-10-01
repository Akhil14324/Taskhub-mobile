import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useColors, useTheme } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, DueChip, EmptyHero, SectionHeader } from '../components/kit';
import { HealthPill, useNowTick } from '../components/todos/TimeHealth';
import MonitorTodoSheet from '../components/todos/MonitorTodoSheet';
import { HealthBar, Stat, Avg } from './TeamMonitorScreen';
import { WEEKDAYS_SHORT, parseYmd, addDays, formatDayHeader, toYmd, timeAgo } from '../utils/dates';
import { describeEntry, formatSeconds, formatRatio, healthColor, todoHealth, todoMetrics, formatSecondsShort, STATUS } from '../utils/timeline';

const RANGES = [7, 30, 90];
const VIEWS = [
  { key: 'open', label: 'Open' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

export default function PersonMonitorScreen() {
  const colors = useColors();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { personId, name } = route.params || {};
  const now = useNowTick(60000);
  const [days, setDays] = useState(route.params?.days || 30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('todos'); // todos | activity
  const [view, setView] = useState('open');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async (range = days) => {
    try {
      const res = await api.get(`/monitor/people/${personId}`, { params: { days: range }, __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this person');
    }
  }, [personId, days]);

  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  const person = data?.person;
  const stats = data?.stats;
  const today = data?.today;

  const todos = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = data.todos
      // sub-tasks are part of their parent; show them only when searching
      .filter((t) => !t.parent_id || q)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.labels || []).some((l) => l.includes(q.replace(/^\+/, ''))));
    const filtered = list.filter((t) => {
      if (view === 'all') return true;
      if (view === 'done') return t.is_done;
      if (t.is_done) return false;
      if (view === 'blocked') return t.status === 'blocked';
      if (view === 'overdue') return t.due_at && new Date(t.due_at).getTime() < now;
      return true;
    });
    // Worst first for open work, newest first for finished.
    const rank = { red: 0, orange: 1, green: 2, none: 3 };
    return filtered.sort((a, b) => {
      if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
      if (a.is_done) return new Date(b.done_at) - new Date(a.done_at);
      return rank[todoHealth(a, now).level] - rank[todoHealth(b, now).level];
    });
  }, [data, query, view, now]);

  const week = useMemo(() => {
    if (!data) return [];
    const byDay = new Map(data.week.map((w) => [w.day, w.count]));
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(data.today, i - 6);
      return { day, count: byDay.get(day) || 0 };
    });
  }, [data]);
  const weekMax = Math.max(1, ...week.map((w) => w.count));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title={person?.name || name || 'Person'} style={styles.title} />
        {!!person && (
          <View style={styles.personRow}>
            <Avatar name={person.name} uri={person.profile_picture} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.personTitle} numberOfLines={1}>{[person.display_title, person.businesses?.[0]].filter(Boolean).join(' · ') || `@${person.username}`}</Text>
              {!!person.last_seen && <Text style={styles.lastSeen}>Last seen {timeAgo(person.last_seen)}</Text>}
            </View>
          </View>
        )}
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

        {!data && !error && <SkeletonList count={4} type="notification" />}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}

        {stats && (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row' }}>
              <Stat label="Open" value={stats.open} />
              <Stat label="Overdue" value={stats.overdue} level={stats.overdue ? 'red' : null} />
              <Stat label="Blocked" value={stats.blocked} level={stats.blocked ? 'orange' : null} />
              <Stat label="Done" value={stats.completed} level={stats.completed ? 'green' : null} />
            </View>
            <HealthBar health={stats.health} height={10} />
            <View style={styles.avgRow}>
              <Avg label="Avg cycle" value={formatSeconds(stats.avg_cycle_s)} />
              <Avg label="Avg response" value={formatSeconds(stats.avg_response_s)} />
              <Avg label="Avg blocked" value={formatSeconds(stats.avg_blocked_s)} />
            </View>
            <View style={styles.avgRow}>
              <Avg label="On time" value={stats.on_time_rate === null ? '–' : `${stats.on_time_rate}%`} level={stats.on_time_rate === null ? null : stats.on_time_rate >= 80 ? 'green' : stats.on_time_rate >= 50 ? 'orange' : 'red'} />
              <Avg
                label="Estimate used"
                value={formatRatio(stats.estimate_ratio)}
                level={stats.estimate_ratio === null ? null : stats.estimate_ratio <= 1 ? 'green' : stats.estimate_ratio <= 1.5 ? 'orange' : 'red'}
              />
              <Avg label="Due dates moved" value={stats.reschedules} level={stats.reschedules >= 5 ? 'red' : stats.reschedules >= 2 ? 'orange' : null} />
            </View>
            <View style={styles.bars}>
              {week.map((w) => (
                <View key={w.day} style={styles.barCol}>
                  <Text style={styles.barCount}>{w.count || ''}</Text>
                  <View style={[styles.bar, { height: Math.max(4, Math.round((w.count / weekMax) * 44)), backgroundColor: w.day === today ? healthColor('green', theme) : colors.gray[300] }]} />
                  <Text style={styles.barLabel}>{WEEKDAYS_SHORT[parseYmd(w.day).getDay()][0]}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {data && (
          <>
            <View style={styles.tabs}>
              {[['todos', 'To-dos'], ['activity', 'Activity']].map(([key, label]) => (
                <AnimatedPressable key={key} onPress={() => setTab(key)} haptic="light" style={[styles.tab, tab === key && styles.tabActive]}>
                  <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
                </AnimatedPressable>
              ))}
            </View>

            {tab === 'todos' ? (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={colors.gray[400]} />
                  <TextInput value={query} onChangeText={setQuery} placeholder={`Search ${person?.name?.split(' ')[0] || 'their'} to-dos`} placeholderTextColor={colors.gray[400]} style={styles.searchInput} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                  {VIEWS.map((v) => <Chip key={v.key} label={v.label} active={view === v.key} onPress={() => setView(v.key)} />)}
                </ScrollView>
                {todos.map((t) => (
                  <TodoRow key={t.id} todo={t} personId={person?.id} now={now} onPress={() => setOpenId(t.id)} />
                ))}
                {!todos.length && <EmptyHero icon="checkmark-done" title="Nothing here" message="No to-dos match this view." />}
              </>
            ) : (
              <ActivityFeed items={data.activity} />
            )}
          </>
        )}
      </ScrollView>

      <MonitorTodoSheet todoId={openId} onClose={() => setOpenId(null)} />
    </View>
  );
}

function TodoRow({ todo, personId, now, onPress }) {
  const colors = useColors();
  const health = todoHealth(todo, now);
  const m = todoMetrics(todo, now);
  const mine = todo.assignee_id === personId;
  let pill = null;
  if (todo.is_done) {
    pill = health.level === 'none' ? null : { level: health.level, label: health.reasons[0] };
  } else if (todo.status === 'blocked') {
    pill = { level: health.level === 'red' ? 'red' : 'orange', label: `Blocked ${formatSecondsShort(m.status_s.blocked)}`, icon: 'hand-left' };
  } else if (health.level !== 'none') {
    pill = { level: health.level, label: health.reasons[0] || 'On track' };
  }
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{
      marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 6,
    }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Ionicons name={STATUS[todo.is_done ? 'done' : todo.status].icon} size={18} color={colors.gray[500]} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '600', color: todo.is_done ? colors.gray[400] : colors.gray[900], textDecorationLine: todo.is_done ? 'line-through' : 'none' }} numberOfLines={2}>{todo.title}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        {!!pill && <HealthPill level={pill.level} label={pill.label} icon={pill.icon} compact />}
        <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} compact />
        {!todo.is_done && <Text style={{ fontSize: 11, color: colors.gray[500] }}>{formatSecondsShort(m.cycle_s)} so far</Text>}
        {todo.is_done && <Text style={{ fontSize: 11, color: colors.gray[500] }}>took {formatSecondsShort(m.cycle_s)}</Text>}
        {!mine && !!todo.assignee_name && <Text style={{ fontSize: 11, color: colors.gray[500] }}>→ {todo.assignee_name.split(' ')[0]}</Text>}
        {mine && todo.members?.length > 1 && <Text style={{ fontSize: 11, color: colors.gray[500] }}>shared</Text>}
        {todo.comment_count > 0 && <Text style={{ fontSize: 11, color: colors.gray[500] }}>💬 {todo.comment_count}</Text>}
      </View>
    </AnimatedPressable>
  );
}

function ActivityFeed({ items }) {
  const colors = useColors();
  const groups = useMemo(() => {
    const out = [];
    items.forEach((e) => {
      const day = toYmd(new Date(e.created_at));
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    });
    return out;
  }, [items]);
  if (!items.length) return <EmptyHero icon="pulse" title="No activity yet" message="Everything they do on their to-dos shows up here." />;
  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      {groups.map((g) => (
        <View key={g.day}>
          <SectionHeader title={formatDayHeader(g.day)} count={g.items.length} />
          {g.items.map((e) => {
            const d = describeEntry(e, e.user_name || 'Someone');
            return (
              <View key={e.id} style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: 7 }}>
                <Ionicons name={d.icon} size={18} color={colors.gray[500]} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, color: colors.gray[900], fontWeight: '600' }}>{d.title}</Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }} numberOfLines={1}>{e.todo_title}{d.detail ? ` — ${d.detail}` : ''}</Text>
                  <Text style={{ fontSize: 11, color: colors.gray[400] }}>{timeAgo(e.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.4 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  personTitle: { fontSize: fontSize.sm, color: colors.gray[600], fontWeight: '600' },
  lastSeen: { fontSize: fontSize.xs, color: colors.gray[400] },
  ranges: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: {
    marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  avgRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 76, paddingTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  bar: { width: 16, borderRadius: 5 },
  barCount: { fontSize: 10, color: colors.gray[500], fontWeight: '700', minHeight: 12 },
  barLabel: { fontSize: 10, color: colors.gray[400] },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.gray[100], borderRadius: radius.lg, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md },
  tabActive: { backgroundColor: colors.white },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] },
  tabTextActive: { color: colors.gray[900] },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
