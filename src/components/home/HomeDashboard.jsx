import { useMemo } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import { ProgressRing, TodoCheckbox, DueChip } from '../kit';
import { paletteHex } from '../board/model';
import DailyReportCard from '../engage/DailyReportCard';
import TeamBoard from '../engage/TeamBoard';
import { todayYmd, addDays, parseYmd, WEEKDAYS_SHORT, MONTHS_SHORT } from '../../utils/dates';
import { Stages, NeedsAttention, Processes, ByBusiness, Workload, Recent } from './HomeWidgets';

const GAP = 12;
const PANEL_H = 348;

/** One card of the dashboard: a title line, then its content. On a computer every card in a row is the same height. */
function Panel({ title, icon, action, onAction, grow = 1, fixed, children }) {
  const colors = useColors();
  return (
    <View {...glass('card')} style={{ flexGrow: grow, flexShrink: 1, flexBasis: fixed ? 0 : 'auto', minWidth: 0, height: fixed ? PANEL_H : undefined, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 10 }}>
        <Ionicons name={icon} size={16} color={colors.gray[500]} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
        {!!action && (
          <AnimatedPressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.brand[600] }}>{action}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.brand[600]} />
          </AnimatedPressable>
        )}
      </View>
      {fixed
        ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>{children}</ScrollView>
        : <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>{children}</View>}
    </View>
  );
}

function Tile({ label, value, note, color, icon, onPress, basis }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} {...glass('card')} style={{ flexGrow: 1, flexBasis: basis, minWidth: 0, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: `${paletteHex(color)}22`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={14} color={paletteHex(color)} />
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '500', color: colors.gray[600] }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, color: colors.gray[900], fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{note}</Text>
    </AnimatedPressable>
  );
}

/**
 * Home: the person's own work first (numbers, today's plan, the week ahead), then what needs attention and how
 * the work is moving, then the team for people who lead one. One fixed layout: nothing to arrange.
 */
export default function HomeDashboard({ ctx, user }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const cols = width >= 1500 ? 3 : width >= 1024 ? 2 : 1;
  const phone = cols === 1;
  const { todos, stats, toggleTodo, openTodo, openAdd, go, reportKey } = ctx;
  const meId = user?.id;

  // My work: my personal to-dos and the business work I am accountable for.
  const my = useMemo(() => {
    const today = todayYmd();
    const mine = todos.filter((t) => !t.parent_id && (!t.business_id || t.assignee_id === meId));
    const open = mine.filter((t) => !t.is_done);
    const late = open.filter((t) => t.due_date && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const dueToday = open.filter((t) => t.due_date === today).sort((a, b) => (a.priority || 9) - (b.priority || 9));
    const doneToday = mine.filter((t) => t.is_done && t.done_at && t.done_at.slice(0, 10) === today).length;
    const weekAgo = addDays(today, -6);
    return {
      today, open, late, dueToday, doneToday,
      working: open.filter((t) => t.status === 'in_progress').length,
      stuck: open.filter((t) => t.status === 'blocked').length,
      review: open.filter((t) => t.status === 'in_review').length,
      doneWeek: mine.filter((t) => t.is_done && t.done_at && t.done_at.slice(0, 10) >= weekAgo).length,
      undated: open.filter((t) => !t.due_date).length,
      week: Array.from({ length: 7 }, (_, i) => {
        const day = addDays(today, i + 1);
        return { day, list: open.filter((t) => t.due_date === day) };
      }),
    };
  }, [todos, meId]);

  const focus = [...my.late, ...my.dueToday];
  const shownFocus = focus.slice(0, phone ? 6 : 9);
  const total = focus.length + my.doneToday;
  const percent = total ? Math.round((my.doneToday / total) * 100) : 0;
  const hasTeam = stats.businesses.length > 0;
  const leads = !!(user?.can_monitor || user?.is_leader);
  const limited = { ...ctx, limit: phone ? 5 : 14 };

  const row = { flexDirection: phone ? 'column' : 'row', gap: GAP };
  const tileBasis = phone ? '46%' : 0;
  // On a wide screen three cards share a row; on a laptop the third takes a row of its own.
  const three = (a, b, c) => (cols === 3
    ? <View style={row}>{a}{b}{c}</View>
    : <><View style={row}>{a}{b}</View><View style={row}>{c}</View></>);

  return (
    <View style={{ gap: GAP }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <Tile basis={tileBasis} label="Due today" value={my.dueToday.length} note={my.doneToday ? `${my.doneToday} already done` : 'Planned for today'} color="dark_orange" icon="today-outline" onPress={() => go('Todos')} />
        <Tile basis={tileBasis} label="Late" value={my.late.length} note={my.late.length ? `Oldest from ${parseYmd(my.late[0].due_date).getDate()} ${MONTHS_SHORT[parseYmd(my.late[0].due_date).getMonth()]}` : 'Nothing is late'} color="red" icon="alert-circle-outline" onPress={() => go('Todos')} />
        <Tile basis={tileBasis} label="Working on" value={my.working} note={my.review ? `${my.review} waiting for review` : `${my.open.length} open in all`} color="orange" icon="play-outline" onPress={() => go('Todos')} />
        <Tile basis={tileBasis} label="Stuck" value={my.stuck} note={my.stuck ? 'Needs someone to unblock' : 'Nothing is stuck'} color="purple" icon="hand-left-outline" onPress={() => go('Todos')} />
        <Tile basis={phone ? '100%' : 0} label="Done in 7 days" value={my.doneWeek} note="Tasks you finished" color="green" icon="checkmark-done-outline" onPress={() => go('Todos')} />
      </View>

      <View style={row}>
        <Panel title="Today" icon="sunny-outline" action="Add task" onAction={openAdd} grow={2} fixed={!phone}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.md }}>
            <ProgressRing percent={percent} size={56} stroke={6} color={colors.brand[600]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.gray[900] }}>{percent}%</Text>
            </ProgressRing>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>
                {total === 0 ? 'Nothing is planned for today' : focus.length === 0 ? 'Everything for today is done' : `${focus.length} to do, ${my.doneToday} done`}
              </Text>
              <Text style={{ fontSize: 13, color: colors.gray[600] }}>
                {my.late.length ? `${my.late.length} carried over from earlier days. ` : ''}{my.undated ? `${my.undated} without a date in your Inbox.` : ''}
              </Text>
            </View>
          </View>
          {shownFocus.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderTopWidth: 1, borderColor: colors.gray[100] }}>
              <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => toggleTodo(t)} size={20} />
              <AnimatedPressable style={{ flex: 1, minWidth: 0, paddingVertical: 8 }} onPress={() => openTodo(t.id)}>
                <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
                {!!t.business_name && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{t.business_name}</Text>}
              </AnimatedPressable>
              {t.due_date < my.today && <DueChip date={t.due_date} compact />}
            </View>
          ))}
          {focus.length > shownFocus.length && (
            <AnimatedPressable onPress={() => go('Todos')} style={{ paddingTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.brand[600] }}>{focus.length - shownFocus.length} more in To-do</Text>
            </AnimatedPressable>
          )}
        </Panel>

        <Panel title="Next 7 days" icon="calendar-outline" action="Plan" onAction={() => go('Timebox')} grow={1} fixed={!phone}>
          {my.week.map(({ day, list }) => {
            const d = parseYmd(day);
            return (
              <View key={day} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.gray[100] }}>
                <View style={{ width: 44 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500] }}>{WEEKDAYS_SHORT[d.getDay()]}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>{d.getDate()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 }}>
                  {list.length === 0 && <Text style={{ fontSize: 13, color: colors.gray[400] }}>Free</Text>}
                  {list.slice(0, 2).map((t) => (
                    <AnimatedPressable key={t.id} onPress={() => openTodo(t.id)}>
                      <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800] }}>{t.title}</Text>
                    </AnimatedPressable>
                  ))}
                  {list.length > 2 && <Text style={{ fontSize: 12, color: colors.gray[500] }}>and {list.length - 2} more</Text>}
                </View>
                {list.length > 0 && (
                  <View style={{ alignSelf: 'center', minWidth: 24, height: 22, borderRadius: 11, paddingHorizontal: 7, backgroundColor: colors.brand[50], alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.brand[700] }}>{list.length}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </Panel>
      </View>

      {three(
        <Panel key="a" title="Needs attention" icon="alert-circle-outline" fixed={!phone}><NeedsAttention ctx={limited} /></Panel>,
        <Panel key="b" title="Tasks by stage" icon="stats-chart-outline" fixed={!phone}><Stages ctx={limited} /></Panel>,
        <Panel key="c" title="Tasks with steps" icon="git-branch-outline" fixed={!phone}><Processes ctx={limited} /></Panel>,
      )}

      {hasTeam && three(
        <Panel key="a" title="This week by business" icon="business-outline" fixed={!phone}><ByBusiness ctx={limited} /></Panel>,
        <Panel key="b" title="Open work by person" icon="people-outline" fixed={!phone}><Workload ctx={limited} /></Panel>,
        <Panel key="c" title="Finished recently" icon="checkmark-done-outline" fixed={!phone}><Recent ctx={limited} /></Panel>,
      )}

      {leads && (
        <View style={row}>
          <Panel title="Team today" icon="people-circle-outline" action="Team monitor" onAction={() => go('TeamMonitor')} fixed={!phone}><TeamBoard refreshKey={reportKey} /></Panel>
          <Panel title="Daily report" icon="document-text-outline" fixed={!phone}><DailyReportCard refreshKey={reportKey} /></Panel>
        </View>
      )}
    </View>
  );
}
