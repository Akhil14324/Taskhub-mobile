import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Chip } from '../kit';
import { SkeletonList } from '../Skeleton';
import { PickerSheet } from '../todos/Pickers';
import { useNowTick } from '../todos/TimeHealth';
import TimeLogSheet from './TimeLogSheet';
import { Card, Heading, Note, minutesText } from './ui';
import useTimer from '../../hooks/useTimer';
import { addDays, parseYmd, toYmd, todayYmd, formatDayHeader } from '../../utils/dates';
import { showToast } from '../../utils/events';

const STATUS_TEXT = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' };

/** Monday of the week that contains a day. */
function mondayOf(ymd) {
  const d = parseYmd(ymd);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return toYmd(d);
}

/** Time for one business: the running timer, a log button and the week's timesheet with approvals. */
export default function TimeTab({ business, onPendingChange }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos } = useTodos();
  const { timer, stop } = useTimer();
  const now = useNowTick(30000);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayYmd()));
  const [sheet, setSheet] = useState(null); // { logs, can_review, pending }
  const [pickOpen, setPickOpen] = useState(false);
  const [logFor, setLogFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/time/sheet', { params: { business_id: business.id, from: weekStart, to: addDays(weekStart, 6) }, __skipOops: true });
      setSheet(res.data);
      onPendingChange?.(res.data.can_review ? res.data.pending : 0);
    } catch {
      setSheet({ logs: [], can_review: false, pending: 0 });
    }
  }, [business.id, weekStart, onPendingChange]);
  useEffect(() => { setSheet(null); load(); }, [load]);

  const review = async (log, decision) => {
    try {
      await api.post(`/time/${log.id}/review`, { decision });
      await load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not review', icon: 'alert-circle' });
    }
  };
  const removeLog = async (log) => {
    try {
      await api.delete(`/time/${log.id}`);
      await load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not remove', icon: 'alert-circle' });
    }
  };

  const days = useMemo(() => {
    const byDay = new Map();
    (sheet?.logs || []).forEach((l) => {
      const day = String(l.log_date).slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(l);
    });
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sheet]);

  const totals = useMemo(() => {
    const mine = (sheet?.logs || []).filter((l) => l.user_id === user?.id);
    const sum = (rows, status) => rows.filter((l) => !status || l.status === status).reduce((s, l) => s + l.minutes, 0);
    return { week: sum(mine), approved: sum(mine, 'approved'), team: sum(sheet?.logs || [], null) };
  }, [sheet, user]);

  const openTasks = useMemo(
    () => todos.filter((t) => t.business_id === business.id && !t.is_done && t.review_state === 'accepted').slice(0, 60),
    [todos, business.id]
  );
  const runningMin = timer ? Math.max(0, Math.floor((now - new Date(timer.started_at).getTime()) / 60000)) : 0;
  const isThisWeek = weekStart === mondayOf(todayYmd());

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <Card>
        {timer ? (
          <View style={styles.timerRow}>
            <Ionicons name="timer" size={22} color={colors.brand[600]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.big}>{minutesText(runningMin)}</Text>
              <Text style={styles.hint} numberOfLines={1}>Working on {timer.title}</Text>
            </View>
            <Chip small icon="stop" label="Stop and log" active onPress={async () => { if (await stop()) load(); }} />
          </View>
        ) : (
          <View style={styles.timerRow}>
            <Ionicons name="timer-outline" size={22} color={colors.gray[500]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.big}>No timer running</Text>
              <Text style={styles.hint}>Start one from any task, or log time you already spent.</Text>
            </View>
            <Chip small icon="add" label="Log time" active onPress={() => setPickOpen(true)} />
          </View>
        )}
      </Card>

      <View style={styles.weekBar}>
        <AnimatedPressable onPress={() => setWeekStart((w) => addDays(w, -7))} hitSlop={8}><Ionicons name="chevron-back" size={20} color={colors.gray[600]} /></AnimatedPressable>
        <Text style={styles.week}>{isThisWeek ? 'This week' : `${weekStart.slice(5)} to ${addDays(weekStart, 6).slice(5)}`}</Text>
        <AnimatedPressable onPress={() => setWeekStart((w) => addDays(w, 7))} hitSlop={8} disabled={isThisWeek}>
          <Ionicons name="chevron-forward" size={20} color={isThisWeek ? colors.gray[300] : colors.gray[600]} />
        </AnimatedPressable>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}><Text style={styles.big}>{minutesText(totals.week)}</Text><Text style={styles.hint}>You logged</Text></View>
        <View style={styles.tile}><Text style={styles.big}>{minutesText(totals.approved)}</Text><Text style={styles.hint}>Approved</Text></View>
        {sheet?.can_review && <View style={styles.tile}><Text style={styles.big}>{sheet.pending}</Text><Text style={styles.hint}>To review</Text></View>}
      </View>

      {!sheet && <SkeletonList count={2} type="notification" />}
      {sheet && !days.length && <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}><Note>No time logged this week.</Note></View>}

      {days.map(([day, logs]) => (
        <View key={day}>
          <Heading right={<Text style={styles.hint}>{minutesText(logs.reduce((s, l) => s + l.minutes, 0))}</Text>}>{formatDayHeader(day)}</Heading>
          <Card>
            {logs.map((l) => {
              const mine = l.user_id === user?.id;
              return (
                <View key={l.id} style={styles.logRow}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.logTitle} numberOfLines={1}>{l.todo_title}</Text>
                    <Text style={styles.hint} numberOfLines={1}>
                      {[sheet.can_review && !mine ? l.user_name : null, l.note, l.billable ? null : 'Not billable'].filter(Boolean).join(' · ') || 'No note'}
                    </Text>
                  </View>
                  <Text style={styles.minutes}>{minutesText(l.minutes)}</Text>
                  <View style={[styles.statusTag, l.status === 'rejected' && { backgroundColor: colors.brand[100] }]}>
                    <Text style={[styles.statusText, l.status === 'rejected' && { color: colors.brand[700] }]}>{STATUS_TEXT[l.status]}</Text>
                  </View>
                  {sheet.can_review && l.status === 'pending' && !mine && (
                    <>
                      <AnimatedPressable onPress={() => review(l, 'approved')} hitSlop={6} accessibilityLabel="Approve"><Ionicons name="checkmark-circle" size={24} color={colors.brand[600]} /></AnimatedPressable>
                      <AnimatedPressable onPress={() => review(l, 'rejected')} hitSlop={6} accessibilityLabel="Reject"><Ionicons name="close-circle-outline" size={24} color={colors.gray[500]} /></AnimatedPressable>
                    </>
                  )}
                  {mine && l.status === 'pending' && (
                    <AnimatedPressable onPress={() => removeLog(l)} hitSlop={6} accessibilityLabel="Remove"><Ionicons name="trash-outline" size={19} color={colors.gray[500]} /></AnimatedPressable>
                  )}
                </View>
              );
            })}
          </Card>
        </View>
      ))}

      <PickerSheet
        visible={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Which task?"
        options={openTasks.map((t) => ({ key: t.id, label: t.title, icon: 'checkbox-outline' }))}
        onPick={(id) => setLogFor(openTasks.find((t) => t.id === id) || null)}
      />
      <TimeLogSheet visible={!!logFor} onClose={() => setLogFor(null)} todo={logFor} onLogged={load} />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  big: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: 11, color: colors.gray[500] },
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.lg },
  week: { fontSize: fontSize.base, fontWeight: '800', color: colors.gray[800], minWidth: 120, textAlign: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  tile: { flex: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray[100], gap: 2 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  logTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  minutes: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  statusTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  statusText: { fontSize: 10, fontWeight: '800', color: colors.gray[600] },
});
