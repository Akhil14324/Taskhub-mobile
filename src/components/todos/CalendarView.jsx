import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, PRIORITY } from '../kit';
import { deadlineState } from '../../utils/todoMeta';
import { WEEKDAYS_SHORT, MONTHS_SHORT, toYmd, addDays, formatDayHeader, formatTime } from '../../utils/dates';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The date a to-do sits on: its due date, else the day it was finished. Undated open items have none. */
function dayOf(t) {
  if (t.due_date) return t.due_date;
  if (t.is_done && t.done_at) return toYmd(new Date(t.done_at));
  return null;
}

/**
 * Month calendar. Every to-do appears on its date; finished ones stay there struck out. Tap a day to
 * see everything on it below the grid and to add something to that date.
 */
export default function CalendarView({ todos, today, onOpen, onToggle, onAdd, selectedId, wide }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cursor, setCursor] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [picked, setPicked] = useState(today);

  const [year, month] = cursor.split('-').map(Number);
  const first = `${cursor}-01`;
  const startOffset = new Date(year, month - 1, 1).getDay(); // Sunday first
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < startOffset; i += 1) out.push(addDays(first, i - startOffset));
    for (let d = 1; d <= daysInMonth; d += 1) out.push(`${cursor}-${String(d).padStart(2, '0')}`);
    while (out.length % 7 !== 0) out.push(addDays(first, out.length - startOffset));
    return out;
  }, [cursor, first, startOffset, daysInMonth]);

  const byDay = useMemo(() => {
    const map = new Map();
    let undated = 0;
    const put = (d, item) => { if (!map.has(d)) map.set(d, []); map.get(d).push(item); };
    todos.forEach((t) => {
      const d = dayOf(t);
      // A deadline on another day than the due date also shows on its own day, in red.
      if (t.deadline_date && !t.is_done && t.deadline_date !== d) put(t.deadline_date, { ...t, key: `dl-${t.id}`, isDeadline: true });
      if (!d) { if (!t.is_done && !t.deadline_date) undated += 1; return; }
      put(d, { ...t, key: String(t.id) });
    });
    map.forEach((list) => list.sort((a, b) => (a.is_done - b.is_done) || (a.due_time || '99').localeCompare(b.due_time || '99') || a.priority - b.priority));
    return { map, undated };
  }, [todos]);

  const shift = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    setCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const goToday = () => { setCursor(today.slice(0, 7)); setPicked(today); };
  const dayItems = byDay.map.get(picked) || [];
  const perCell = wide ? 3 : 2;

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.month}>{MONTHS[month - 1]} {year}</Text>
        <View style={styles.nav}>
          <AnimatedPressable style={styles.navBtn} onPress={goToday}><Text style={styles.todayText}>Today</Text></AnimatedPressable>
          <AnimatedPressable style={styles.navIcon} onPress={() => shift(-1)} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={18} color={colors.gray[600]} />
          </AnimatedPressable>
          <AnimatedPressable style={styles.navIcon} onPress={() => shift(1)} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={18} color={colors.gray[600]} />
          </AnimatedPressable>
        </View>
      </View>

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
              const isPicked = day === picked;
              const open = items.filter((t) => !t.is_done).length;
              return (
                <AnimatedPressable
                  key={day}
                  style={[styles.cell, !inMonth && styles.cellOut, isPicked && styles.cellPicked]}
                  onPress={() => setPicked(day)}
                  onLongPress={() => onAdd(day)}
                  scale={0.99}
                >
                  <View style={[styles.num, isToday && styles.numToday]}>
                    <Text style={[styles.numText, isToday && styles.numTextToday, !inMonth && styles.numTextOut]}>{Number(day.slice(8))}</Text>
                  </View>
                  {wide ? items.slice(0, perCell).map((t) => (
                    <View key={t.key} style={[styles.chip, t.is_done && styles.chipDone, { borderLeftColor: PRIORITY[t.priority]?.color || colors.gray[300] }, (t.isDeadline || deadlineState(t)) && styles.chipRed]}>
                      <Text style={[styles.chipText, t.is_done && styles.chipTextDone, (t.isDeadline || deadlineState(t)) && styles.chipTextRed]} numberOfLines={1}>{t.isDeadline ? `Deadline: ${t.title}` : t.title}</Text>
                    </View>
                  )) : (
                    <View style={styles.dots}>
                      {items.slice(0, 3).map((t) => <View key={t.key} style={[styles.dot, t.is_done && styles.dotDone, t.isDeadline && styles.dotRed]} />)}
                    </View>
                  )}
                  {wide && items.length > perCell && <Text style={styles.more}>+{items.length - perCell} more</Text>}
                  {!wide && open > 3 && <Text style={styles.more}>+{open - 3}</Text>}
                </AnimatedPressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.dayPanel}>
        <View style={styles.dayHead}>
          <Text style={styles.dayTitle}>{formatDayHeader(picked)}</Text>
          <AnimatedPressable style={styles.addBtn} onPress={() => onAdd(picked)}>
            <Ionicons name="add" size={16} color={colors.brand[600]} />
            <Text style={styles.addText}>Add</Text>
          </AnimatedPressable>
        </View>
        {dayItems.length === 0 && <Text style={styles.empty}>Nothing on this day.</Text>}
        {dayItems.map((t) => (
          <AnimatedPressable key={t.key} style={[styles.row, selectedId === t.id && styles.rowActive]} onPress={() => onOpen(t)} scale={0.99}>
            <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => onToggle(t)} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, t.is_done && styles.rowTitleDone]} numberOfLines={2}>{t.title}</Text>
              <Text style={[styles.rowMeta, (t.isDeadline || deadlineState(t)) && styles.rowMetaRed]} numberOfLines={1}>
                {t.isDeadline ? (deadlineState(t)?.label || 'Deadline') : t.is_done ? 'Completed' : t.due_time ? formatTime(t.due_time) : 'Any time'}
                {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                {!t.isDeadline && t.deadline_date && t.deadline_date !== t.due_date ? ` · deadline ${t.deadline_date.slice(5)}` : ''}
              </Text>
            </View>
          </AnimatedPressable>
        ))}
        {byDay.undated > 0 && (
          <Text style={styles.undated}>{byDay.undated} open to-do{byDay.undated === 1 ? '' : 's'} without a date are not on the calendar. They stay open until you give them one.</Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  month: { fontSize: fontSize.lg, fontWeight: '800', color: c.gray[900] },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  navBtn: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.full, borderWidth: 1, borderColor: c.gray[200], alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: fontSize.sm, fontWeight: '700', color: c.gray[700] },
  navIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  grid: { borderWidth: 1, borderColor: c.gray[200], borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.white },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 6, fontSize: 11, fontWeight: '700', color: c.gray[500], backgroundColor: c.gray[50] },
  cell: { flex: 1, minHeight: 64, padding: 4, borderTopWidth: 1, borderLeftWidth: 1, borderColor: c.gray[100], gap: 2 },
  cellOut: { backgroundColor: c.gray[50] },
  cellPicked: { backgroundColor: c.brand[50] },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numToday: { backgroundColor: c.brand[600] },
  numText: { fontSize: 12, fontWeight: '700', color: c.gray[800] },
  numTextToday: { color: '#fff' },
  numTextOut: { color: c.gray[400] },
  chip: { borderLeftWidth: 3, backgroundColor: c.gray[100], borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  chipDone: { opacity: 0.6 },
  chipText: { fontSize: 11, color: c.gray[800], fontWeight: '600' },
  chipTextDone: { textDecorationLine: 'line-through', color: c.gray[500] },
  chipRed: { backgroundColor: '#fee2e2' },
  chipTextRed: { color: '#b91c1c' },
  dotRed: { backgroundColor: '#991b1b' },
  rowMetaRed: { color: '#dc2626', fontWeight: '700' },
  more: { fontSize: 10, color: c.gray[500], fontWeight: '600', paddingLeft: 2 },
  dots: { flexDirection: 'row', gap: 3, flexWrap: 'wrap', paddingLeft: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.brand[600] },
  dotDone: { backgroundColor: c.gray[300] },
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
