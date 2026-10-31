import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { Avatar } from '../kit';
import {
  todayYmd, addDays, parseYmd, toYmd, MONTHS_SHORT, WEEKDAYS_SHORT, timeAgo, formatDue,
} from '../../utils/dates';
import { progressMapOf } from '../../utils/progress';
import {
  statusLabelOf, paletteHex, paletteInk, cellValue, groupBlocks, numberSummary, formatNumber,
} from './model';

// Views of one board (MONDAY_FEATURE_SPEC.md F-VIW-03 .. F-VIW-13). They all draw the same filtered items the
// table does, so an edit anywhere shows everywhere. Tapping an item opens it.

const statusColumnOf = (board) => board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
const dueOf = (t) => t.due_date || t.deadline_date || null;

function Chip({ item, board, onOpenItem, compact }) {
  const colors = useColors();
  const col = statusColumnOf(board);
  const label = col ? statusLabelOf(item, col, board.values) : null;
  const color = label?.color || 'grey';
  return (
    <Pressable
      onPress={() => onOpenItem(item.id)}
      accessibilityLabel={item.title}
      style={({ hovered }) => ({
        backgroundColor: paletteHex(color), borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: compact ? 2 : 4,
        opacity: hovered ? 0.85 : 1, marginBottom: 2,
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: 12, color: paletteInk(color), textDecorationLine: item.is_done ? 'line-through' : 'none' }}>{item.title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------
// Calendar (F-VIW-06): a month of the items' dates.
// ---------------------------------------------------------------------------------------------------
export function BoardCalendar({ board, items, onOpenItem, onAddOnDay }) {
  const colors = useColors();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = todayYmd();
  const days = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start on Monday
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return toYmd(d); });
  }, [month]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const t of items) {
      if (t.parent_id) continue;
      const d = dueOf(t);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(t);
    }
    return m;
  }, [items]);
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const undated = items.filter((t) => !t.parent_id && !dueOf(t) && !t.is_done).length;
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => shift(-1)} accessibilityLabel="Previous month" hitSlop={8}><Ionicons name="chevron-back" size={20} color={colors.gray[700]} /></Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900], minWidth: 140, textAlign: 'center' }}>{MONTHS_SHORT[month.getMonth()]} {month.getFullYear()}</Text>
        <Pressable onPress={() => shift(1)} accessibilityLabel="Next month" hitSlop={8}><Ionicons name="chevron-forward" size={20} color={colors.gray[700]} /></Pressable>
        <Pressable onPress={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} style={{ marginLeft: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
          <Text style={{ fontSize: 13, color: colors.gray[700] }}>Today</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {!!undated && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{undated} without a date</Text>}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: colors.gray[500] }}>{WEEKDAYS_SHORT[d]}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderLeftWidth: 1, borderTopWidth: 1, borderColor: colors.gray[200] }}>
        {days.map((d) => {
          const inMonth = parseYmd(d).getMonth() === month.getMonth();
          const list = byDay.get(d) || [];
          return (
            <Pressable
              key={d}
              onPress={(e) => onAddOnDay && onAddOnDay(e, d)}
              style={({ hovered }) => ({
                width: `${100 / 7}%`, minHeight: 104, padding: 4, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.gray[200],
                backgroundColor: d === today ? colors.brand[50] : hovered ? colors.gray[50] : inMonth ? colors.white : colors.gray[100],
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: d === today ? '700' : '400', color: d === today ? BRAND : inMonth ? colors.gray[700] : colors.gray[400], marginBottom: 2 }}>{parseYmd(d).getDate()}</Text>
              {list.slice(0, 3).map((t) => <Chip key={t.id} item={t} board={board} onOpenItem={onOpenItem} compact />)}
              {list.length > 3 && <Text style={{ fontSize: 11, color: colors.gray[500] }}>+{list.length - 3} more</Text>}
            </Pressable>
          );
        })}
      </View>
      <StatusLegend board={board} items={items} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------
// Timeline and Gantt (F-VIW-03, F-VIW-05): bars from start to due, by group; Gantt adds dependency arrows.
// ---------------------------------------------------------------------------------------------------
const ZOOMS = [['days', 'Days', 64], ['weeks', 'Weeks', 22], ['months', 'Months', 7]];
const ROW_H = 38;
const LABEL_W = 300;
const HEAD_H = 56;
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / DAY_MS);
const shortDay = (d) => `${MONTHS_SHORT[parseYmd(d).getMonth()]} ${parseYmd(d).getDate()}`;
const rangeText = (a, b) => `${MONTHS_SHORT[parseYmd(a).getMonth()]} ${parseYmd(a).getDate()} - ${MONTHS_SHORT[parseYmd(b).getMonth()]} ${parseYmd(b).getDate()}`;

/** The status colours in use on a board, as a row of dots under a view (Gantt and Calendar). */
export function StatusLegend({ board, items }) {
  const colors = useColors();
  const col = statusColumnOf(board);
  const used = useMemo(() => {
    if (!col) return [];
    const seen = new Map();
    for (const t of items) {
      const l = statusLabelOf(t, col, board.values);
      if (l) seen.set(l.id || l.maps_to, l);
    }
    return [...seen.values()];
  }, [items, col, board.values]);
  if (!used.length) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, flexWrap: 'wrap' }}>
      {used.map((l) => (
        <View key={l.id || l.maps_to} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: paletteHex(l.color) }} />
          <Text style={{ fontSize: 13, color: colors.gray[800] }}>{l.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function BoardTimeline({ board, items, onOpenItem, gantt }) {
  const colors = useColors();
  const [zoomIdx, setZoomIdx] = useState(0);
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState(false);
  const [shut, setShut] = useState(() => new Set());
  const [links, setLinks] = useState([]);
  const scrollRef = useRef(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!gantt) return undefined;
    let live = true;
    api.get(`/boards/${board.board.id}/dependencies`, { __skipOops: true }).then((r) => live && setLinks(r.data.links || [])).catch(() => {});
    return () => { live = false; };
  }, [gantt, board.board.id, items.length, items.map((t) => `${t.due_date}${t.start_date}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayYmd();
  const progress = useMemo(() => progressMapOf(board.items), [board.items]);
  const statusCol = statusColumnOf(board);
  const blocks = useMemo(() => groupBlocks(board.groups, items).map((b) => ({ ...b, dated: b.top.filter((t) => t.start_date || dueOf(t)) })).filter((b) => b.dated.length), [board.groups, items]);
  const span = useMemo(() => {
    const dates = blocks.flatMap((b) => b.dated.flatMap((t) => [t.start_date, dueOf(t)])).filter(Boolean).sort();
    const first = dates[0] && dates[0] < today ? dates[0] : today;
    const last = dates[dates.length - 1] && dates[dates.length - 1] > today ? dates[dates.length - 1] : today;
    // Start on a Monday so the week headers line up.
    let start = addDays(first, -2);
    start = addDays(start, -((parseYmd(start).getDay() + 6) % 7));
    return { start, days: Math.max(21, daysBetween(start, addDays(last, 9))) };
  }, [blocks, today]);

  const px = fit && width > 0 ? Math.max(4, Math.min(96, Math.floor((width - LABEL_W - 24) / span.days))) : ZOOMS[zoomIdx][2];
  const x = (ymd) => daysBetween(span.start, ymd) * px;
  const gridW = span.days * px;

  // One row per group (its summary bar) and per task.
  const rows = useMemo(() => {
    const out = [];
    for (const b of blocks) {
      out.push({ group: b.group, dated: b.dated });
      if (!shut.has(b.group.id)) for (const t of b.dated) out.push({ item: t, group: b.group });
    }
    return out;
  }, [blocks, shut]);
  const rowIdx = new Map();
  rows.forEach((r, i) => { if (r.item) rowIdx.set(r.item.id, i); });

  // Open scrolled to the first task (or to today when the first task is already behind us).
  useEffect(() => {
    if (scrolled.current || !blocks.length) return;
    const firstOpen = blocks.flatMap((b) => b.dated).filter((t) => !t.is_done).map((t) => t.start_date || dueOf(t)).filter(Boolean).sort()[0];
    const target = firstOpen && firstOpen > today ? firstOpen : today;
    scrolled.current = true;
    setTimeout(() => scrollRef.current?.scrollTo({ x: Math.max(0, x(target) - 120), animated: false }), 60);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!blocks.length) {
    return <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>No task has a date yet. Give tasks a Due date or a Timeline and they show here.</Text>;
  }

  const barOf = (t) => {
    const end = dueOf(t) || t.start_date;
    const start = t.start_date && t.start_date <= end ? t.start_date : end;
    return { start, end, left: x(start), w: Math.max(px, (daysBetween(start, end) + 1) * px) };
  };
  const showDays = px >= 40;
  const weeks = Array.from({ length: Math.ceil(span.days / 7) }, (_, i) => addDays(span.start, i * 7));

  return (
    <View style={{ flex: 1, padding: spacing.md }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.gray[900], flex: 1 }}>{gantt ? 'Gantt' : 'Timeline'}</Text>
          <Pressable onPress={() => scrollRef.current?.scrollTo({ x: Math.max(0, x(today) - 160), animated: true })} accessibilityLabel="Scroll to today" style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
            <Text style={{ fontSize: 14, color: colors.gray[800] }}>Today</Text>
          </Pressable>
          <Pressable onPress={() => setFit((f) => !f)} accessibilityLabel="Fit everything on the screen" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: fit ? BRAND : colors.gray[300], backgroundColor: fit ? colors.brand[50] : 'transparent' }}>
            <Ionicons name="calendar-outline" size={16} color={fit ? BRAND : colors.gray[700]} />
            <Text style={{ fontSize: 14, color: fit ? BRAND : colors.gray[800] }}>Auto Fit</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, overflow: 'hidden' }}>
            {ZOOMS.map(([k, label], i) => (
              <Pressable key={k} onPress={() => { setFit(false); setZoomIdx(i); }} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: !fit && zoomIdx === i ? colors.brand[50] : 'transparent' }}>
                <Text style={{ fontSize: 14, color: !fit && zoomIdx === i ? BRAND : colors.gray[800] }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, overflow: 'hidden' }}>
            <Pressable onPress={() => { setFit(false); setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1)); }} accessibilityLabel="Zoom out" style={{ paddingHorizontal: 10, paddingVertical: 7 }}><Ionicons name="remove" size={16} color={colors.gray[700]} /></Pressable>
            <Pressable onPress={() => { setFit(false); setZoomIdx((i) => Math.max(0, i - 1)); }} accessibilityLabel="Zoom in" style={{ paddingHorizontal: 10, paddingVertical: 7, borderLeftWidth: 1, borderColor: colors.gray[300] }}><Ionicons name="add" size={16} color={colors.gray[700]} /></Pressable>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: LABEL_W, borderRightWidth: 1, borderColor: colors.gray[200] }}>
              <View style={{ height: HEAD_H, borderBottomWidth: 1, borderColor: colors.gray[200] }} />
              {rows.map((r, i) => (
                <View key={i} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: 8 }}>
                  {r.group && !r.item ? (
                    <Pressable onPress={() => setShut((cur) => { const n = new Set(cur); if (n.has(r.group.id)) n.delete(r.group.id); else n.add(r.group.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons name={shut.has(r.group.id) ? 'chevron-forward' : 'chevron-down'} size={14} color={colors.gray[500]} />
                      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: paletteHex(r.group.color) }} />
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900], flex: 1 }}>{r.group.name}</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => onOpenItem(r.item.id)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingLeft: 22 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[800], flex: 1 }}>{r.item.title}</Text>
                      <Text style={{ fontSize: 13, color: colors.gray[600] }}>{shortDay(dueOf(r.item) || r.item.start_date)}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            <ScrollView horizontal style={{ flex: 1 }} ref={scrollRef}>
              <View style={{ width: gridW }}>
                {/* Header: week ranges over day cells */}
                <View style={{ height: HEAD_H, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
                  <View style={{ height: 28, flexDirection: 'row' }}>
                    {weeks.map((w) => (
                      <View key={w} style={{ width: 7 * px, borderLeftWidth: 1, borderColor: colors.gray[200], justifyContent: 'center', paddingLeft: 4 }}>
                        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[600] }}>{px * 7 >= 90 ? rangeText(w, addDays(w, 6)) : ''}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ height: 28, flexDirection: 'row' }}>
                    {Array.from({ length: span.days }, (_, i) => {
                      const d = addDays(span.start, i);
                      const date = parseYmd(d);
                      const isToday = d === today;
                      const weekend = date.getDay() === 0 || date.getDay() === 6;
                      return (
                        <View key={d} style={{ width: px, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: colors.gray[200], backgroundColor: isToday ? BRAND : weekend ? colors.gray[100] : 'transparent' }}>
                          {showDays ? <Text style={{ fontSize: 11, color: isToday ? '#fff' : colors.gray[600] }}>{WEEKDAYS_SHORT[date.getDay()].slice(0, 2)} {date.getDate()}</Text>
                            : px >= 14 && date.getDay() === 1 ? <Text numberOfLines={1} style={{ fontSize: 10, color: colors.gray[500], width: px * 3 }}>{date.getDate()}</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
                <View style={{ height: rows.length * ROW_H }}>
                  {/* weekend shading and the today line */}
                  {Array.from({ length: span.days }, (_, i) => {
                    const d = parseYmd(addDays(span.start, i));
                    return (d.getDay() === 0 || d.getDay() === 6) ? <View key={i} style={{ position: 'absolute', left: i * px, top: 0, bottom: 0, width: px, backgroundColor: colors.gray[50] }} /> : null;
                  })}
                  <View style={{ position: 'absolute', left: x(today) + px / 2 - 1, top: 0, bottom: 0, width: 2, backgroundColor: BRAND }} />
                  {rows.map((r, i) => {
                    if (r.item) {
                      const t = r.item;
                      const bar = barOf(t);
                      const label = statusCol ? statusLabelOf(t, statusCol, board.values) : null;
                      return (
                        <View key={`t${t.id}`} style={{ position: 'absolute', top: i * ROW_H + 8, left: bar.left, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pressable
                            onPress={() => onOpenItem(t.id)}
                            accessibilityLabel={`${t.title}, ${formatDue(bar.start)} to ${formatDue(bar.end)}${progress.get(t.id) ? `, ${progress.get(t.id).pct} percent of its steps done` : ''}`}
                            style={{ width: bar.w, height: ROW_H - 16, borderRadius: 3, backgroundColor: paletteHex(label?.color || 'blue'), overflow: 'hidden' }}
                          >
                            {/* how much of its sub-tasks are done: the left part of the bar is darker */}
                            {!!progress.get(t.id)?.pct && <View style={{ width: `${progress.get(t.id).pct}%`, height: '100%', backgroundColor: 'rgba(0,0,0,0.28)' }} />}
                          </Pressable>
                          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800], width: 160 }}>{t.title}</Text>
                        </View>
                      );
                    }
                    // The group's summary: a thin bar from its first to its last day, with its range above.
                    const days = r.dated.flatMap((t) => [t.start_date, dueOf(t)]).filter(Boolean).sort();
                    const a = days[0];
                    const z = days[days.length - 1];
                    const len = daysBetween(a, z) + 1;
                    return (
                      <View key={`g${i}`} style={{ position: 'absolute', top: i * ROW_H + 4, left: x(a) }}>
                        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.gray[600], width: 320 }}>{r.group.name} · {rangeText(a, z)} · {len} day{len === 1 ? '' : 's'}</Text>
                        <View style={{ width: Math.max(px, len * px), height: 4, borderRadius: 2, marginTop: 2, backgroundColor: paletteHex(r.group.color), opacity: 0.85 }} />
                      </View>
                    );
                  })}
                  {gantt && links.length > 0 && (
                    <Svg width={gridW} height={rows.length * ROW_H} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
                      {links.map((l, i) => {
                        const ia = rowIdx.get(l.from);
                        const ib = rowIdx.get(l.to);
                        if (ia === undefined || ib === undefined) return null;
                        const a = barOf(rows[ia].item);
                        const b = barOf(rows[ib].item);
                        const x1 = a.left + a.w;
                        const y1 = ia * ROW_H + ROW_H / 2;
                        const x2 = b.left;
                        const y2 = ib * ROW_H + ROW_H / 2;
                        const mid = Math.max(x1 + 10, x2 - 10);
                        return (
                          <Path
                            key={i}
                            d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2} M ${x2 - 5} ${y2 - 4} L ${x2} ${y2} L ${x2 - 5} ${y2 + 4}`}
                            stroke={l.resolved ? colors.gray[400] : colors.gray[700]}
                            strokeWidth={1.4}
                            fill="none"
                          />
                        );
                      })}
                    </Svg>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </ScrollView>
        <StatusLegend board={board} items={items} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// Chart (F-VIW-07): items counted by status, person, group or priority.
// ---------------------------------------------------------------------------------------------------
const CHART_BY = [['status', 'Status'], ['person', 'Person'], ['group', 'Group'], ['priority', 'Priority']];

export function BoardChart({ board, items, people }) {
  const colors = useColors();
  const [by, setBy] = useState('status');
  const top = items.filter((t) => !t.parent_id);
  const bars = useMemo(() => {
    const m = new Map();
    const add = (key, label, color) => { const c = m.get(key) || { label, color, count: 0 }; c.count += 1; m.set(key, c); };
    const statusCol = statusColumnOf(board);
    for (const t of top) {
      if (by === 'status' && statusCol) { const l = statusLabelOf(t, statusCol, board.values); add(l?.id || l?.maps_to || 'none', l?.label || 'None', l?.color || 'grey'); }
      if (by === 'person') { const p = people.find((x) => x.id === t.assignee_id); add(t.assignee_id || 0, p?.name || t.assignee_name || 'Nobody', 'blue'); }
      if (by === 'group') { const g = board.groups.find((x) => x.id === t.business_section_id); add(g?.id || 0, g?.name || 'No group', g?.color || 'grey'); }
      if (by === 'priority') add(t.priority || 4, ['', 'Urgent', 'High', 'Normal', 'Low'][t.priority || 4], ['', 'red', 'orange', 'blue', 'grey'][t.priority || 4]);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [top, by, board, people]);
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, maxWidth: 900 }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {CHART_BY.map(([k, l]) => (
          <Pressable key={k} onPress={() => setBy(k)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.md, backgroundColor: by === k ? colors.brand[100] : colors.gray[100] }}>
            <Text style={{ fontSize: 13, color: colors.gray[800] }}>By {l.toLowerCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: 13, color: colors.gray[600] }}>{top.length} items</Text>
      {bars.map((b) => (
        <View key={`${b.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text numberOfLines={1} style={{ width: 150, fontSize: 13, color: colors.gray[800] }}>{b.label}</Text>
          <View style={{ flex: 1, height: 22, backgroundColor: colors.gray[100], borderRadius: 4 }}>
            <View style={{ width: `${(b.count / max) * 100}%`, height: 22, backgroundColor: paletteHex(b.color), borderRadius: 4 }} />
          </View>
          <Text style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{b.count}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------
// Workload (F-VIW-08): people by day for the next two weeks; a busy day stands out.
// ---------------------------------------------------------------------------------------------------
export function BoardWorkload({ board, items, people, onOpenItem }) {
  const colors = useColors();
  const today = todayYmd();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const open = items.filter((t) => !t.parent_id && !t.is_done && t.assignee_id);
  const rows = useMemo(() => {
    const m = new Map();
    for (const t of open) {
      const end = dueOf(t);
      const start = t.start_date && end && t.start_date <= end ? t.start_date : end;
      const r = m.get(t.assignee_id) || { id: t.assignee_id, name: people.find((p) => p.id === t.assignee_id)?.name || t.assignee_name || 'Someone', cells: {}, overdue: [] };
      if (end && end < today) r.overdue.push(t);
      else if (end) for (const d of days) if (d >= start && d <= end) (r.cells[d] = r.cells[d] || []).push(t);
      m.set(t.assignee_id, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [open, people, today]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>Nobody has dated work on this board yet.</Text>;
  return (
    <ScrollView horizontal contentContainerStyle={{ padding: spacing.md }}>
      <View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: 180 }} />
          <Text style={{ width: 70, fontSize: 11, color: colors.red[600], textAlign: 'center' }}>Overdue</Text>
          {days.map((d) => (
            <Text key={d} style={{ width: 56, fontSize: 11, color: d === today ? BRAND : colors.gray[500], textAlign: 'center' }}>
              {WEEKDAYS_SHORT[parseYmd(d).getDay()]} {parseYmd(d).getDate()}
            </Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: colors.gray[200], paddingVertical: 6 }}>
            <View style={{ width: 180, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar name={r.name} size={24} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.gray[900] }}>{r.name}</Text>
            </View>
            <Pressable onPress={() => r.overdue[0] && onOpenItem(r.overdue[0].id)} style={{ width: 70, alignItems: 'center' }}>
              {r.overdue.length > 0 && <View style={{ minWidth: 26, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: colors.red[500], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{r.overdue.length}</Text></View>}
            </Pressable>
            {days.map((d) => {
              const n = (r.cells[d] || []).length;
              const bg = !n ? 'transparent' : n >= 4 ? colors.red[500] : n >= 2 ? colors.amber[500] : colors.green[500];
              return (
                <Pressable key={d} onPress={() => n && onOpenItem(r.cells[d][0].id)} style={{ width: 56, alignItems: 'center' }} accessibilityLabel={`${r.name}: ${n} on ${d}`}>
                  {n > 0 && <View style={{ width: 40, height: 22, borderRadius: 4, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#1f1f1f', fontSize: 12, fontWeight: '600' }}>{n}</Text></View>}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={{ fontSize: 11, color: colors.gray[500], marginTop: spacing.sm }}>Green 1 item a day, orange 2 to 3, red 4 or more. An item counts on every day from its start to its due date.</Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------
// Summary (F-VIW-12): per group, how much is done and how much is late, with the number columns added up.
// ---------------------------------------------------------------------------------------------------
export function BoardSummary({ board, items }) {
  const colors = useColors();
  const today = todayYmd();
  const numberCols = board.columns.filter((c) => c.kind === 'numbers' || c.kind === 'formula');
  const blocks = groupBlocks(board.groups, items).map((b) => {
    const top = b.top;
    return {
      group: b.group,
      total: top.length,
      done: top.filter((t) => t.is_done).length,
      late: top.filter((t) => !t.is_done && dueOf(t) && dueOf(t) < today).length,
      sums: numberCols.map((c) => ({ c, v: c.kind === 'numbers' ? numberSummary(top, c, board.values) : top.reduce((s, t) => s + (typeof cellValue(t, c, board.values) === 'number' ? cellValue(t, c, board.values) : 0), 0) })),
    };
  });
  const head = (t, w, right) => <Text style={{ width: w, fontSize: 12, fontWeight: '600', color: colors.gray[600], textAlign: right ? 'right' : 'left' }}>{t}</Text>;
  return (
    <ScrollView horizontal contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, paddingBottom: 6 }}>
          {head('Group', 220)}{head('Items', 60, true)}{head('Done', 60, true)}{head('Progress', 160)}{head('Late', 60, true)}
          {numberCols.map((c) => <View key={c.id}>{head(c.title, 120, true)}</View>)}
        </View>
        {blocks.map((b) => (
          <View key={b.group.id ?? 'none'} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderColor: colors.gray[200] }}>
            <Text numberOfLines={1} style={{ width: 220, fontSize: 14, fontWeight: '600', color: paletteHex(b.group.color) }}>{b.group.name}</Text>
            <Text style={{ width: 60, textAlign: 'right', color: colors.gray[900] }}>{b.total}</Text>
            <Text style={{ width: 60, textAlign: 'right', color: colors.gray[900] }}>{b.done}</Text>
            <View style={{ width: 160, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray[200] }}>
                <View style={{ width: `${b.total ? (b.done / b.total) * 100 : 0}%`, height: 8, borderRadius: 4, backgroundColor: '#00c875' }} />
              </View>
              <Text style={{ fontSize: 12, color: colors.gray[600], width: 36 }}>{b.total ? Math.round((b.done / b.total) * 100) : 0}%</Text>
            </View>
            <Text style={{ width: 60, textAlign: 'right', color: b.late ? colors.red[600] : colors.gray[500] }}>{b.late}</Text>
            {b.sums.map(({ c, v }) => <Text key={c.id} style={{ width: 120, textAlign: 'right', color: colors.gray[900] }}>{v ? formatNumber(v, c.settings || {}) : ''}</Text>)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------
// Activity (F-VIW-13): everything that happened on the board's items.
// ---------------------------------------------------------------------------------------------------
const KIND_WORDS = {
  created: 'added', status: 'moved', assigned: 'assigned', completed: 'finished', reopened: 'reopened', due_changed: 'changed the date of',
  deadline_changed: 'changed the deadline of', priority_changed: 'changed the priority of', edited: 'edited', blocker_raised: 'flagged a blocker on',
  blocker_cleared: 'cleared a blocker on', update: 'posted an update on', comment: 'commented on', value_changed: 'changed', moved: 'moved',
  start_changed: 'changed the start of',
};

export function BoardActivity({ board, onOpenItem }) {
  const colors = useColors();
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let live = true;
    api.get(`/boards/${board.board.id}/activity`, { __skipOops: true }).then((r) => live && setEvents(r.data.events || [])).catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [board.board.id]);
  if (!events) return <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} />;
  if (!events.length) return <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>Nothing has happened here yet.</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 2, maxWidth: 900 }}>
      {events.map((e) => (
        <Pressable key={e.id} onPress={() => e.todo_id && onOpenItem(e.todo_id)} style={({ hovered }) => ({ flexDirection: 'row', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
          <Avatar name={e.user_name || '?'} size={26} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: colors.gray[800] }}>
              <Text style={{ fontWeight: '600' }}>{e.user_name || 'Someone'}</Text> {KIND_WORDS[e.kind] || e.kind.replace(/_/g, ' ')} <Text style={{ fontWeight: '600' }}>{e.todo_title || 'an item'}</Text>
              {e.kind === 'status' && e.to_value ? ` to ${e.to_value.replace('_', ' ')}` : ''}
              {e.kind === 'assigned' && e.to_value ? ` to ${e.to_value}` : ''}
              {e.kind === 'value_changed' && e.note ? ` (${e.note})` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>{timeAgo(e.created_at)}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
