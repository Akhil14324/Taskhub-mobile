import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, PRIORITY, Chip } from '../kit';
import { deadlineState, formatDuration } from '../../utils/todoMeta';
import { WEEKDAYS_SHORT, MONTHS_SHORT, toYmd, parseYmd, addDays, formatDayHeader, formatTime } from '../../utils/dates';
import { makeDraggable } from '../../hooks/useWebReorder';
import useShortcuts from '../../hooks/useShortcuts';
import * as SecureStore from '../../utils/secureStorage';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const VIEW_KEY = 'calendar.view';
const VIEWS = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
  { key: 'agenda', label: 'Agenda' },
];
const HOUR_H = 52;
const GUTTER = 46;
const AGENDA_DAYS = 30;

/** The date a to-do sits on: its due date, else the day it was finished. Undated open items have none. */
function dayOf(t) {
  if (t.due_date) return t.due_date;
  if (t.is_done && t.done_at) return toYmd(new Date(t.done_at));
  return null;
}

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
const canMove = (t) => !t.is_done && !t.isDeadline && t.permissions?.can_edit !== false;

/** Side-by-side columns for timed items that overlap, like Google Calendar. */
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    cluster.forEach((it) => {
      let c = cols.findIndex((end) => end <= it.start);
      if (c === -1) { c = cols.length; cols.push(it.end); } else cols[c] = it.end;
      it.col = c;
    });
    cluster.forEach((it) => { it.cols = cols.length; out.push(it); });
    cluster = [];
  };
  sorted.forEach((it) => {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  });
  if (cluster.length) flush();
  return out;
}

/**
 * Calendar for to-dos: Month, Week, Day (with a time grid) and Agenda. Every to-do sits on its date,
 * timed ones on their hour; finished ones stay struck out. Tap an empty hour to add, drag an item to
 * reschedule (desktop). In the month grid a busy day shows a few items and "+N more" opens that day.
 */
export default function CalendarView({ todos, today, onOpen, onToggle, onAdd, onReschedule, selectedId, wide }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rootRef = useRef(null);
  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(today);
  const [showDone, setShowDone] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const handlers = useRef({ onReschedule });
  handlers.current = { onReschedule };

  useEffect(() => {
    SecureStore.getItemAsync(VIEW_KEY).then((v) => { if (VIEWS.some((x) => x.key === v)) setView(v); }).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const chooseView = (key) => {
    setView(key);
    SecureStore.setItemAsync(VIEW_KEY, key).catch(() => {});
  };

  const span = view === 'day' ? 1 : view === 'week' ? (wide ? 7 : 3) : 0;
  const [ay, am] = anchor.split('-').map(Number);
  const weekStart = wide ? addDays(anchor, -(parseYmd(anchor).getDay())) : anchor;
  const days = useMemo(() => (span ? Array.from({ length: span }, (_, i) => addDays(span === 1 ? anchor : weekStart, i)) : []), [span, anchor, weekStart]);

  const byDay = useMemo(() => {
    const map = new Map();
    let undated = 0;
    const put = (d, item) => { if (!map.has(d)) map.set(d, []); map.get(d).push(item); };
    todos.forEach((t) => {
      if (t.is_done && !showDone) return;
      const d = dayOf(t);
      // A deadline on another day than the due date also shows on its own day, in red.
      if (t.deadline_date && !t.is_done && t.deadline_date !== d) put(t.deadline_date, { ...t, key: `dl-${t.id}`, isDeadline: true });
      if (!d) { if (!t.is_done && !t.deadline_date) undated += 1; return; }
      put(d, { ...t, key: String(t.id) });
    });
    map.forEach((list) => list.sort((a, b) => (a.is_done - b.is_done) || (a.due_time || '99').localeCompare(b.due_time || '99') || a.priority - b.priority));
    return { map, undated };
  }, [todos, showDone]);

  // ---- navigation ------------------------------------------------------------
  const shift = (dir) => {
    if (view === 'month') {
      const d = new Date(ay, am - 1 + dir, 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      setAnchor(toYmd(new Date(d.getFullYear(), d.getMonth(), Math.min(Number(anchor.slice(8)), last))));
    } else setAnchor(addDays(anchor, dir * (view === 'agenda' ? 7 : (span || 1))));
  };
  const title = (() => {
    if (view === 'month') return `${MONTHS[am - 1]} ${ay}`;
    if (view === 'day') return formatDayHeader(anchor);
    if (view === 'agenda') return `Next ${AGENDA_DAYS} days`;
    const a = parseYmd(days[0]); const b = parseYmd(days[days.length - 1]);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  })();

  useShortcuts({
    'cal.today': () => setAnchor(today),
    'cal.month': () => chooseView('month'),
    'cal.week': () => chooseView('week'),
    'cal.day': () => chooseView('day'),
    'cal.agenda': () => chooseView('agenda'),
    'cal.prev': () => shift(-1),
    'cal.next': () => shift(1),
  });

  // ---- drag to reschedule (desktop browsers) ---------------------------------
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const root = rootRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;
    let dragId = null;
    let hover = null;
    const itemOf = (el) => (el && el.closest ? el.closest('[data-cal-item]') : null);
    const targetOf = (el) => (el && el.closest ? el.closest('[data-cal-cell],[data-cal-col],[data-cal-allday]') : null);
    const clear = () => { if (hover) hover.style.outline = ''; hover = null; };
    const resolve = (target, y) => {
      if (target.dataset.calCol) {
        const r = target.getBoundingClientRect();
        const start = Number(target.dataset.startMin);
        const mins = Math.max(0, Math.min(23 * 60 + 45, start + Math.round(((y - r.top) / HOUR_H) * 4) * 15));
        return { due_date: target.dataset.calCol, due_time: hhmm(mins) };
      }
      if (target.dataset.calAllday) return { due_date: target.dataset.calAllday, due_time: null };
      return { due_date: target.dataset.calCell };
    };
    const onDragStart = (e) => {
      const it = itemOf(e.target);
      if (!it) return;
      dragId = Number(it.dataset.calItem);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
      it.style.opacity = '0.45';
    };
    const onDragOver = (e) => {
      if (dragId == null) return;
      const t = targetOf(e.target);
      if (!t) return;
      e.preventDefault();
      if (hover !== t) { clear(); hover = t; t.style.outline = '2px dashed #dc2626'; t.style.outlineOffset = '-2px'; }
    };
    const onDropEvent = (e) => {
      if (dragId == null) return;
      const t = targetOf(e.target);
      if (!t) return;
      e.preventDefault();
      const id = dragId;
      const patch = resolve(t, e.clientY);
      clear();
      handlers.current.onReschedule?.(id, patch);
    };
    const onDragEnd = (e) => {
      const it = itemOf(e.target);
      if (it) it.style.opacity = '';
      clear();
      dragId = null;
    };
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDropEvent);
    root.addEventListener('dragend', onDragEnd);
    return () => {
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDropEvent);
      root.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  /** Wrap a draggable thing: desktop can drag it to another day or hour. */
  const Drag = ({ t, children, style }) => (canMove(t) && Platform.OS === 'web'
    ? <View ref={makeDraggable} dataSet={{ calItem: String(t.id) }} style={style}>{children}</View>
    : <View style={style}>{children}</View>);

  const isRed = (t) => t.isDeadline || deadlineState(t);
  const metaLine = (t) => [
    t.isDeadline ? (deadlineState(t)?.label || 'Deadline') : t.is_done ? 'Completed' : t.due_time ? `${formatTime(t.due_time)}${t.duration_minutes ? ` · ${formatDuration(t.duration_minutes)}` : ''}` : 'Any time',
    t.assignee_name || null,
    !t.isDeadline && t.deadline_date && t.deadline_date !== t.due_date ? `deadline ${t.deadline_date.slice(5)}` : null,
  ].filter(Boolean).join(' · ');

  const ItemRow = ({ t }) => (
    <AnimatedPressable style={[styles.row, selectedId === t.id && styles.rowActive]} onPress={() => onOpen(t)} scale={0.99}>
      <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => onToggle(t)} size={20} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, t.is_done && styles.rowTitleDone]} numberOfLines={2}>{t.title}</Text>
        <Text style={[styles.rowMeta, isRed(t) && styles.rowMetaRed]} numberOfLines={1}>{metaLine(t)}</Text>
      </View>
    </AnimatedPressable>
  );

  // ---- month -------------------------------------------------------------------
  const renderMonth = () => {
    const cursor = anchor.slice(0, 7);
    const first = `${cursor}-01`;
    const startOffset = new Date(ay, am - 1, 1).getDay();
    const daysInMonth = new Date(ay, am, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(addDays(first, i - startOffset));
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(`${cursor}-${String(d).padStart(2, '0')}`);
    while (cells.length % 7 !== 0) cells.push(addDays(first, cells.length - startOffset));
    const perCell = wide ? 3 : 0;
    const dayItems = byDay.map.get(anchor) || [];
    return (
      <View>
        <View style={styles.grid}>
          <View style={styles.weekRow}>
            {WEEKDAYS_SHORT.map((w) => <Text key={w} style={styles.weekday}>{wide ? w : w[0]}</Text>)}
          </View>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={styles.weekRow}>
              {cells.slice(row * 7, row * 7 + 7).map((day) => {
                const items = byDay.map.get(day) || [];
                const inMonth = day.startsWith(cursor);
                const isToday = day === today;
                const open = items.filter((t) => !t.is_done).length;
                const load = open >= 6 ? styles.cellBusy : open >= 3 ? styles.cellLoad : null;
                return (
                  <AnimatedPressable
                    key={day}
                    dataSet={{ calCell: day }}
                    style={[styles.cell, wide && styles.cellWide, !inMonth && styles.cellOut, load, day === anchor && styles.cellPicked]}
                    onPress={() => setAnchor(day)}
                    onLongPress={() => onAdd(day)}
                    scale={0.99}
                  >
                    <View style={styles.cellTop}>
                      <View style={[styles.num, isToday && styles.numToday]}>
                        <Text style={[styles.numText, isToday && styles.numTextToday, !inMonth && styles.numTextOut]}>{Number(day.slice(8))}</Text>
                      </View>
                      {open > 0 && <Text style={styles.count}>{open}</Text>}
                    </View>
                    {wide ? items.slice(0, perCell).map((t) => (
                      <Drag key={t.key} t={t} style={styles.chipWrap}>
                        <AnimatedPressable
                          onPress={() => onOpen(t)}
                          scale={0.98}
                          style={[styles.chip, t.is_done && styles.chipDone, { borderLeftColor: PRIORITY[t.priority]?.color || colors.gray[300] }, isRed(t) && styles.chipRed]}
                        >
                          <Text style={[styles.chipText, t.is_done && styles.chipTextDone, isRed(t) && styles.chipTextRed]} numberOfLines={1}>
                            {t.due_time ? `${formatTime(t.due_time)} ` : ''}{t.isDeadline ? `Deadline: ${t.title}` : t.title}
                          </Text>
                        </AnimatedPressable>
                      </Drag>
                    )) : (
                      <View style={styles.dots}>
                        {items.slice(0, 4).map((t) => <View key={t.key} style={[styles.dot, t.is_done && styles.dotDone, t.isDeadline && styles.dotRed]} />)}
                      </View>
                    )}
                    {wide && items.length > perCell && (
                      <AnimatedPressable onPress={() => { setAnchor(day); chooseView('day'); }} scale={0.98}>
                        <Text style={styles.more}>+{items.length - perCell} more</Text>
                      </AnimatedPressable>
                    )}
                  </AnimatedPressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.dayPanel}>
          <View style={styles.dayHead}>
            <Text style={styles.dayTitle}>{formatDayHeader(anchor)}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <AnimatedPressable style={styles.addBtn} onPress={() => chooseView('day')}>
                <Ionicons name="time-outline" size={15} color={colors.brand[600]} />
                <Text style={styles.addText}>Hours</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.addBtn} onPress={() => onAdd(anchor)}>
                <Ionicons name="add" size={16} color={colors.brand[600]} />
                <Text style={styles.addText}>Add</Text>
              </AnimatedPressable>
            </View>
          </View>
          {dayItems.length === 0 && <Text style={styles.empty}>Nothing on this day.</Text>}
          {dayItems.map((t) => <ItemRow key={t.key} t={t} />)}
        </View>
      </View>
    );
  };

  // ---- week / day time grid ----------------------------------------------------
  const renderGrid = () => {
    // Visible hours: 7 AM to 8 PM, stretched to fit anything outside that.
    let startH = 7;
    let endH = 20;
    days.forEach((d) => (byDay.map.get(d) || []).forEach((t) => {
      const s = minutesOf(t.due_time);
      if (s == null) return;
      startH = Math.min(startH, Math.floor(s / 60));
      endH = Math.max(endH, Math.min(24, Math.ceil((s + (t.duration_minutes || 30)) / 60)));
    }));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (days.includes(today)) { startH = Math.min(startH, Math.floor(nowMin / 60)); endH = Math.max(endH, Math.min(24, Math.floor(nowMin / 60) + 1)); }
    const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
    const gridH = hours.length * HOUR_H;
    const allDay = days.map((d) => (byDay.map.get(d) || []).filter((t) => minutesOf(t.due_time) == null || t.isDeadline));
    const timed = days.map((d) => layoutDay((byDay.map.get(d) || [])
      .filter((t) => minutesOf(t.due_time) != null && !t.isDeadline)
      .map((t) => { const s = minutesOf(t.due_time); return { t, start: s, end: s + Math.max(t.duration_minutes || 30, 30) }; })));
    const rows = Math.max(0, ...allDay.map((a) => a.length));

    return (
      <View style={styles.grid}>
        <View style={[styles.gridHead, { paddingLeft: GUTTER }]}>
          {days.map((d) => {
            const dt = parseYmd(d);
            const isToday = d === today;
            return (
              <AnimatedPressable key={d} style={styles.colHead} onPress={() => { setAnchor(d); if (view === 'week') chooseView('day'); }} scale={0.98}>
                <Text style={[styles.colDow, isToday && { color: colors.brand[600] }]}>{WEEKDAYS_SHORT[dt.getDay()]}</Text>
                <View style={[styles.num, { width: 28, height: 28, borderRadius: 14 }, isToday && styles.numToday]}>
                  <Text style={[styles.numText, { fontSize: 14 }, isToday && styles.numTextToday]}>{dt.getDate()}</Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>

        {rows > 0 && (
          <View style={[styles.allDay, { paddingLeft: GUTTER }]}>
            <Text style={styles.allDayLabel}>All day</Text>
            {days.map((d, i) => (
              <View key={d} dataSet={{ calAllday: d }} style={styles.allDayCol}>
                {allDay[i].map((t) => (
                  <Drag key={t.key} t={t} style={styles.chipWrap}>
                    <AnimatedPressable
                      onPress={() => onOpen(t)}
                      scale={0.98}
                      style={[styles.chip, t.is_done && styles.chipDone, { borderLeftColor: PRIORITY[t.priority]?.color || colors.gray[300] }, isRed(t) && styles.chipRed]}
                    >
                      <Text style={[styles.chipText, t.is_done && styles.chipTextDone, isRed(t) && styles.chipTextRed]} numberOfLines={1}>{t.isDeadline ? `Deadline: ${t.title}` : t.title}</Text>
                    </AnimatedPressable>
                  </Drag>
                ))}
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: GUTTER, height: gridH }}>
            {hours.map((h, i) => <Text key={h} style={[styles.hourLabel, { top: i * HOUR_H - 7 }]}>{i === 0 ? '' : hourLabel(h)}</Text>)}
          </View>
          {days.map((d, ci) => (
            <View key={d} dataSet={{ calCol: d, startMin: String(startH * 60) }} style={[styles.timeCol, { height: gridH }]}>
              {hours.map((h) => (
                <AnimatedPressable
                  key={h}
                  style={styles.slot}
                  onPress={() => onAdd(d, `${String(h).padStart(2, '0')}:00`)}
                  scale={1}
                  accessibilityLabel={`Add at ${hourLabel(h)}`}
                />
              ))}
              {timed[ci].map(({ t, start, end, col, cols }) => {
                const top = ((start - startH * 60) / 60) * HOUR_H;
                const height = Math.max(((end - start) / 60) * HOUR_H - 2, 22);
                return (
                  <View
                    key={t.key}
                    style={{ position: 'absolute', top, height, left: `${(col / cols) * 100}%`, width: `${100 / cols}%`, paddingHorizontal: 1 }}
                  >
                    <Drag t={t} style={{ flex: 1 }}>
                      <AnimatedPressable
                        onPress={() => onOpen(t)}
                        scale={0.98}
                        style={[styles.block, { borderLeftColor: PRIORITY[t.priority]?.color || colors.gray[400] }, t.is_done && styles.chipDone, isRed(t) && styles.chipRed, selectedId === t.id && styles.blockActive]}
                      >
                        <Text style={[styles.blockTitle, t.is_done && styles.chipTextDone, isRed(t) && styles.chipTextRed]} numberOfLines={height > 40 ? 2 : 1}>{t.title}</Text>
                        {height > 36 && <Text style={styles.blockMeta} numberOfLines={1}>{formatTime(t.due_time)}{t.duration_minutes ? ` · ${formatDuration(t.duration_minutes)}` : ''}</Text>}
                      </AnimatedPressable>
                    </Drag>
                  </View>
                );
              })}
              {d === today && (
                <View pointerEvents="none" style={[styles.nowLine, { top: ((nowMin - startH * 60) / 60) * HOUR_H }]}>
                  <View style={styles.nowDot} />
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ---- agenda --------------------------------------------------------------------
  const renderAgenda = () => {
    const overdue = [];
    byDay.map.forEach((list, d) => { if (d < today) list.forEach((t) => { if (!t.is_done && !t.isDeadline) overdue.push(t); }); });
    overdue.sort((a, b) => a.due_date.localeCompare(b.due_date));
    const groups = [];
    for (let i = 0; i < AGENDA_DAYS; i += 1) {
      const d = addDays(anchor, i);
      const list = byDay.map.get(d) || [];
      if (list.length) groups.push({ d, list });
    }
    return (
      <View style={{ gap: spacing.md }}>
        {overdue.length > 0 && anchor <= today && (
          <View style={styles.agendaGroup}>
            <Text style={[styles.agendaDay, { color: colors.red[600] }]}>Overdue · {overdue.length}</Text>
            {overdue.map((t) => <ItemRow key={t.key} t={t} />)}
          </View>
        )}
        {groups.map(({ d, list }) => (
          <View key={d} style={styles.agendaGroup}>
            <Text style={styles.agendaDay}>{formatDayHeader(d)}</Text>
            {list.map((t) => <ItemRow key={t.key} t={t} />)}
          </View>
        ))}
        {!groups.length && !overdue.length && <Text style={styles.empty}>Nothing scheduled in this stretch.</Text>}
      </View>
    );
  };

  return (
    <View ref={rootRef}>
      <View style={styles.head}>
        <Text style={styles.month} numberOfLines={1}>{title}</Text>
        <View style={styles.nav}>
          <AnimatedPressable style={styles.navBtn} onPress={() => setAnchor(today)}><Text style={styles.todayText}>Today</Text></AnimatedPressable>
          <AnimatedPressable style={styles.navIcon} onPress={() => shift(-1)} accessibilityLabel="Previous">
            <Ionicons name="chevron-back" size={18} color={colors.gray[600]} />
          </AnimatedPressable>
          <AnimatedPressable style={styles.navIcon} onPress={() => shift(1)} accessibilityLabel="Next">
            <Ionicons name="chevron-forward" size={18} color={colors.gray[600]} />
          </AnimatedPressable>
        </View>
      </View>
      <View style={styles.toolbar}>
        <View style={styles.seg}>
          {VIEWS.map((v) => (
            <AnimatedPressable key={v.key} style={[styles.segBtn, view === v.key && styles.segBtnActive]} onPress={() => chooseView(v.key)} scale={0.97}>
              <Text style={[styles.segText, view === v.key && styles.segTextActive]}>{v.key === 'week' && !wide ? '3 days' : v.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <Chip small icon={showDone ? 'checkmark-circle' : 'checkmark-circle-outline'} label="Done" active={showDone} onPress={() => setShowDone((v) => !v)} />
      </View>

      {view === 'month' ? renderMonth() : view === 'agenda' ? renderAgenda() : renderGrid()}

      {byDay.undated > 0 && (
        <Text style={styles.undated}>{byDay.undated} open to-do{byDay.undated === 1 ? '' : 's'} without a date are not on the calendar. They stay open until you give them one.</Text>
      )}
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, gap: spacing.sm },
  month: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: c.gray[900] },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  navBtn: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.full, borderWidth: 1, borderColor: c.gray[200], alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: fontSize.sm, fontWeight: '700', color: c.gray[700] },
  navIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  seg: { flexDirection: 'row', backgroundColor: c.gray[100], borderRadius: radius.full, padding: 3 },
  segBtn: { paddingHorizontal: spacing.md, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segBtnActive: { backgroundColor: c.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: fontSize.sm, fontWeight: '700', color: c.gray[500] },
  segTextActive: { color: c.brand[600] },

  grid: { borderWidth: 1, borderColor: c.gray[200], borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.white },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 6, fontSize: 11, fontWeight: '700', color: c.gray[500], backgroundColor: c.gray[50] },
  cell: { flex: 1, minHeight: 64, padding: 4, borderTopWidth: 1, borderLeftWidth: 1, borderColor: c.gray[100], gap: 2 },
  cellWide: { minHeight: 118, flexBasis: 0 },
  cellOut: { backgroundColor: c.gray[50] },
  cellLoad: { backgroundColor: c.brand[50] },
  cellBusy: { backgroundColor: c.brand[100] },
  cellPicked: { borderWidth: 2, borderColor: c.brand[500] },
  cellTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 10, fontWeight: '800', color: c.brand[700], backgroundColor: c.brand[100], borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numToday: { backgroundColor: c.brand[600] },
  numText: { fontSize: 12, fontWeight: '700', color: c.gray[800] },
  numTextToday: { color: '#fff' },
  numTextOut: { color: c.gray[400] },
  chipWrap: { alignSelf: 'stretch' },
  chip: { borderLeftWidth: 3, backgroundColor: c.gray[100], borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  chipDone: { opacity: 0.6 },
  chipText: { fontSize: 11, color: c.gray[800], fontWeight: '600' },
  chipTextDone: { textDecorationLine: 'line-through', color: c.gray[500] },
  chipRed: { backgroundColor: c.red[100] },
  chipTextRed: { color: c.red[700] },
  dotRed: { backgroundColor: c.red[700] },
  rowMetaRed: { color: c.red[600], fontWeight: '700' },
  more: { fontSize: 11, color: c.brand[700], fontWeight: '800', paddingLeft: 2, paddingTop: 1 },
  dots: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', paddingLeft: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.brand[600] },
  dotDone: { backgroundColor: c.gray[300] },

  gridHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.gray[100], backgroundColor: c.gray[50] },
  colHead: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 },
  colDow: { fontSize: 11, fontWeight: '700', color: c.gray[500] },
  allDay: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.gray[100], paddingVertical: 4 },
  allDayLabel: { position: 'absolute', left: 4, top: 8, fontSize: 10, color: c.gray[400], fontWeight: '700' },
  allDayCol: { flex: 1, gap: 2, paddingHorizontal: 1, minHeight: 22 },
  hourLabel: { position: 'absolute', right: 6, fontSize: 10, color: c.gray[400], fontWeight: '600' },
  timeCol: { flex: 1, borderLeftWidth: 1, borderLeftColor: c.gray[100] },
  slot: { height: HOUR_H, borderTopWidth: 1, borderTopColor: c.gray[100] },
  block: { flex: 1, borderLeftWidth: 3, borderRadius: 5, backgroundColor: c.brand[50], paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' },
  blockActive: { backgroundColor: c.brand[100] },
  blockTitle: { fontSize: 11, fontWeight: '700', color: c.gray[900] },
  blockMeta: { fontSize: 10, color: c.gray[500], marginTop: 1 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: c.brand[600], zIndex: 5 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand[600] },

  agendaGroup: { gap: 2 },
  agendaDay: { fontSize: fontSize.sm, fontWeight: '800', color: c.gray[700], paddingHorizontal: spacing.sm, paddingBottom: 2 },
  dayPanel: { marginTop: spacing.lg },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  dayTitle: { fontSize: fontSize.md, fontWeight: '800', color: c.gray[900] },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm, height: 30 },
  addText: { fontSize: fontSize.sm, fontWeight: '700', color: c.brand[600] },
  empty: { fontSize: fontSize.sm, color: c.gray[500], paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowActive: { backgroundColor: c.brand[50] },
  rowTitle: { fontSize: fontSize.base, fontWeight: '600', color: c.gray[900] },
  rowTitleDone: { textDecorationLine: 'line-through', color: c.gray[400] },
  rowMeta: { fontSize: fontSize.xs, color: c.gray[500], marginTop: 1 },
  undated: { fontSize: fontSize.xs, color: c.gray[500], marginTop: spacing.md, lineHeight: 17 },
});
