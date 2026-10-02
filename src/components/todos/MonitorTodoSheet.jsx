import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors, useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { HealthBanner, MetricsGrid, TimelineEntries, useNowTick } from './TimeHealth';
import { Avatar, DueChip } from '../kit';
import { STATUS, BLOCKER_KINDS, formatSeconds, healthColor } from '../../utils/timeline';
import { showToast } from '../../utils/events';

const QUICK_QUESTIONS = [
  'Why is this taking so long?',
  'What is blocking you?',
  'When will this be done?',
  'Do you need help from anyone?',
];

/**
 * Read-only view of someone's to-do for a manager: how it is doing, every step it went through,
 * and a box to ask why. The answer arrives as a reply on the to-do's thread.
 */
export default function MonitorTodoSheet({ todoId, onClose }) {
  const colors = useColors();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const now = useNowTick();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!todoId) return;
    try {
      const res = await api.get(`/monitor/todos/${todoId}`, { __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this to-do');
    }
  }, [todoId]);

  useEffect(() => {
    setData(null);
    setQuestion('');
    load();
  }, [load]);

  const ask = async () => {
    const message = question.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await api.post(`/monitor/todos/${todoId}/questions`, { message });
      setQuestion('');
      showToast({ message: `Sent to ${data?.todo?.assignee_name?.split(' ')[0] || 'them'}`, tone: 'success', icon: 'help-circle' });
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not send the question', tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const todo = data?.todo;
  const openBlockers = (data?.blockers || []).filter((b) => !b.resolved_at);

  return (
    <BottomSheet visible={!!todoId} onClose={onClose} maxHeight={760} avoidKeyboard>
      {!todo ? (
        <Text style={styles.loading}>{error || 'Loading…'}</Text>
      ) : (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, todo.is_done && styles.titleDone]}>{todo.title}</Text>
          {!!todo.notes && <Text style={styles.notes}>{todo.notes}</Text>}

          <View style={styles.metaRow}>
            <View style={styles.statusPill}>
              <Ionicons name={STATUS[todo.is_done ? 'done' : todo.status].icon} size={13} color={colors.brand[700]} />
              <Text style={styles.statusText}>{STATUS[todo.is_done ? 'done' : todo.status].label}</Text>
            </View>
            <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} />
            {!!todo.assignee_name && (
              <View style={styles.who}>
                <Avatar name={todo.assignee_name} size={18} />
                <Text style={styles.whoText}>{todo.assignee_id === user?.id ? 'You' : todo.assignee_name}</Text>
              </View>
            )}
          </View>

          <HealthBanner todo={todo} now={now} />

          {openBlockers.map((b) => {
            const meta = BLOCKER_KINDS[b.kind];
            const level = b.kind === 'dead_stop' ? 'red' : 'orange';
            const since = Math.round((now - new Date(b.raised_at).getTime()) / 1000);
            return (
              <View key={b.id} style={[styles.blocker, { borderColor: healthColor(level, theme) }]}>
                <Ionicons name={meta.icon} size={20} color={healthColor(level, theme)} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockerTitle}>{meta.label}{b.blocked_by_todo_title ? `: ${b.blocked_by_todo_title}` : ''}{b.blocked_by_user_name ? `: ${b.blocked_by_user_name}` : ''}</Text>
                  {!!b.note && <Text style={styles.blockerNote}>{b.note}</Text>}
                  <Text style={[styles.blockerTime, { color: healthColor(level, theme) }]}>Stuck for {formatSeconds(since)}</Text>
                </View>
              </View>
            );
          })}

          <Text style={styles.label}>Numbers</Text>
          <MetricsGrid todo={todo} now={now} reschedules={data.metrics?.reschedules || 0} />

          <Text style={styles.label}>Ask why</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow} keyboardShouldPersistTaps="always">
            {QUICK_QUESTIONS.map((q) => (
              <AnimatedPressable key={q} onPress={() => setQuestion(q)} haptic="light" style={styles.quick}>
                <Text style={styles.quickText}>{q}</Text>
              </AnimatedPressable>
            ))}
          </ScrollView>
          <View style={styles.askBox}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about this — they are notified and can reply on the to-do"
              placeholderTextColor={colors.gray[400]}
              style={styles.askInput}
              multiline
            />
            <AnimatedPressable onPress={ask} disabled={!question.trim() || sending} haptic="medium" style={[styles.askBtn, { opacity: question.trim() && !sending ? 1 : 0.4 }]}>
              <Ionicons name="help-circle" size={16} color="#fff" />
              <Text style={styles.askText}>Ask</Text>
            </AnimatedPressable>
          </View>

          <Text style={styles.label}>Full history</Text>
          <TimelineEntries entries={data.entries} userId={user?.id} limit={0} includeComments />
          <View style={{ height: spacing.lg }} />
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  loading: { padding: spacing.xl, textAlign: 'center', color: colors.gray[500] },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], paddingHorizontal: spacing.sm },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  notes: { fontSize: fontSize.base, color: colors.gray[600], paddingHorizontal: spacing.sm, marginTop: 4, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.sm, marginTop: spacing.md },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brand[50], paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 12, fontWeight: '700', color: colors.brand[700] },
  who: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  whoText: { fontSize: fontSize.sm, color: colors.gray[700], fontWeight: '600' },
  label: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.sm,
  },
  blocker: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: spacing.sm, marginTop: spacing.sm },
  blockerTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] },
  blockerNote: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 2 },
  blockerTime: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  quickRow: { gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  quick: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  quickText: { fontSize: fontSize.sm, color: colors.gray[700], fontWeight: '600' },
  askBox: { marginHorizontal: spacing.sm, backgroundColor: colors.gray[100], borderRadius: radius.lg, padding: spacing.sm },
  askInput: { minHeight: 46, maxHeight: 110, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  askBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.brand[600] },
  askText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
});
