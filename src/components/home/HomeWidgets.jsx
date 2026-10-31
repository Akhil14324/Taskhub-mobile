import { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { ProgressRing, TodoCheckbox, DueChip } from '../kit';
import { paletteHex, paletteInk } from '../board/model';
import DailyReportCard from '../engage/DailyReportCard';
import TeamBoard from '../engage/TeamBoard';
import AtRiskCard from '../engage/AtRiskCard';
import { todayYmd, addDays, parseYmd, WEEKDAYS_SHORT, MONTHS_SHORT } from '../../utils/dates';

// The stage colours match the board's status labels, so a status looks the same on Home and on a board.
const STAGES = [
  ['todo', 'Not started', 'grey'], ['in_progress', 'Working on it', 'orange'], ['blocked', 'Stuck', 'red'],
  ['in_review', 'In review', 'blue'], ['on_hold', 'On hold', 'purple'], ['done', 'Done', 'green'],
];

/** Everything Home counts, worked out once from the to-dos the person can see. */
export function useHomeStats(todos, meId) {
  return useMemo(() => {
    const today = todayYmd();
    const open = todos.filter((t) => !t.is_done && !t.parent_id);
    const overdue = open.filter((t) => t.due_date && t.due_date < today);
    const dueToday = open.filter((t) => t.due_date === today);
    const weekEnd = addDays(today, 6);
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i);
      return { day, count: open.filter((t) => t.due_date === day).length };
    });
    const weekAgo = addDays(today, -6);
    const doneWeek = todos.filter((t) => t.is_done && !t.parent_id && t.done_at && t.done_at.slice(0, 10) >= weekAgo).length;
    const stages = STAGES.map(([key, label, color]) => ({
      key, label, color,
      count: todos.filter((t) => !t.parent_id && (key === 'done' ? t.is_done : !t.is_done && (t.status || 'todo') === key)).length,
    }));
    const byPerson = new Map();
    for (const t of open) {
      const id = t.assignee_id || meId;
      const name = t.assignee_name || 'Me';
      const cur = byPerson.get(id) || { id, name, open: 0, late: 0 };
      cur.open += 1;
      if (t.due_date && t.due_date < today) cur.late += 1;
      byPerson.set(id, cur);
    }
    const byBusiness = new Map();
    for (const t of todos.filter((x) => x.business_id && !x.parent_id)) {
      const cur = byBusiness.get(t.business_id) || { id: t.business_id, name: t.business_name, total: 0, done: 0 };
      cur.total += 1;
      if (t.is_done) cur.done += 1;
      byBusiness.set(t.business_id, cur);
    }
    return {
      today, open, overdue, dueToday, week, weekEnd, doneWeek, stages,
      stuck: open.filter((t) => t.status === 'blocked').length,
      people: [...byPerson.values()].sort((a, b) => b.open - a.open).slice(0, 10),
      businesses: [...byBusiness.values()].sort((a, b) => b.total - a.total),
      overdueList: [...overdue].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 12),
    };
  }, [todos, meId]);
}

function Empty({ text }) {
  const colors = useColors();
  return <Text style={{ color: colors.gray[500], fontSize: 13 }}>{text}</Text>;
}

function Kpi({ label, value, color, icon, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} style={{ flex: 1, minWidth: 120, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: paletteHex(color), backgroundColor: colors.gray[50], padding: spacing.md, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={colors.gray[500]} />
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[600] }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 30, fontWeight: '700', color: colors.gray[900] }}>{value}</Text>
    </AnimatedPressable>
  );
}

function Bar({ label, value, max, parts, right }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={1} style={{ width: 110, fontSize: 13, color: colors.gray[700] }}>{label}</Text>
      <View style={{ flex: 1, height: 14, flexDirection: 'row', backgroundColor: colors.gray[100], borderRadius: 3, overflow: 'hidden' }}>
        {parts.map((p, i) => <View key={i} style={{ width: `${(p.value / Math.max(1, max)) * 100}%`, backgroundColor: paletteHex(p.color) }} />)}
      </View>
      <Text style={{ minWidth: 60, textAlign: 'right', fontSize: 12, color: colors.gray[700] }}>{right ?? value}</Text>
    </View>
  );
}

// ---- the widgets ---------------------------------------------------------------------------------------------
// Each takes `ctx` (built in HomeScreen) and fills the card it is placed in.

function Numbers({ ctx }) {
  const { stats, go } = ctx;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      <Kpi label="Open tasks" value={stats.open.length} color="blue" icon="list-outline" onPress={() => go('Todos')} />
      <Kpi label="Due today" value={stats.dueToday.length} color="orange" icon="today-outline" onPress={() => go('Todos')} />
      <Kpi label="Late" value={stats.overdue.length} color="red" icon="alert-circle-outline" onPress={() => go('Todos')} />
      <Kpi label="Stuck" value={stats.stuck} color="purple" icon="hand-left-outline" onPress={() => go('Todos')} />
      <Kpi label="Done this week" value={stats.doneWeek} color="green" icon="checkmark-done-outline" onPress={() => go('Wins')} />
    </View>
  );
}

function MyDay({ ctx }) {
  const colors = useColors();
  const { doneToday, totalToday, dueNow, overduePersonal, insights, go, openAdd, myDay } = ctx;
  const percent = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <ProgressRing percent={percent} size={72} stroke={7} color={BRAND}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>{doneToday}/{totalToday}</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>{doneToday} of {totalToday} done today</Text>
          <Text style={{ fontSize: 13, color: colors.gray[600] }}>
            {totalToday === 0 ? 'Nothing scheduled. Plan your day.' : dueNow.length === 0 ? 'Everything is done.' : `${dueNow.length} left${overduePersonal.length ? `, ${overduePersonal.length} late` : ''}`}
          </Text>
          {!!insights?.streak && <Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>{insights.streak}-day streak</Text>}
          {!!myDay?.waiting_on_you?.length && <Text style={{ fontSize: 13, color: colors.gray[600] }}>{myDay.waiting_on_you.length} waiting on you</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {[['Add a task', 'add-circle-outline', openAdd], ['Plan my day', 'sunny-outline', () => go('Progress', { tab: 'today' })], ['Open Inbox', 'file-tray-outline', () => go('Todos')]].map(([label, icon, fn]) => (
          <AnimatedPressable key={label} onPress={fn} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
            <Ionicons name={icon} size={16} color={BRAND} />
            <Text style={{ fontSize: 13, color: colors.gray[800] }}>{label}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}

function Stages({ ctx }) {
  const colors = useColors();
  const { stats } = ctx;
  const total = stats.stages.reduce((n, s) => n + s.count, 0);
  if (!total) return <Empty text="No tasks yet." />;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', height: 30, borderRadius: radius.sm, overflow: 'hidden' }}>
        {stats.stages.filter((s) => s.count).map((s) => (
          <View key={s.key} style={{ flex: s.count, backgroundColor: paletteHex(s.color), alignItems: 'center', justifyContent: 'center' }}>
            {s.count / total > 0.07 && <Text style={{ fontSize: 12, color: paletteInk(s.color) }}>{Math.round((s.count / total) * 100)}%</Text>}
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        {stats.stages.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: paletteHex(s.color) }} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.gray[800] }}>{s.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Workload({ ctx }) {
  const { stats } = ctx;
  const max = Math.max(1, ...stats.people.map((p) => p.open));
  if (!stats.people.length) return <Empty text="Nobody has open tasks." />;
  return (
    <View style={{ gap: 8 }}>
      {stats.people.map((p) => (
        <Bar key={p.id} label={p.name} max={max} parts={[{ value: p.open - p.late, color: 'blue' }, { value: p.late, color: 'red' }]} right={`${p.open}${p.late ? ` · ${p.late} late` : ''}`} />
      ))}
    </View>
  );
}

function WeekAhead({ ctx }) {
  const colors = useColors();
  const { stats } = ctx;
  const max = Math.max(1, stats.overdue.length, ...stats.week.map((w) => w.count));
  const col = (label, count, color, key, sub) => (
    <View key={key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 12, color: colors.gray[700], fontWeight: '600' }}>{count || ''}</Text>
      <View style={{ width: '70%', maxWidth: 40, height: 110, justifyContent: 'flex-end' }}>
        <View style={{ height: Math.max(count ? 6 : 2, (count / max) * 110), borderRadius: 3, backgroundColor: count ? paletteHex(color) : colors.gray[200] }} />
      </View>
      <Text style={{ fontSize: 12, color: colors.gray[700] }}>{label}</Text>
      {!!sub && <Text style={{ fontSize: 10, color: colors.gray[500] }}>{sub}</Text>}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end' }}>
      {col('Late', stats.overdue.length, 'red', 'late')}
      {stats.week.map((w) => col(w.day === stats.today ? 'Today' : WEEKDAYS_SHORT[parseYmd(w.day).getDay()], w.count, w.day === stats.today ? 'orange' : 'blue', w.day, `${parseYmd(w.day).getDate()} ${MONTHS_SHORT[parseYmd(w.day).getMonth()]}`))}
    </View>
  );
}

function LateList({ ctx }) {
  const colors = useColors();
  const { stats, openTodo } = ctx;
  if (!stats.overdueList.length) return <Empty text="Nothing is late." />;
  return (
    <View>
      {stats.overdueList.map((t) => (
        <AnimatedPressable key={t.id} onPress={() => openTodo(t.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.gray[100] }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{[t.assignee_name, t.business_name].filter(Boolean).join(' · ')}</Text>
          </View>
          <DueChip date={t.due_date} compact />
        </AnimatedPressable>
      ))}
    </View>
  );
}

function Businesses({ ctx }) {
  const { stats } = ctx;
  if (!stats.businesses.length) return <Empty text="No business tasks yet." />;
  const max = Math.max(1, ...stats.businesses.map((b) => b.total));
  return (
    <View style={{ gap: 8 }}>
      {stats.businesses.map((b) => (
        <Bar key={b.id} label={b.name} max={max} parts={[{ value: b.done, color: 'green' }, { value: b.total - b.done, color: 'blue' }]} right={`${b.done}/${b.total}`} />
      ))}
    </View>
  );
}

function ForYou({ ctx }) {
  const colors = useColors();
  const { assignedToMe, toggleTodo, openTodo } = ctx;
  if (!assignedToMe.length) return <Empty text="No business work is waiting on you." />;
  return (
    <View style={{ gap: 4 }}>
      {assignedToMe.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => toggleTodo(t)} size={20} />
          <AnimatedPressable style={{ flex: 1 }} onPress={() => openTodo(t.id)}>
            <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{t.business_name}</Text>
          </AnimatedPressable>
          {!!t.due_date && <DueChip date={t.due_date} compact />}
        </View>
      ))}
    </View>
  );
}

// id -> { title, icon, span (of 12 columns), h (px), render, scroll }
export const HOME_WIDGETS = {
  numbers: { title: 'At a glance', icon: 'speedometer-outline', span: 12, h: 150, Body: Numbers },
  myday: { title: 'My day', icon: 'sunny-outline', span: 4, h: 300, Body: MyDay },
  stages: { title: 'Tasks by stage', icon: 'stats-chart-outline', span: 4, h: 300, Body: Stages },
  workload: { title: 'Workload by person', icon: 'people-outline', span: 4, h: 300, Body: Workload },
  week: { title: 'Coming up this week', icon: 'calendar-outline', span: 6, h: 290, Body: WeekAhead },
  late: { title: 'Late tasks', icon: 'alert-circle-outline', span: 6, h: 290, Body: LateList },
  businesses: { title: 'Progress by business', icon: 'briefcase-outline', span: 6, h: 290, Body: Businesses },
  foryou: { title: 'Business work for you', icon: 'person-outline', span: 6, h: 290, Body: ForYou },
  team: { title: 'Team today', icon: 'people-circle-outline', span: 6, h: 380, Body: ({ ctx }) => <TeamBoard refreshKey={ctx.reportKey} /> },
  report: { title: 'Daily report', icon: 'document-text-outline', span: 6, h: 380, Body: ({ ctx }) => <DailyReportCard refreshKey={ctx.reportKey} /> },
  atrisk: { title: 'At risk', icon: 'warning-outline', span: 6, h: 290, Body: ({ ctx }) => <AtRiskCard onOpen={ctx.openTodo} /> },
};
export const DEFAULT_HOME = ['numbers', 'myday', 'stages', 'workload', 'week', 'late', 'businesses', 'foryou', 'team', 'report', 'atrisk'];

export { ScrollView };
