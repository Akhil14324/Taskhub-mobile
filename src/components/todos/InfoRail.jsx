import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { ProgressRing, DueChip } from '../kit';
import { toYmd } from '../../utils/dates';

function Stat({ icon, label, value, urgent }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, minWidth: 120, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], padding: spacing.md }}>
      <Ionicons name={icon} size={16} color={urgent && value > 0 ? colors.brand[600] : colors.gray[400]} />
      <Text style={{ fontSize: 24, fontWeight: '800', color: urgent && value > 0 ? colors.brand[600] : colors.gray[900], marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>{label}</Text>
    </View>
  );
}

/**
 * Right-hand summary beside the to-do list on a wide screen: how today is going, the numbers that matter,
 * what is next, and what other people have assigned to me. `todos` is everything on my own lists.
 */
export default function InfoRail({ todos, today, meId, onOpen, onAssigned }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const data = useMemo(() => {
    const open = todos.filter((t) => !t.is_done);
    const dueToday = todos.filter((t) => t.due_date === today);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoYmd = toYmd(weekAgo);
    const next = open
      .filter((t) => !t.parent_id)
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.priority - b.priority)
      .slice(0, 5);
    const fromOthers = open.filter((t) => t.created_by !== meId && !t.parent_id && !t.business_id);
    return {
      openCount: open.length,
      overdue: open.filter((t) => t.due_date && t.due_date < today).length,
      dueToday: dueToday.filter((t) => !t.is_done).length,
      doneToday: dueToday.filter((t) => t.is_done).length,
      totalToday: dueToday.length,
      doneWeek: todos.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) >= weekAgoYmd).length,
      next,
      fromOthers,
    };
  }, [todos, today, meId]);

  const percent = data.totalToday ? Math.round((data.doneToday / data.totalToday) * 100) : 0;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <ProgressRing percent={percent} size={64} stroke={6} color={colors.brand[600]}>
          <Text style={styles.ringText}>{percent}%</Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{data.totalToday ? 'Today' : 'Nothing due today'}</Text>
          <Text style={styles.heroSub}>
            {data.totalToday ? `${data.doneToday} of ${data.totalToday} done` : 'Pick something from Next up'}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Stat icon="radio-button-off" label="Open" value={data.openCount} />
        <Stat icon="alert-circle-outline" label="Overdue" value={data.overdue} urgent />
        <Stat icon="today-outline" label="Left today" value={data.dueToday} />
        <Stat icon="checkmark-done-outline" label="Done this week" value={data.doneWeek} />
      </View>

      <Text style={styles.heading}>Next up</Text>
      {data.next.length === 0 && <Text style={styles.empty}>You are all caught up.</Text>}
      {data.next.map((t) => (
        <AnimatedPressable key={t.id} style={styles.item} onPress={() => onOpen(t)}>
          <Text style={styles.itemTitle} numberOfLines={2}>{t.title}</Text>
          <DueChip date={t.due_date} time={t.due_time} recurrence={t.recurrence} done={false} compact />
        </AnimatedPressable>
      ))}

      {data.fromOthers.length > 0 && (
        <>
          <View style={styles.headRow}>
            <Text style={[styles.heading, { flex: 1 }]}>From others</Text>
            <AnimatedPressable onPress={onAssigned}>
              <Text style={styles.link}>See all {data.fromOthers.length}</Text>
            </AnimatedPressable>
          </View>
          {data.fromOthers.slice(0, 3).map((t) => (
            <AnimatedPressable key={t.id} style={styles.item} onPress={() => onOpen(t)}>
              <Text style={styles.itemTitle} numberOfLines={2}>{t.title}</Text>
              <Text style={styles.itemSub}>from {t.created_by_name}</Text>
            </AnimatedPressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { width: 320, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.gray[200], backgroundColor: colors.gray[50] },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], padding: spacing.lg,
  },
  ringText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  heroTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  heroSub: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heading: { fontSize: 11, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  link: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600], marginTop: spacing.md },
  empty: { fontSize: fontSize.sm, color: colors.gray[500] },
  item: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 4,
  },
  itemTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  itemSub: { fontSize: fontSize.sm, color: colors.gray[500] },
});
