import { useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, DueChip } from '../kit';
import { paletteHex } from '../board/model';
import DailyReportCard from '../engage/DailyReportCard';
import TeamBoard from '../engage/TeamBoard';
import { addDays, parseYmd, WEEKDAYS_SHORT, formatTime } from '../../utils/dates';
import { workDays } from '../../utils/workDays';
import { NeedsAttention, ByBusiness, Workload, Recent } from './HomeWidgets';
import { Panel, OwnDashboard, myWorkOf } from './HomeDashboard';

// Home (2026-11-19, replaces the fixed tile-and-panel dashboard). One question per area: what is left today
// (the hero), what to do next (the agenda, with "Last worked N days ago" like the Gantt), how the week is loaded
// and where open work stands (the side column), then the team. Shared pieces live in HomeDashboard.jsx.

const GAP = 12;
const STAGES = [
  ['todo', 'Not started', 'grey'], ['in_progress', 'Working on it', 'orange'], ['in_review', 'In review', 'blue'],
  ['on_hold', 'On hold', 'purple'], ['blocked', 'Stuck', 'red'],
];
const STAGE_OF = Object.fromEntries(STAGES.map(([k, label, color]) => [k, { label, color }]));

function Card({ children, style }) {
  const colors = useColors();
  return (
    <View {...glass('card')} style={[{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.lg }, style]}>
      {children}
    </View>
  );
}

function CardHead({ icon, title, action, onAction }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Ionicons name={icon} size={16} color={colors.gray[500]} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
      {!!action && (
        <AnimatedPressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.brand[600] }}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.brand[600]} />
        </AnimatedPressable>
      )}
    </View>
  );
}

/** A small number with its label, inside the hero. */
function Stat({ label, value, color, icon, onPress }) {
  const colors = useColors();
  const hue = paletteHex(color);
  return (
    <AnimatedPressable onPress={onPress} {...glass('inset')} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.gray[50] }}>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${hue}22`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={hue} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.gray[900], fontVariant: ['tabular-nums'] }}>{value}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[600] }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

/** What is left today: one sentence, a bar split into done / still today / carried over, and four numbers. */
function Hero({ my, wide, go, openAdd }) {
  const colors = useColors();
  const left = my.dueToday.length + my.late.length;
  const total = left + my.doneToday;
  const part = (n) => (total ? `${(n / total) * 100}%` : '0%');
  const headline = total === 0 ? 'Nothing is planned for today' : left === 0 ? 'All done for today' : `${left} left for today`;
  const sub = [
    my.doneToday ? `${my.doneToday} done` : null,
    my.late.length ? `${my.late.length} carried over` : null,
    my.undated ? `${my.undated} without a date` : null,
  ].filter(Boolean).join(' · ') || 'Add a task or plan your day';
  return (
    <Card style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? spacing.xl : spacing.lg, padding: wide ? spacing.xl : spacing.lg }}>
      <View style={{ flex: wide ? 1.2 : undefined, minWidth: 0, justifyContent: 'center', gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.brand[600] }}>Today</Text>
        <Text style={{ fontSize: wide ? 28 : 24, lineHeight: wide ? 34 : 30, fontWeight: '700', letterSpacing: -0.5, color: colors.gray[900] }}>{headline}</Text>
        <Text style={{ fontSize: 13, color: colors.gray[600] }}>{sub}</Text>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.gray[100], marginTop: 8 }}>
          <View style={{ width: part(my.doneToday), backgroundColor: colors.green[500] }} />
          <View style={{ width: part(my.dueToday.length), backgroundColor: colors.brand[500] }} />
          <View style={{ width: part(my.late.length), backgroundColor: colors.red[500] }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
          {[[colors.green[500], 'Done', my.doneToday], [colors.brand[500], 'Due today', my.dueToday.length], [colors.red[500], 'Late', my.late.length]].map(([c, l, n]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
              <Text style={{ fontSize: 12, color: colors.gray[600] }}>{l} {n}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <AnimatedPressable onPress={openAdd} {...glass('accent')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.brand[600] }}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add task</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => go('Timebox')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
            <Ionicons name="time-outline" size={15} color={colors.gray[700]} />
            <Text style={{ color: colors.gray[800], fontWeight: '600', fontSize: 13 }}>Plan my day</Text>
          </AnimatedPressable>
        </View>
      </View>
      <View style={{ flex: wide ? 1 : undefined, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignContent: 'center' }}>
        <Stat label="Late" value={my.late.length} color="red" icon="alert-circle-outline" onPress={() => go('Todos')} />
        <Stat label="Working on" value={my.working} color="orange" icon="play-outline" onPress={() => go('Todos')} />
        <Stat label="Stuck" value={my.stuck} color="purple" icon="hand-left-outline" onPress={() => go('Todos')} />
        <Stat label="Done in 7 days" value={my.doneWeek} color="green" icon="checkmark-done-outline" onPress={() => go('Todos')} />
      </View>
    </Card>
  );
}

/** One to-do in the agenda: tick, title, where it lives, its time and stage, and when it was last worked on. */
function AgendaRow({ t, today, toggleTodo, openTodo }) {
  const colors = useColors();
  const wd = workDays(t);
  const stage = STAGE_OF[t.status];
  const showStage = stage && t.status !== 'todo';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderTopWidth: 1, borderColor: colors.gray[100] }}>
      <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => toggleTodo(t)} size={20} />
      <AnimatedPressable style={{ flex: 1, minWidth: 0, paddingVertical: 8, gap: 2 }} onPress={() => openTodo(t.id)}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 2 }}>
          {!!t.business_name && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{t.business_name}</Text>}
          {!!t.due_time && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{formatTime(t.due_time)}</Text>}
          {showStage && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: paletteHex(stage.color) }} />
              <Text style={{ fontSize: 12, color: colors.gray[600] }}>{stage.label}</Text>
            </View>
          )}
          {!!wd.text && <Text style={{ fontSize: 12, color: wd.stale ? colors.red[600] : colors.gray[500], fontWeight: wd.stale ? '600' : '400' }}>{wd.text}</Text>}
        </View>
      </AnimatedPressable>
      {t.due_date < today && <DueChip date={t.due_date} compact />}
    </View>
  );
}

/** What to do next, in the order it matters: late, today, tomorrow, the rest of the week. */
function Agenda({ my, cap, ctx }) {
  const colors = useColors();
  const { toggleTodo, openTodo, go } = ctx;
  const tomorrow = addDays(my.today, 1);
  const weekEnd = addDays(my.today, 6);
  const sections = [
    { key: 'late', title: 'Late', color: colors.red[600], list: my.late },
    { key: 'today', title: 'Today', color: colors.brand[600], list: my.dueToday },
    { key: 'tomorrow', title: 'Tomorrow', color: colors.gray[700], list: my.open.filter((t) => t.due_date === tomorrow) },
    { key: 'week', title: 'Later this week', color: colors.gray[700], list: my.open.filter((t) => t.due_date > tomorrow && t.due_date <= weekEnd).sort((a, b) => a.due_date.localeCompare(b.due_date)) },
  ].filter((s) => s.list.length);
  return (
    <Card style={{ flex: 1 }}>
      <CardHead icon="list-outline" title="Up next" action="All to-dos" onAction={() => go('Todos')} />
      {!sections.length && (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: 6 }}>
          <Ionicons name="sunny-outline" size={28} color={colors.gray[400]} />
          <Text style={{ fontSize: 14, color: colors.gray[600] }}>Nothing is due this week.</Text>
        </View>
      )}
      {sections.map((s) => (
        <View key={s.key} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: s.color }}>{s.title}</Text>
            <View style={{ minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 6, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gray[700] }}>{s.list.length}</Text>
            </View>
          </View>
          {s.list.slice(0, cap).map((t) => <AgendaRow key={t.id} t={t} today={my.today} toggleTodo={toggleTodo} openTodo={openTodo} />)}
          {s.list.length > cap && (
            <AnimatedPressable onPress={() => go('Todos')} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: colors.gray[100] }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.brand[600] }}>{s.list.length - cap} more</Text>
            </AnimatedPressable>
          )}
        </View>
      ))}
      {my.undated > 0 && (
        <AnimatedPressable onPress={() => go('Todos')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: colors.gray[100] }}>
          <Ionicons name="file-tray-outline" size={15} color={colors.gray[500]} />
          <Text style={{ fontSize: 13, color: colors.gray[600] }}>{my.undated} in your Inbox without a date</Text>
        </AnimatedPressable>
      )}
    </Card>
  );
}

/** Today and the next six days as columns: how full each day is. */
function WeekLoad({ my, go }) {
  const colors = useColors();
  const days = [{ day: my.today, list: my.dueToday }, ...my.week.slice(0, 6)];
  const max = Math.max(1, ...days.map((d) => d.list.length));
  return (
    <Card>
      <CardHead icon="calendar-outline" title="This week" action="Plan" onAction={() => go('Timebox')} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 }}>
        {days.map(({ day, list }, i) => {
          const d = parseYmd(day);
          const h = list.length ? Math.max(8, (list.length / max) * 80) : 4;
          return (
            <AnimatedPressable key={day} onPress={() => go('Todos')} accessibilityLabel={`${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}: ${list.length} due`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: list.length ? colors.gray[800] : colors.gray[400] }}>{list.length}</Text>
              <View style={{ width: '100%', maxWidth: 28, height: h, borderRadius: 6, backgroundColor: i === 0 ? colors.brand[500] : list.length ? colors.brand[200] : colors.gray[100] }} />
              <Text style={{ fontSize: 11, fontWeight: i === 0 ? '700' : '500', color: i === 0 ? colors.gray[900] : colors.gray[500] }}>{i === 0 ? 'Today' : WEEKDAYS_SHORT[d.getDay()].slice(0, 2)}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </Card>
  );
}

/** Where my open work stands: one bar split by stage, and the counts under it. */
function StageBar({ my }) {
  const colors = useColors();
  const counts = STAGES.map(([k, label, color]) => ({ k, label, color, n: my.open.filter((t) => (t.status || 'todo') === k).length })).filter((s) => s.n);
  const total = counts.reduce((a, s) => a + s.n, 0);
  return (
    <Card>
      <CardHead icon="stats-chart-outline" title="Where my work stands" />
      {!total ? <Text style={{ fontSize: 13, color: colors.gray[500] }}>Nothing open.</Text> : (
        <>
          <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {counts.map((s) => <View key={s.k} style={{ flexGrow: s.n, backgroundColor: paletteHex(s.color) }} />)}
          </View>
          <View style={{ marginTop: 10, gap: 6 }}>
            {counts.map((s) => (
              <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: paletteHex(s.color) }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.gray[700] }}>{s.label}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.gray[900], fontVariant: ['tabular-nums'] }}>{s.n}</Text>
                <Text style={{ width: 40, textAlign: 'right', fontSize: 12, color: colors.gray[500], fontVariant: ['tabular-nums'] }}>{Math.round((s.n / total) * 100)}%</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

export default function HomeFocus({ ctx, user }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const meId = user?.id;
  const { todos, stats, go, openAdd, openTodo, reportKey } = ctx;
  const my = useMemo(() => myWorkOf(todos, meId), [todos, meId]);
  const hasTeam = stats.businesses.length > 0;
  const leads = !!(user?.can_monitor || user?.is_leader);
  const limited = { ...ctx, limit: wide ? 8 : 5 };
  const row = { flexDirection: wide ? 'row' : 'column', gap: GAP };

  return (
    <View style={{ gap: GAP }}>
      <Hero my={my} wide={wide} go={go} openAdd={openAdd} />

      <View style={[row, { alignItems: wide ? 'flex-start' : 'stretch' }]}>
        <View style={{ flex: wide ? 1.7 : undefined, minWidth: 0 }}>
          <Agenda my={my} cap={wide ? 6 : 4} ctx={ctx} />
        </View>
        <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: GAP }}>
          <WeekLoad my={my} go={go} />
          <StageBar my={my} />
          <Card>
            <CardHead icon="alert-circle-outline" title="Needs attention" />
            <NeedsAttention ctx={limited} />
          </Card>
        </View>
      </View>

      {hasTeam && (
        <View style={row}>
          <Panel title="This week by business" icon="business-outline" fixed={wide}><ByBusiness ctx={limited} /></Panel>
          <Panel title="Open work by person" icon="people-outline" fixed={wide}><Workload ctx={limited} /></Panel>
          <Panel title="Finished recently" icon="checkmark-done-outline" fixed={wide}><Recent ctx={limited} /></Panel>
        </View>
      )}

      {leads && (
        <View style={row}>
          <Panel title="Team today" icon="people-circle-outline" action="Team monitor" onAction={() => go('TeamMonitor')} fixed={wide}><TeamBoard refreshKey={reportKey} /></Panel>
          <Panel title="Daily report" icon="document-text-outline" fixed={wide}><DailyReportCard refreshKey={reportKey} /></Panel>
        </View>
      )}

      <OwnDashboard todos={todos} userId={meId} desktop={wide} onOpenItem={openTodo} />
    </View>
  );
}
