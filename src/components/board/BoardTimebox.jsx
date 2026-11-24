import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { todayYmd, addDays, formatDayHeader, formatTime } from '../../utils/dates';
import { Tr } from '../kit';

const HOUR = 56;
const FROM = 6;
const TO = 22;
const toMin = (hm) => { const m = /^(\d{2}):(\d{2})/.exec(hm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/**
 * The board's tasks as one day, hour by hour. It is only another view of the same data: a task with a time sits at
 * that time (as long as its estimate, or half an hour), a task with a date but no time is listed under "Any time".
 */
export default function BoardTimebox({ items, onOpenItem, onToggle, onAddAt }) {
  const colors = useColors();
  const [day, setDay] = useState(todayYmd());
  const today = todayYmd();

  const { timed, anytime } = useMemo(() => {
    const onDay = items.filter((t) => (t.due_date || t.deadline_date) === day);
    const timedList = []; const any = [];
    onDay.forEach((t) => (toMin(t.due_time) !== null && t.due_date === day ? timedList : any).push(t));
    timedList.sort((a, b) => toMin(a.due_time) - toMin(b.due_time));
    // Side-by-side lanes for tasks that overlap.
    const lanes = [];
    const placed = timedList.map((t) => {
      const start = toMin(t.due_time); const end = start + Math.max(30, t.duration_minutes || 30);
      let lane = lanes.findIndex((e) => e <= start);
      if (lane < 0) { lane = lanes.length; lanes.push(end); } else lanes[lane] = end;
      return { t, start, end, lane };
    });
    const laneCount = Math.max(1, lanes.length);
    return { timed: placed.map((p) => ({ ...p, laneCount })), anytime: any };
  }, [items, day]);

  const gridH = (TO - FROM) * HOUR;
  const hours = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const nav = (icon, onPress, label) => (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ hovered }) => ({ padding: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      <Ionicons name={icon} size={20} color={colors.gray[700]} />
    </Pressable>
  );
  const row = (t, extra) => (
    <Pressable key={t.id} onPress={() => onOpenItem(t.id)} accessibilityLabel={`Open ${t.title}`} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : colors.white, borderWidth: 1, borderColor: colors.gray[200], ...extra })}>
      <Pressable onPress={() => onToggle?.(t)} hitSlop={6} accessibilityLabel={t.is_done ? 'Mark not done' : 'Mark done'}>
        <Ionicons name={t.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={t.is_done ? colors.green?.[600] || BRAND : colors.gray[400]} />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: t.is_done ? colors.gray[400] : colors.gray[900], textDecorationLine: t.is_done ? 'line-through' : 'none' }}><Tr>{t.title}</Tr></Text>
      {!!t.assignee_name && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500], maxWidth: 90 }}>{t.assignee_name.split(' ')[0]}</Text>}
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {nav('chevron-back', () => setDay(addDays(day, -1)), 'Previous day')}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.gray[900], minWidth: 150, textAlign: 'center' }}>{day === today ? 'Today' : formatDayHeader(day)}</Text>
        {nav('chevron-forward', () => setDay(addDays(day, 1)), 'Next day')}
        {day !== today && (
          <Pressable onPress={() => setDay(today)} style={{ marginLeft: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.gray[100] }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>Today</Text>
          </Pressable>
        )}
        <Text style={{ marginLeft: 12, fontSize: 13, color: colors.gray[500] }}>{timed.length + anytime.length} task{timed.length + anytime.length === 1 ? '' : 's'}</Text>
      </View>

      {anytime.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6 }}>Any time</Text>
          {anytime.map((t) => row(t))}
        </View>
      )}

      <View style={{ height: gridH, borderTopWidth: 1, borderColor: colors.gray[200], position: 'relative' }}>
        {hours.map((h) => (
          <Pressable
            key={h}
            disabled={!onAddAt}
            onPress={() => onAddAt?.(day, `${String(h).padStart(2, '0')}:00`)}
            accessibilityLabel={`Add a task at ${formatTime(`${String(h).padStart(2, '0')}:00`)}`}
            style={({ hovered }) => ({ position: 'absolute', top: (h - FROM) * HOUR, left: 0, right: 0, height: HOUR, borderBottomWidth: 1, borderColor: colors.gray[100], backgroundColor: hovered && onAddAt ? colors.gray[50] : 'transparent' })}
          >
            <Text style={{ position: 'absolute', left: 0, top: 4, width: 56, fontSize: 11, color: colors.gray[500] }}>{formatTime(`${String(h).padStart(2, '0')}:00`)}</Text>
          </Pressable>
        ))}
        {day === today && nowMin >= FROM * 60 && nowMin <= TO * 60 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 56, right: 0, top: ((nowMin - FROM * 60) / 60) * HOUR, height: 2, backgroundColor: BRAND }} />
        )}
        {timed.map(({ t, start, end, lane, laneCount }) => {
          const top = Math.max(0, ((start - FROM * 60) / 60) * HOUR);
          const height = Math.max(26, ((end - start) / 60) * HOUR - 2);
          return (
            <Pressable
              key={t.id}
              onPress={() => onOpenItem(t.id)}
              accessibilityLabel={`Open ${t.title}`}
              style={{ position: 'absolute', top, height, left: `calc(60px + (100% - 64px) * ${lane / laneCount})`, width: `calc((100% - 64px) / ${laneCount} - 4px)`, borderRadius: radius.md, backgroundColor: t.is_done ? colors.gray[100] : colors.brand[100], borderLeftWidth: 3, borderLeftColor: t.is_done ? colors.gray[400] : BRAND, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' }}
            >
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: t.is_done ? colors.gray[500] : colors.gray[900], textDecorationLine: t.is_done ? 'line-through' : 'none' }}><Tr>{t.title}</Tr></Text>
              {height > 34 && <Text numberOfLines={1} style={{ fontSize: 11, color: colors.gray[600] }}>{formatTime(t.due_time)}{t.assignee_name ? ` · ${t.assignee_name.split(' ')[0]}` : ''}</Text>}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
