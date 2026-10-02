import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Avatar, Chip } from '../kit';
import { STATUS, healthColor, formatSeconds } from '../../utils/timeline';
import { formatDue, MONTHS_SHORT } from '../../utils/dates';

const DAY = 24 * 3600 * 1000;
const ROW = 40;
const HEAD = 52;
const LABEL_W = 232;
const ZOOMS = [
  { key: 'day', label: 'Days', px: 44 },
  { key: 'week', label: 'Weeks', px: 18 },
  { key: 'month', label: 'Months', px: 7 },
];

const setTitle = (text) => (el) => {
  if (el && typeof el.setAttribute === 'function') el.setAttribute('title', text);
};

/**
 * Gantt-style timeline: one bar per to-do from the day it was created to the day it was finished
 * (or today, while it is still open). The bar is cut into stretches by status and by who held it, with
 * hand-offs marked, so "who had this, for how long, and where did it stall" reads at a glance.
 * `data` is the response of GET /api/todos/gantt.
 */
export default function TimelineChart({ data, onOpen, selectedId, grouped = true }) {
  const colors = useColors();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [zoom, setZoom] = useState('week');
  const px = ZOOMS.find((z) => z.key === zoom).px;

  const people = useMemo(() => new Map((data?.people || []).map((p) => [p.id, p])), [data]);
  const fromMs = useMemo(() => new Date(`${data?.from || '1970-01-01'}T00:00:00`).getTime(), [data]);
  const toMs = useMemo(() => new Date(`${data?.to || '1970-01-02'}T23:59:59`).getTime(), [data]);
  const days = Math.max(1, Math.ceil((toMs - fromMs) / DAY));
  const width = days * px;
  const todayMs = data?.today ? new Date(`${data.today}T12:00:00`).getTime() : Date.now();
  const x = (ms) => Math.max(0, Math.min(width, ((ms - fromMs) / DAY) * px));

  const statusColor = (status) => {
    switch (status) {
      case 'in_progress': return colors.brand[600];
      case 'in_review': return colors.brand[300];
      case 'blocked': return healthColor('orange', theme);
      case 'on_hold': return colors.gray[400];
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
        out.push({ type: 'group', key, person: key ? people.get(key) : null, count: list.length });
        list.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach((r) => flatten(r, 0, out));
      });
    return out;
  }, [data, grouped, people]);

  // Axis
  const axis = useMemo(() => {
    const out = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(fromMs + i * DAY);
      out.push({ i, day: d.getDate(), month: d.getMonth(), dow: d.getDay(), first: d.getDate() === 1 || i === 0 });
    }
    return out;
  }, [days, fromMs]);

  if (!data) return null;
  const empty = rows.length === 0;
  const todayX = x(todayMs);
  const showEveryDay = px >= 30;

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={styles.range}>
          {formatDue(data.from)} to {formatDue(data.to)}
        </Text>
        <View style={{ flex: 1 }} />
        {ZOOMS.map((z) => (
          <Chip key={z.key} small label={z.label} active={zoom === z.key} onPress={() => setZoom(z.key)} />
        ))}
      </View>

      <View style={styles.legend}>
        {['todo', 'in_progress', 'in_review', 'blocked', 'on_hold'].map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: statusColor(s) }]} />
            <Text style={styles.legendText}>{STATUS[s].label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <Ionicons name="diamond" size={9} color={colors.gray[600]} />
          <Text style={styles.legendText}>Due</Text>
        </View>
        <View style={styles.legendItem}>
          <Ionicons name="swap-horizontal" size={11} color={colors.gray[600]} />
          <Text style={styles.legendText}>Handed over</Text>
        </View>
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
            {rows.map((r) => (r.type === 'group' ? (
              <View key={`g${r.key}`} style={[styles.groupRow, { height: ROW - 6 }]}>
                {r.person
                  ? <Avatar name={r.person.name} uri={r.person.profile_picture} size={20} />
                  : <Ionicons name="people-outline" size={18} color={colors.gray[500]} />}
                <Text style={styles.groupName} numberOfLines={1}>{r.person ? r.person.name : 'Open to the business'}</Text>
                <Text style={styles.groupCount}>{r.count}</Text>
              </View>
            ) : (
              <AnimatedPressable
                key={r.item.id}
                onPress={() => onOpen?.(r.item.id)}
                style={[styles.nameRow, { height: ROW, paddingLeft: spacing.md + r.depth * 14 }, selectedId === r.item.id && styles.rowSelected]}
              >
                <Text style={[styles.itemTitle, r.item.is_done && styles.itemDone]} numberOfLines={1}>{r.item.title}</Text>
              </AnimatedPressable>
            )))}
          </View>

          {/* Bars */}
          <ScrollView horizontal showsHorizontalScrollIndicator contentOffset={{ x: Math.max(0, todayX - 220), y: 0 }} style={{ flex: 1 }}>
            <View style={{ width }}>
              <View style={[styles.axis, { height: HEAD }]}>
                {axis.map((a) => (
                  <View key={a.i} style={[styles.axisCell, { left: a.i * px, width: px }, (a.dow === 0 || a.dow === 6) && styles.weekend]}>
                    {a.first && px >= 7 && <Text style={styles.month}>{MONTHS_SHORT[a.month]}</Text>}
                    {(showEveryDay || a.dow === 1 || a.first) && px >= 12 && <Text style={styles.dayNum}>{a.day}</Text>}
                  </View>
                ))}
              </View>
              <View>
                {/* weekend shading + today */}
                {axis.filter((a) => a.dow === 0 || a.dow === 6).map((a) => (
                  <View key={`w${a.i}`} pointerEvents="none" style={[styles.shade, { left: a.i * px, width: px }]} />
                ))}
                <View pointerEvents="none" style={[styles.todayLine, { left: todayX }]} />
                {rows.map((r) => {
                  if (r.type === 'group') return <View key={`g${r.key}`} style={{ height: ROW - 6 }} />;
                  const it = r.item;
                  const startX = x(new Date(it.start).getTime());
                  const endX = Math.max(startX + 4, x(new Date(it.end).getTime()));
                  const dueX = it.due_at ? x(new Date(it.due_at).getTime()) : null;
                  const late = !it.is_done && it.due_at && new Date(it.due_at).getTime() < Date.now();
                  const total = Math.round((new Date(it.end).getTime() - new Date(it.start).getTime()) / 1000);
                  const summary = `${it.title}\n${it.is_done ? 'Finished' : 'Open'} · ${formatSeconds(total)} so far`
                    + `${it.due_date ? `\nDue ${formatDue(it.due_date)}` : ''}`;
                  return (
                    <View key={it.id} style={{ height: ROW, justifyContent: 'center' }}>
                      <AnimatedPressable
                        onPress={() => onOpen?.(it.id)}
                        style={[styles.bar, { left: startX, width: endX - startX }, selectedId === it.id && styles.barSelected]}
                      >
                        <View ref={Platform.OS === 'web' ? setTitle(summary) : undefined} style={styles.barTrack}>
                          {it.segments.map((s, i) => {
                            const a = x(new Date(s.from).getTime());
                            const b = s.to ? x(new Date(s.to).getTime()) : endX;
                            const w = Math.max(2, b - a);
                            return (
                              <View
                                key={i}
                                style={{
                                  position: 'absolute', left: a - startX, width: w, top: 0, bottom: 0,
                                  backgroundColor: statusColor(s.status),
                                  opacity: it.is_done ? 0.75 : 1,
                                  borderRightWidth: i < it.segments.length - 1 ? 1 : 0,
                                  borderRightColor: colors.white,
                                }}
                              >
                                {w > 54 && s.assignee_id && people.get(s.assignee_id) && (
                                  <Text style={styles.segName} numberOfLines={1}>{people.get(s.assignee_id).name.split(' ')[0]}</Text>
                                )}
                              </View>
                            );
                          })}
                          {late && <View style={[styles.lateEdge]} />}
                        </View>
                        {it.is_done && (
                          <View style={styles.doneDot}><Ionicons name="checkmark" size={10} color="#fff" /></View>
                        )}
                      </AnimatedPressable>
                      {it.handoffs.map((h, i) => (
                        <View key={i} pointerEvents="none" style={[styles.handoff, { left: x(new Date(h.at).getTime()) - 8 }]}>
                          <Ionicons name="swap-horizontal" size={11} color={colors.gray[700]} />
                        </View>
                      ))}
                      {dueX !== null && (
                        <View pointerEvents="none" style={[styles.due, { left: dueX - 5 }]}>
                          <Ionicons name="diamond" size={10} color={late ? healthColor('red', theme) : colors.gray[600]} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  range: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[600] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 14, height: 8, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.gray[500] },
  chart: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  cornerHead: {
    justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200], backgroundColor: colors.gray[50],
  },
  headText: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6 },
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.gray[50],
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
  },
  groupName: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[800] },
  groupCount: { fontSize: 11, color: colors.gray[400], fontWeight: '600' },
  nameRow: {
    justifyContent: 'center', paddingRight: spacing.sm, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.gray[200],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[100],
  },
  rowSelected: { backgroundColor: colors.brand[50] },
  itemTitle: { fontSize: fontSize.sm, color: colors.gray[900], fontWeight: '500' },
  itemDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  axis: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200], backgroundColor: colors.gray[50] },
  axisCell: { position: 'absolute', top: 0, bottom: 0, alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 6, paddingLeft: 3 },
  weekend: { backgroundColor: colors.gray[100] },
  month: { position: 'absolute', top: 6, left: 4, fontSize: 11, fontWeight: '700', color: colors.gray[600] },
  dayNum: { fontSize: 11, color: colors.gray[500] },
  shade: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.gray[50] },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.brand[500], opacity: 0.7, zIndex: 3 },
  bar: { position: 'absolute', height: 20, justifyContent: 'center', zIndex: 2 },
  barTrack: { height: 18, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.gray[200] },
  barSelected: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segName: { fontSize: 10, fontWeight: '600', color: '#fff', paddingLeft: 5, lineHeight: 18 },
  lateEdge: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.red[600] },
  doneDot: {
    position: 'absolute', right: -6, top: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brand[700],
    alignItems: 'center', justifyContent: 'center',
  },
  handoff: {
    position: 'absolute', top: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center',
    justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[300], zIndex: 4,
  },
  due: { position: 'absolute', bottom: 2, zIndex: 4 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: 6 },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gray[700] },
  emptyText: { fontSize: fontSize.sm, color: colors.gray[400] },
});
