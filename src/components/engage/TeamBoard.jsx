import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import { Avatar } from '../kit';
import api from '../../api/client';
import BottomSheet from '../BottomSheet';
import QuickAddSheet from '../todos/QuickAddSheet';
import AnimatedPressable from '../AnimatedPressable';
import { formatDue } from '../../utils/dates';

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', in_review: 'In review', on_hold: 'On hold' };

/** The person's stand-up for today: what they finished, are on, and what is in the way (empty if not posted). */
function ReportLines({ report, styles, colors }) {
  if (!report) return null;
  const groups = [['Done', report.done], ['Working on', report.doing], ['Blocked', report.blockers]].filter(([, items]) => items.length);
  if (!groups.length && !report.note) return null;
  return (
    <View style={{ gap: 4 }}>
      {groups.map(([label, items]) => (
        <Text key={label} style={styles.reportLine} numberOfLines={2}>
          <Text style={styles.reportLabel}>{label}: </Text>
          {items.map((i) => i.title).join(', ')}
        </Text>
      ))}
      {!!report.note && <Text style={styles.reportLine} numberOfLines={2}>{report.note}</Text>}
    </View>
  );
}

/** Everything open that this person is accountable for, the same list the stand-up card shows. */
function TasksSheet({ person, onClose, styles, colors }) {
  return (
    <BottomSheet visible={!!person} onClose={onClose} maxHeight={520}>
      {!!person && (
        <View style={{ gap: 4 }}>
          <Text style={styles.sheetTitle}>{person.name}'s open tasks</Text>
          {!person.tasks.length && <Text style={styles.sheetEmpty}>No open tasks.</Text>}
          {person.tasks.map((t) => (
            <View key={t.id} style={styles.taskRow}>
              <Ionicons name={t.status === 'blocked' ? 'hand-left-outline' : 'ellipse-outline'} size={14} color={colors.gray[400]} />
              <Text style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
              <Text style={styles.taskMeta}>{STATUS_LABEL[t.status] || 'To do'}</Text>
              {!!t.due_date && <Text style={styles.taskMeta}>{formatDue(t.due_date)}</Text>}
            </View>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

/**
 * Team graph for Home: each person's finished business work this week against what they still have open,
 * their stand-up for today, and two actions per person: assign a task (lands in the Inbox, no date) and see their
 * open tasks. Built from /standup/team.
 */
export default function TeamBoard({ refreshKey = 0 }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [board, setBoard] = useState(null);
  const [assignTo, setAssignTo] = useState(null);   // person to assign a task to (opens quick add with @name)
  const [tasksOf, setTasksOf] = useState(null);     // person whose open tasks are listed

  const load = useCallback(() => {
    api.get('/standup/team', { __skipOops: true }).then((r) => setBoard(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useFocusEffect(load);

  if (!board || board.weekend || !board.people.length) return null;

  const people = [...board.people].sort((a, b) => (b.pending + b.completed) - (a.pending + a.completed) || a.name.localeCompare(b.name));
  const max = Math.max(1, ...people.map((p) => p.completed + p.pending));

  return (
    <View {...glass('card')} style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Ionicons name="people-outline" size={16} color={colors.brand[600]} />
          <Text style={styles.title}>Team</Text>
        </View>
        <Text style={styles.attend}>{board.posted} of {board.total} reported today</Text>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.brand[600] }]} /><Text style={styles.legendText}>Completed this week</Text></View>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.gray[300] }]} /><Text style={styles.legendText}>Still pending</Text></View>
      </View>

      {people.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.who}>
            <Avatar name={p.name} uri={p.profile_picture} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{p.me ? `${p.name} (you)` : p.name}</Text>
              <View style={styles.attendRow}>
                <Ionicons name={p.posted ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={p.posted ? colors.brand[600] : colors.gray[400]} />
                <Text style={[styles.attendText, !p.posted && styles.attendMissing]}>{p.posted ? 'Reported' : 'Not reported yet'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.bars}>
            <View style={[styles.bar, { width: `${(p.completed / max) * 100}%`, backgroundColor: colors.brand[600] }]} />
            <View style={[styles.bar, { width: `${(p.pending / max) * 100}%`, backgroundColor: colors.gray[300] }]} />
          </View>
          <View style={styles.counts}>
            <Text style={styles.count}>{p.completed}<Text style={styles.countLabel}> done</Text></Text>
            <Text style={styles.count}>{p.pending}<Text style={styles.countLabel}> open</Text></Text>
            {p.overdue > 0 && <Text style={[styles.count, styles.overdue]}>{p.overdue}<Text style={styles.countLabel}> late</Text></Text>}
          </View>
          <ReportLines report={p.report} styles={styles} colors={colors} />
          {!p.me && (
            <View style={styles.actions}>
              <AnimatedPressable onPress={() => setAssignTo(p)} style={styles.pill} accessibilityLabel={`Assign a task to ${p.name}`}>
                <Ionicons name="add-circle-outline" size={14} color={colors.brand[700]} />
                <Text style={styles.pillText}>Assign task</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={() => setTasksOf(p)} style={styles.pill} accessibilityLabel={`See ${p.name}'s tasks`}>
                <Ionicons name="list-outline" size={14} color={colors.brand[700]} />
                <Text style={styles.pillText}>See their tasks · {p.tasks.length}</Text>
              </AnimatedPressable>
            </View>
          )}
        </View>
      ))}
      <TasksSheet person={tasksOf} onClose={() => setTasksOf(null)} styles={styles} colors={colors} />
      {/* No date is given, so the task lands in the Inbox; the @name hands it to them without putting it on my list. */}
      <QuickAddSheet
        visible={!!assignTo}
        onClose={() => setAssignTo(null)}
        initialText={assignTo ? `@${assignTo.username} ` : ''}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  panel: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  attend: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  legend: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.gray[500], fontWeight: '600' },
  row: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200], gap: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  attendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  attendText: { fontSize: 11, color: colors.gray[500], fontWeight: '600' },
  attendMissing: { color: colors.brand[600] },
  bars: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.gray[100] },
  bar: { height: '100%' },
  counts: { flexDirection: 'row', gap: spacing.md },
  count: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] },
  countLabel: { fontSize: 11, fontWeight: '600', color: colors.gray[500] },
  overdue: { color: colors.brand[600] },
  reportLine: { fontSize: 12, color: colors.gray[700], lineHeight: 17 },
  reportLabel: { fontWeight: '800', color: colors.gray[900] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 28, borderRadius: 14, backgroundColor: colors.brand[50] },
  pillText: { fontSize: 12, fontWeight: '800', color: colors.brand[700] },
  sheetTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.sm },
  sheetEmpty: { fontSize: fontSize.sm, color: colors.gray[500] },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
  taskTitle: { flex: 1, fontSize: fontSize.base, color: colors.gray[800] },
  taskMeta: { fontSize: 11, fontWeight: '700', color: colors.gray[500] },
});
