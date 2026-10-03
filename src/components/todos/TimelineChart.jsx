import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Avatar, Chip, PRIORITY } from '../kit';
import { STATUS, healthColor, healthTint, formatSeconds } from '../../utils/timeline';
import { formatDue, MONTHS_SHORT } from '../../utils/dates';

const DAY = 24 * 3600 * 1000;
const ROW = 48;
const GROUP_ROW = 32;
const HEAD_MONTH = 22;
const HEAD_DAY = 30;
const HEAD = HEAD_MONTH + HEAD_DAY;
const LABEL_W = 230;
const BAR_H = 22;
const BAR_TOP = 13;
const TAIL_PX = 190; // room after the last bar for its "finished in" label
const ZOOMS = [
  { key: 'fit', label: 'Fit', px: 0 },
  { key: 'day', label: 'Days', px: 48 },
  { key: 'week', label: 'Weeks', px: 20 },
  { key: 'month', label: 'Months', px: 8 },
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STATUS_KEYS = ['todo', 'in_progress', 'in_review', 'blocked', 'on_hold'];

const web = Platform.OS === 'web';
const setTitle = (text) => (el) => {
  if (el && typeof el.setAttribute === 'function') el.setAttribute('title', text);
};
const stripes = (color) => (web
  ? { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 6px, rgba(255,255,255,0.28) 6px 12px)` }
  : null);

const ms = (v) => new Date(v).getTime();
const secsBetween = (a, b) => Math.max(0, Math.round((b - a) / 1000));
const fmtStamp = (t) => {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
};
const firstName = (p) => (p?.name || '').split(' ')[0];

/**
 * Gantt-style timeline: one bar per to-do from the day it was created to the day it was finished
 * (or today, while it is still open). The bar is cut into stretches by status and by who held it, with
 * hand-offs, the deadline, lateness and time spent written on it, so "who had this, for how long, and
 * where did it stall" reads at a glance. Tapping a row opens its full breakdown under the chart.
 * `data` is the response of GET /api/todos/gantt.
 */
export default function TimelineChart({ data, onOpen, selectedId, grouped = true }) {
  const colors = useColors();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [zoom, setZoom] = useState('fit');
  const [focusId, setFocusId] = useState(selectedId || null);
  const [viewW, setViewW] = useState(0);
  const scrollRef = useRef(null);
  useEffect(() => { if (selectedId) setFocusId(selectedId); }, [selectedId]);

  const people = useMemo(() => new Map((data?.people || []).map((p) => [p.id, p])), [data]);
  const todayMs = data?.today ? new Date(`${data.today}T12:00:00`).getTime() : Date.now();
  const nowMs = Date.now();

  // Only the stretch of time the work actually covers (not the whole requested window), so bars are
  // wide enough to read. The requested window is the outer limit.
  const span = useMemo(() => {
    const limitFrom = new Date(`${data?.from || '1970-01-01'}T00:00:00`).getTime();
    const limitTo = new Date(`${data?.to || '1970-01-02'}T23:59:59`).getTime();
    const items = data?.items || [];
    let lo = todayMs;
    let hi = todayMs;
    items.forEach((i) => {
      lo = Math.min(lo, ms(i.start));
      hi = Math.max(hi, ms(i.end));
      if (i.due_at) { lo = Math.min(lo, ms(i.due_at)); hi = Math.max(hi, ms(i.due_at)); }
    });
    const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const from = Math.max(limitFrom, dayStart(lo) - DAY);
    const to = Math.min(limitTo, dayStart(hi) + 2 * DAY);
    const spanDays = Math.max(7, Math.ceil((to - from) / DAY));
    return { from, spanDays };
  }, [data, todayMs]);

  const avail = Math.max(320, viewW - LABEL_W);
  const fitPx = Math.max(14, Math.min(72, Math.floor((avail - TAIL_PX) / span.spanDays)));
  const px = zoom === 'fit' ? fitPx : ZOOMS.find((z) => z.key === zoom).px;
  const days = span.spanDays + Math.ceil(TAIL_PX / px);
  const fromMs = span.from;
  const toMs = fromMs + days * DAY;
  const width = days * px;
  const x = (t) => Math.max(0, Math.min(width, ((t - fromMs) / DAY) * px));

  const red = healthColor('red', theme);
  const amber = healthColor('orange', theme);
  const statusColor = (status) => {
    switch (status) {
      case 'in_progress': return colors.brand[600];
      case 'in_review': return colors.brand[300];
      case 'blocked': return amber;
      case 'on_hold': return colors.gray[500];
      default: return colors.gray[300];
    }
  };

  // Rows: people (or one flat group) → to-dos, each followed by its sub-tasks.
  const rows = useMemo(() => {
    const items = data?.items || [];
    const byId = new Map(items.map((i) => [i.id, i]));
    const kids = new Map();
    items.forEach((i) => {
      if (i.parent_id && byId.has(i.parent_id)) {
        if (!kids.has(i.parent_id)) kids.set(i.parent_id, []);
        kids.get(i.parent_id).push(i);
      }
    });
    const roots = items.filter((i) => !(i.parent_id && byId.has(i.parent_id)));
    const flatten = (item, depth, out) => {
      out.push({ type: 'item', item, depth });
      (kids.get(item.id) || []).sort((a, b) => new Date(a.start) - new Date(b.start)).forEach((c) => flatten(c, depth + 1, out));
    };
    const out = [];
    if (!grouped) {
      roots.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach((r) => flatten(r, 0, out));
      return out;
    }
    const groups = new Map();
    roots.forEach((r) => {
      const key = r.assignee_id || 0;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    [...groups.entries()]
      .sort(([a], [b]) => {
        if (!a) return 1;
        if (!b) return -1;
        return (people.get(a)?.name || '').localeCompare(people.get(b)?.name || '');
      })
      .forEach(([key, list]) => {
        out.push({ type: 'group', key, person: key ? people.get(key) : null, list });
        list.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach((r) => flatten(r, 0, out));
      });
    return out;
  }, [data, grouped, people]);

  // Axis: month bands on top, one cell per day below.
  const axis = useMemo(() => {
    const cells = [];
    const months = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(fromMs + i * DAY);
      cells.push({ i, day: d.getDate(), month: d.getMonth(), dow: d.getDay() });
      const last = months[months.length - 1];
      if (last && last.month === d.getMonth() && last.year === d.getFullYear()) last.days += 1;
      else months.push({ month: d.getMonth(), year: d.getFullYear(), start: i, days: 1 });
    }
    return { cells, months };
  }, [days, fromMs]);

  // Numbers across everything on the chart.
  const stats = useMemo(() => {
    const items = data?.items || [];
    const done = items.filter((i) => i.is_done);
    const open = items.filter((i) => !i.is_done);
    const overdue = open.filter((i) => i.due_at && ms(i.due_at) < nowMs);
    const stuck = open.filter((i) => i.status === 'blocked');
    const hold = open.filter((i) => i.status === 'on_hold');
    const avg = done.length ? done.reduce((n, i) => n + secsBetween(ms(i.start), ms(i.end)), 0) / done.length : 0;
    const handoffs = items.reduce((n, i) => n + (i.handoffs?.length || 0), 0);
    return { total: items.length, done: done.length, open: open.length, overdue: overdue.length, stuck: stuck.length, hold: hold.length, avg, handoffs };
  }, [data, nowMs]);

  const jumpToToday = () => {
    scrollRef.current?.scrollTo?.({ x: Math.max(0, x(todayMs) - 240), animated: true });
  };

  if (!data) return null;
  const empty = rows.length === 0;
  const todayX = x(todayMs);
  const showEveryDay = px >= 30;
  const focus = focusId ? (data.items || []).find((i) => i.id === focusId) : null;
  const open = (id) => { setFocusId(id); onOpen?.(id); };

  const tiles = [
    { icon: 'play-circle-outline', label: 'Open', value: stats.open },
    { icon: 'checkmark-circle-outline', label: 'Finished', value: stats.done },
    { icon: 'hand-left-outline', label: 'Stuck / on hold', value: stats.stuck + stats.hold, warn: stats.stuck > 0 },
    { icon: 'flame-outline', label: 'Past deadline', value: stats.overdue, bad: stats.overdue > 0 },
    { icon: 'timer-outline', label: 'Avg. to finish', value: stats.avg ? formatSeconds(stats.avg) : '-' },
  ];
  const usedStatuses = STATUS_KEYS.filter((s) => (data.items || []).some((i) => i.segments.some((g) => g.status === s)));
  const anyHandoff = stats.handoffs > 0;

  return (
    <View style={styles.wrap} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, t.bad && { borderColor: red }]}>
            <View style={[styles.tileIcon, t.bad && { backgroundColor: healthTint('red', theme, 0.16) }, t.warn && { backgroundColor: healthTint('orange', theme, 0.18) }]}>
              <Ionicons name={t.icon} size={15} color={t.bad ? red : t.warn ? amber : colors.brand[600]} />
            </View>
            <View>
              <Text style={[styles.tileValue, t.bad && { color: red }]}>{t.value}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.toolbar}>
        <Ionicons name="calendar-outline" size={14} color={colors.gray[500]} />
        <Text style={styles.range}>{formatDue(data.from)} to {formatDue(data.to)}</Text>
        <View style={{ flex: 1 }} />
        <Chip small icon="locate-outline" label="Today" onPress={jumpToToday} />
        {ZOOMS.map((z) => (
          <Chip key={z.key} small label={z.label} active={zoom === z.key} onPress={() => setZoom(z.key)} />
        ))}
      </View>

      <View style={styles.legend}>
        {usedStatuses.map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: statusColor(s) }]} />
            <Text style={styles.legendText}>{STATUS[s].label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <Ionicons name="flag" size={11} color={colors.gray[600]} />
          <Text style={styles.legendText}>Deadline</Text>
        </View>
        {anyHandoff && (
          <View style={styles.legendItem}>
            <Ionicons name="swap-horizontal" size={12} color={colors.gray[600]} />
            <Text style={styles.legendText}>Hand-over</Text>
          </View>
        )}
        <Text style={styles.legendHint}>Click a row for the full breakdown</Text>
      </View>

      {empty ? (
        <View style={styles.empty}>
          <Ionicons name="analytics-outline" size={34} color={colors.gray[300]} />
          <Text style={styles.emptyTitle}>Nothing in this period</Text>
          <Text style={styles.emptyText}>Work appears here from the day it is created until it is finished.</Text>
        </View>
      ) : (
        <View style={styles.chart}>
          {/* Names */}
          <View style={{ width: LABEL_W }}>
            <View style={[styles.cornerHead, { height: HEAD }]}>
              <Text style={styles.headText}>{grouped ? 'Person and task' : 'Task'}</Text>
            </View>
            {rows.map((r) => {
              if (r.type === 'group') {
                const openCount = r.list.filter((i) => !i.is_done).length;
                return (
                  <View key={`g${r.key}`} style={[styles.groupRow, { height: GROUP_ROW }]}>
                    {r.person
                      ? <Avatar name={r.person.name} uri={r.person.profile_picture} size={22} />
                      : <Ionicons name="people-outline" size={18} color={colors.gray[500]} />}
                    <Text style={styles.groupName} numberOfLines={1}>{r.person ? r.person.name : 'Open to the business'}</Text>
                    <Text style={styles.groupCount}>{openCount} open · {r.list.length - openCount} done</Text>
                  </View>
                );
              }
              const it = r.item;
              const pr = PRIORITY[it.priority];
              const lateRow = !it.is_done && it.due_at && ms(it.due_at) < nowMs;
              return (
                <AnimatedPressable
                  key={it.id}
                  onPress={() => open(it.id)}
                  style={[styles.nameRow, { height: ROW, paddingLeft: spacing.md + r.depth * 16 }, focusId === it.id && styles.rowSelected]}
                >
                  {r.depth > 0 && <View style={[styles.elbow, { left: spacing.md + (r.depth - 1) * 16 + 4 }]} />}
                  {pr && it.priority < 4 && <View style={[styles.prioBar, { backgroundColor: pr.color }]} />}
                  <View style={styles.nameTop}>
                    <Ionicons
                      name={it.is_done ? 'checkmark-circle' : (STATUS[it.status]?.icon || 'ellipse-outline')}
                      size={14}
                      color={it.is_done ? colors.brand[700] : statusColor(it.status)}
                    />
                    <Text style={[styles.itemTitle, it.is_done && styles.itemDone]} numberOfLines={1}>{it.title}</Text>
                  </View>
                  <Text style={[styles.itemMeta, lateRow && { color: red }]} numberOfLines={1}>
                    {it.is_done ? 'Done' : (STATUS[it.status]?.label || 'Open')}
                    {!grouped && it.assignee_id && people.get(it.assignee_id) ? ` · ${firstName(people.get(it.assignee_id))}` : ''}
                    {it.due_date ? ` · due ${formatDue(it.due_date)}` : ''}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          {/* Bars */}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator
            contentOffset={{ x: zoom === 'fit' ? 0 : Math.max(0, todayX - 240), y: 0 }}
            style={{ flex: 1 }}
          >
            <View style={{ width }}>
              <View style={{ height: HEAD, backgroundColor: colors.gray[50], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] }}>
                <View style={{ height: HEAD_MONTH }}>
                  {axis.months.map((m) => (
                    <View key={`${m.year}-${m.month}`} style={[styles.monthCell, { left: m.start * px, width: m.days * px }]}>
                      <Text style={styles.month} numberOfLines={1}>{MONTHS_SHORT[m.month]} {m.year}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ height: HEAD_DAY }}>
                  {axis.cells.map((a) => {
                    const isToday = a.i === Math.floor((todayMs - fromMs) / DAY);
                    return (
                      <View key={a.i} style={[styles.axisCell, { left: a.i * px, width: px }, (a.dow === 0 || a.dow === 6) && styles.weekend]}>
                        {(showEveryDay || a.dow === 1) && px >= 12 && (
                          <Text style={[styles.dayNum, isToday && styles.dayToday]}>{a.day}</Text>
                        )}
                        {showEveryDay && <Text style={styles.dow}>{WEEKDAYS[a.dow]}</Text>}
                      </View>
                    );
                  })}
                </View>
                <View pointerEvents="none" style={[styles.todayFlag, { left: Math.max(0, todayX - 22) }]}>
                  <Text style={styles.todayFlagText}>Today</Text>
                </View>
              </View>

              <View>
                {/* weekend shading, week grid lines, today */}
                {axis.cells.filter((a) => a.dow === 0 || a.dow === 6).map((a) => (
                  <View key={`w${a.i}`} pointerEvents="none" style={[styles.shade, { left: a.i * px, width: px }]} />
                ))}
                {axis.cells.filter((a) => (showEveryDay ? true : a.dow === 1)).map((a) => (
                  <View key={`l${a.i}`} pointerEvents="none" style={[styles.gridLine, { left: a.i * px }, a.dow === 1 && styles.gridWeek]} />
                ))}
                <View pointerEvents="none" style={[styles.todayLine, { left: todayX - 1 }]} />
                {rows.map((r) => {
                  if (r.type === 'group') return <View key={`g${r.key}`} style={[styles.groupBand, { height: GROUP_ROW }]} />;
                  const it = r.item;
                  const startMs = ms(it.start);
                  const endMs = ms(it.end);
                  const startX = x(startMs);
                  const endX = Math.max(startX + 6, x(endMs));
                  const barW = endX - startX;
                  const dueMs = it.due_at ? ms(it.due_at) : null;
                  const dueX = dueMs !== null ? x(dueMs) : null;
                  const late = !it.is_done && dueMs !== null && dueMs < nowMs;
                  const total = secsBetween(startMs, endMs);
                  const owner = people.get(it.assignee_id);
                  const lateBy = late ? secsBetween(dueMs, nowMs) : 0;
                  const afterDue = it.is_done && dueMs !== null && endMs > dueMs ? secsBetween(dueMs, endMs) : 0;
                  const summary = `${it.title}\n${it.is_done ? 'Finished' : 'Open'} · ${formatSeconds(total)}${owner ? `\nWith ${owner.name}` : ''}`
                    + `\nStarted ${fmtStamp(startMs)}${it.is_done ? `\nFinished ${fmtStamp(endMs)}` : ''}`
                    + `${it.due_date ? `\nDue ${formatDue(it.due_date)}` : ''}`
                    + `${late ? `\nLate by ${formatSeconds(lateBy)}` : ''}`;
                  const captionLeft = Math.max(endX, dueX !== null ? dueX : 0) + 16;
                  return (
                    <View key={it.id} style={[styles.barRow, { height: ROW }, focusId === it.id && styles.rowSelected]}>
                      <AnimatedPressable
                        onPress={() => open(it.id)}
                        style={[styles.bar, { left: startX, width: barW }, focusId === it.id && styles.barSelected]}
                      >
                        <View ref={web ? setTitle(summary) : undefined} style={styles.barTrack}>
                          {it.segments.map((s, i) => {
                            const a = x(ms(s.from));
                            const b = s.to ? x(ms(s.to)) : endX;
                            const w = Math.max(3, b - a);
                            const person = people.get(s.assignee_id);
                            const dur = secsBetween(ms(s.from), s.to ? ms(s.to) : endMs);
                            const base = statusColor(s.status);
                            const light = s.status === 'in_review' || s.status === 'todo';
                            const ink = light ? colors.gray[900] : '#fff';
                            const label = w > 120 && person ? `${firstName(person)} · ${formatSeconds(dur)}`
                              : w > 64 && person ? firstName(person)
                                : w > 50 ? formatSeconds(dur) : '';
                            const running = !it.is_done && !s.to && i === it.segments.length - 1;
                            return (
                              <View
                                key={i}
                                style={[
                                  {
                                    position: 'absolute', left: a - startX, width: w, top: 0, bottom: 0,
                                    backgroundColor: base,
                                    opacity: it.is_done ? 0.82 : 1,
                                    borderRightWidth: i < it.segments.length - 1 ? 1.5 : 0,
                                    borderRightColor: colors.white,
                                    justifyContent: 'center',
                                  },
                                  running && stripes(base),
                                ]}
                              >
                                {!!label && <Text style={[styles.segName, { color: ink }]} numberOfLines={1}>{label}</Text>}
                              </View>
                            );
                          })}
                          {late && <View style={styles.lateEdge} />}
                        </View>
                        {it.is_done && (
                          <View style={styles.doneDot}><Ionicons name="checkmark" size={11} color="#fff" /></View>
                        )}
                        {!it.is_done && (
                          <View style={[styles.runDot, { backgroundColor: late ? red : statusColor(it.status) }]} />
                        )}
                      </AnimatedPressable>

                      {it.handoffs.map((h, i) => {
                        const to = people.get(h.to);
                        const from = people.get(h.from);
                        return (
                          <View
                            key={i}
                            ref={web ? setTitle(`Handed over${from ? ` from ${from.name}` : ''}${to ? ` to ${to.name}` : ''}\n${fmtStamp(ms(h.at))}`) : undefined}
                            style={[styles.handoff, { left: x(ms(h.at)) - 10 }]}
                          >
                            {to
                              ? <Avatar name={to.name} uri={to.profile_picture} size={16} />
                              : <Ionicons name="swap-horizontal" size={11} color={colors.gray[700]} />}
                          </View>
                        );
                      })}

                      {dueX !== null && (
                        <View pointerEvents="none" style={[styles.due, { left: dueX - 6 }]}>
                          <View style={[styles.dueStem, { backgroundColor: late ? red : colors.gray[400] }]} />
                          <Ionicons name="flag" size={13} color={late ? red : colors.gray[600]} style={styles.dueFlag} />
                        </View>
                      )}

                      <View pointerEvents="none" style={[styles.caption, { left: captionLeft }]}>
                        <Text style={styles.captionText} numberOfLines={1}>
                          <Text style={styles.captionStrong}>{formatSeconds(total)}</Text>
                          {owner ? `  ${firstName(owner)}` : ''}
                          {late ? <Text style={{ color: red, fontWeight: '700' }}>{`  ${formatSeconds(lateBy)} late`}</Text> : null}
                          {afterDue ? <Text style={{ color: red, fontWeight: '700' }}>{`  ${formatSeconds(afterDue)} after deadline`}</Text> : null}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {focus && (
        <FocusCard
          it={focus}
          people={people}
          statusColor={statusColor}
          colors={colors}
          theme={theme}
          nowMs={nowMs}
          onClose={() => setFocusId(null)}
          onOpen={() => onOpen?.(focus.id)}
        />
      )}
    </View>
  );
}

/** Everything about one bar: totals, time per status, time per person, and each stretch in order. */
function FocusCard({ it, people, statusColor, colors, theme, nowMs, onClose, onOpen }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const red = healthColor('red', theme);
  const startMs = ms(it.start);
  const endMs = ms(it.end);
  const total = Math.max(1, secsBetween(startMs, endMs));
  const owner = people.get(it.assignee_id);
  const dueMs = it.due_at ? ms(it.due_at) : null;
  const late = !it.is_done && dueMs !== null && dueMs < nowMs;
  const pr = PRIORITY[it.priority];

  const stretches = it.segments.map((s) => {
    const from = ms(s.from);
    const to = s.to ? ms(s.to) : endMs;
    return { ...s, fromMs: from, toMs: to, secs: secsBetween(from, to), person: people.get(s.assignee_id) };
  });
  const byStatus = {};
  const byPerson = new Map();
  stretches.forEach((s) => {
    byStatus[s.status] = (byStatus[s.status] || 0) + s.secs;
    const k = s.assignee_id || 0;
    byPerson.set(k, (byPerson.get(k) || 0) + s.secs);
  });
  const personRows = [...byPerson.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.focus}>
      <View style={styles.focusHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.focusTitle} numberOfLines={2}>{it.title}</Text>
          <Text style={styles.focusSub}>
            {it.business_name ? `${it.business_name} · ` : ''}{it.is_done ? 'Finished' : STATUS[it.status]?.label || 'Open'}
            {pr ? ` · ${pr.label}` : ''}{owner ? ` · ${owner.name}` : ''}
          </Text>
        </View>
        <AnimatedPressable onPress={onOpen} style={styles.focusBtn}>
          <Text style={styles.focusBtnText}>Open</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.brand[700]} />
        </AnimatedPressable>
        <AnimatedPressable onPress={onClose} style={styles.focusClose} hitSlop={8}>
          <Ionicons name="close" size={16} color={colors.gray[500]} />
        </AnimatedPressable>
      </View>

      <View style={styles.facts}>
        <Fact label="Started" value={fmtStamp(startMs)} colors={colors} />
        <Fact label={it.is_done ? 'Finished' : 'Until now'} value={it.is_done ? fmtStamp(endMs) : 'still open'} colors={colors} />
        <Fact label={it.is_done ? 'Took' : 'Open for'} value={formatSeconds(total)} colors={colors} />
        <Fact
          label="Deadline"
          value={dueMs !== null ? `${fmtStamp(dueMs)}${late ? ` (${formatSeconds(secsBetween(dueMs, nowMs))} late)` : ''}` : 'none'}
          color={late ? red : undefined}
          colors={colors}
        />
        <Fact label="Hand-overs" value={String(it.handoffs.length)} colors={colors} />
      </View>

      <Text style={styles.focusHeading}>Time in each status</Text>
      <View style={styles.split}>
        {Object.keys(byStatus).map((k) => (
          <View key={k} style={{ flex: Math.max(byStatus[k], total * 0.02), backgroundColor: statusColor(k), height: 12 }} />
        ))}
      </View>
      <View style={styles.legendRow}>
        {Object.keys(byStatus).map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: statusColor(k) }]} />
            <Text style={styles.focusLegend}>
              {STATUS[k]?.label || k} {formatSeconds(byStatus[k])} ({Math.round((byStatus[k] / total) * 100)}%)
            </Text>
          </View>
        ))}
      </View>

      {personRows.length > 0 && (
        <>
          <Text style={styles.focusHeading}>Who held it</Text>
          {personRows.map(([id, secs]) => {
            const p = people.get(id);
            return (
              <View key={id} style={styles.personRow}>
                {p ? <Avatar name={p.name} uri={p.profile_picture} size={20} /> : <Ionicons name="people-outline" size={18} color={colors.gray[500]} />}
                <Text style={styles.personName} numberOfLines={1}>{p ? p.name : 'Nobody in particular'}</Text>
                <View style={styles.personTrack}>
                  <View style={[styles.personFill, { width: `${Math.max(3, (secs / total) * 100)}%` }]} />
                </View>
                <Text style={styles.personSecs}>{formatSeconds(secs)}</Text>
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.focusHeading}>Every stretch</Text>
      {stretches.map((s, i) => (
        <View key={i} style={styles.stretch}>
          <View style={[styles.stretchDot, { backgroundColor: statusColor(s.status) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stretchTitle}>
              {STATUS[s.status]?.label || s.status}{s.person ? ` with ${s.person.name}` : ''}
            </Text>
            <Text style={styles.stretchTime}>
              {fmtStamp(s.fromMs)} to {s.to ? fmtStamp(s.toMs) : (it.is_done ? fmtStamp(endMs) : 'now')}
            </Text>
          </View>
          <Text style={styles.stretchSecs}>{formatSeconds(s.secs)}</Text>
        </View>
      ))}

      {it.handoffs.length > 0 && (
        <>
          <Text style={styles.focusHeading}>Hand-overs</Text>
          {it.handoffs.map((h, i) => {
            const from = people.get(h.from);
            const to = people.get(h.to);
            return (
              <View key={i} style={styles.stretch}>
                <Ionicons name="swap-horizontal" size={16} color={colors.gray[600]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stretchTitle}>{from ? from.name : 'Nobody'} to {to ? to.name : 'nobody'}</Text>
                  <Text style={styles.stretchTime}>{fmtStamp(ms(h.at))}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function Fact({ label, value, color, colors }) {
  return (
    <View style={{ minWidth: 120, flexGrow: 1, flexBasis: 120, paddingVertical: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.gray[400] }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: color || colors.gray[900], marginTop: 1 }}>{value}</Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexGrow: 1, flexBasis: 100, paddingVertical: 8, paddingHorizontal: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200],
  },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[50] },
  tileValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], lineHeight: 22 },
  tileLabel: { fontSize: 10, fontWeight: '600', color: colors.gray[500], marginTop: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  range: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[600] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 6 },
  swatch: { width: 14, height: 8, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.gray[500] },
  chart: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.gray[200],
  },
  cornerHead: {
    justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200], backgroundColor: colors.gray[50],
  },
  headText: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6 },
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.gray[100],
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
  },
  groupBand: { backgroundColor: colors.gray[100], opacity: 0.7 },
  groupName: { flex: 1, fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  groupCount: { fontSize: 10, color: colors.gray[500], fontWeight: '600' },
  nameRow: {
    justifyContent: 'center', gap: 3, paddingRight: spacing.sm, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[100],
  },
  nameTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prioBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2 },
  elbow: { position: 'absolute', top: 0, height: '50%', width: 8, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.gray[300], borderBottomLeftRadius: 5 },
  rowSelected: { backgroundColor: colors.brand[50] },
  itemTitle: { flex: 1, fontSize: fontSize.sm, color: colors.gray[900], fontWeight: '600' },
  itemDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  itemMeta: { fontSize: 11, color: colors.gray[500], paddingLeft: 20 },
  monthCell: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', paddingLeft: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.gray[300] },
  month: { fontSize: 11, fontWeight: '800', color: colors.gray[700], letterSpacing: 0.3 },
  axisCell: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  weekend: { backgroundColor: colors.gray[100] },
  dayNum: { fontSize: 11, color: colors.gray[600], fontWeight: '600' },
  dayToday: { color: colors.brand[700], fontWeight: '800' },
  dow: { fontSize: 9, color: colors.gray[400], fontWeight: '700' },
  todayFlag: {
    position: 'absolute', top: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.brand[600], zIndex: 6,
  },
  todayFlagText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  shade: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.gray[50] },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.gray[100] },
  gridWeek: { backgroundColor: colors.gray[200] },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.brand[500], opacity: 0.75, zIndex: 3 },
  barRow: { justifyContent: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[100] },
  bar: { position: 'absolute', top: BAR_TOP, height: BAR_H, justifyContent: 'center', zIndex: 2 },
  barTrack: {
    height: BAR_H, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.gray[200],
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  barSelected: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  segName: { fontSize: 10, fontWeight: '700', paddingLeft: 7 },
  lateEdge: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.red[600] },
  doneDot: {
    position: 'absolute', right: -7, top: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand[700],
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white,
  },
  runDot: { position: 'absolute', right: -4, top: 8, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.white },
  handoff: {
    position: 'absolute', top: BAR_TOP - 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1.5, borderColor: colors.gray[400], zIndex: 5,
  },
  due: { position: 'absolute', top: BAR_TOP - 2, height: BAR_H + 4, zIndex: 4 },
  dueStem: { position: 'absolute', left: 6, top: 4, bottom: 0, width: 1.5, opacity: 0.8 },
  dueFlag: { position: 'absolute', left: 6, top: -3 },
  caption: { position: 'absolute', top: BAR_TOP + 4, zIndex: 1 },
  captionText: { fontSize: 11, color: colors.gray[500], width: TAIL_PX },
  legendHint: { fontSize: 11, color: colors.gray[400], marginLeft: 'auto' },
  captionStrong: { fontWeight: '800', color: colors.gray[800] },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: 6 },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gray[700] },
  emptyText: { fontSize: fontSize.sm, color: colors.gray[400] },

  focus: {
    marginTop: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.md,
  },
  focusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  focusTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  focusSub: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  focusBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.brand[50] },
  focusBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.brand[700] },
  focusClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.gray[100] },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  focusHeading: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.md, marginBottom: 6,
  },
  split: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.gray[100], gap: 1 },
  focusLegend: { fontSize: fontSize.xs, color: colors.gray[700], fontWeight: '600' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  personName: { width: 130, fontSize: fontSize.sm, color: colors.gray[800], fontWeight: '600' },
  personTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray[100], overflow: 'hidden' },
  personFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand[500] },
  personSecs: { width: 72, textAlign: 'right', fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[700] },
  stretch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100] },
  stretchDot: { width: 10, height: 10, borderRadius: 5 },
  stretchTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  stretchTime: { fontSize: 11, color: colors.gray[500], marginTop: 1 },
  stretchSecs: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[700] },
});
