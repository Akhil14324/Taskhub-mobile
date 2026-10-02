import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import PromptSheet from '../components/todos/PromptSheet';
import { IconButton, EmptyHero, SectionHeader, Avatar } from '../components/kit';
import useIsDesktop from '../hooks/useBreakpoint';
import { timeAgo } from '../utils/dates';
import { showToast } from '../utils/events';

/**
 * Everything waiting on me, in order of the chain of command:
 *  - tasks proposed by people below me (accept or decline)
 *  - finished work to review (approve or ask for changes)
 *  - requests to delete a task
 * plus the requests I made myself.
 */
export default function ApprovalsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const { subscribe } = useChat();
  const { refreshCounts } = useNotifications();
  const { reviewTodo, approveTodo, rejectTodo } = useTodos();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [prompt, setPrompt] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/approvals', { __skipOops: true });
      setData(res.data);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not load approvals', tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe('todo:changed', () => load()), [subscribe, load]);

  const act = async (key, fn, message) => {
    setBusy(key);
    try {
      await fn();
      showToast({ message, tone: 'success' });
      await load();
      refreshCounts();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Something went wrong', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const openTodo = (id) => navigation.navigate('Main', { screen: 'Todos', params: { highlightId: id } });

  const onPrompt = async (text) => {
    const p = prompt;
    setPrompt(null);
    if (!p) return;
    if (p.kind === 'decline') await act(`dec${p.id}`, () => reviewTodo(p.id, 'reject', text), 'Declined');
    if (p.kind === 'changes') await act(`rej${p.id}`, () => rejectTodo(p.id, text), 'Sent back with your note');
  };

  const proposals = data?.proposals || [];
  const reviews = data?.reviews || [];
  const requests = data?.requests || [];
  const mine = data?.mine || [];
  const nothing = !proposals.length && !reviews.length && !requests.length;

  return (
    <View style={[styles.container, { paddingTop: desktop ? spacing.lg : insets.top }]}>
      <View style={styles.header}>
        {!desktop && <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Approvals</Text>
          <Text style={styles.subtitle}>Decisions follow the chain of command</Text>
        </View>
      </View>

      {!data ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand[600]} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 60 + insets.bottom }]}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {nothing && (
            <EmptyHero icon="shield-checkmark" title="Nothing waiting on you" message="Tasks proposed by your team, finished work that needs your sign-off and deletion requests appear here." />
          )}

          {proposals.length > 0 && <SectionHeader title="Proposed tasks" count={proposals.length} />}
          {proposals.map((t) => (
            <View key={`p${t.id}`} style={styles.card}>
              <AnimatedPressable onPress={() => openTodo(t.id)}>
                <View style={styles.cardTop}>
                  <Avatar name={t.created_by_name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{t.title}</Text>
                    <Text style={styles.cardMeta}>{t.created_by_name} proposed it for {t.business_name} · {timeAgo(t.created_at)}</Text>
                    {!!t.notes && <Text style={styles.reason} numberOfLines={2}>{t.notes}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.gray[300]} />
                </View>
              </AnimatedPressable>
              <View style={styles.buttons}>
                <DecisionButton
                  label="Decline"
                  icon="close"
                  loading={busy === `dec${t.id}`}
                  onPress={() => setPrompt({ kind: 'decline', id: t.id, title: 'Decline this task', hint: 'Tell them why. They can see your reason.', placeholder: 'Reason', confirmLabel: 'Decline', required: true })}
                />
                <DecisionButton
                  label="Accept"
                  icon="checkmark"
                  solid
                  loading={busy === `acc${t.id}`}
                  onPress={() => act(`acc${t.id}`, () => reviewTodo(t.id, 'accept'), 'Accepted')}
                />
              </View>
            </View>
          ))}

          {reviews.length > 0 && <SectionHeader title="Finished work to review" count={reviews.length} />}
          {reviews.map((t) => (
            <View key={`r${t.id}`} style={styles.card}>
              <AnimatedPressable onPress={() => openTodo(t.id)}>
                <View style={styles.cardTop}>
                  <Avatar name={t.submitted_by_name || t.assignee_name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{t.title}</Text>
                    <Text style={styles.cardMeta}>
                      {t.submitted_by_name || t.assignee_name} finished it {t.submitted_at ? timeAgo(t.submitted_at) : ''} · {t.business_name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.gray[300]} />
                </View>
              </AnimatedPressable>
              <View style={styles.buttons}>
                <DecisionButton
                  label="Ask for changes"
                  icon="arrow-undo"
                  loading={busy === `rej${t.id}`}
                  onPress={() => setPrompt({ kind: 'changes', id: t.id, title: 'Ask for changes', hint: 'It goes back to in progress with your note.', placeholder: 'What should change?', confirmLabel: 'Send back' })}
                />
                <DecisionButton
                  label="Approve"
                  icon="checkmark-done"
                  solid
                  loading={busy === `app${t.id}`}
                  onPress={() => act(`app${t.id}`, () => approveTodo(t.id), 'Approved')}
                />
              </View>
            </View>
          ))}

          {requests.length > 0 && <SectionHeader title="Requests from your team" count={requests.length} />}
          {requests.map((a) => (
            <View key={`a${a.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.kindIcon}>
                  <Ionicons name="trash-bin-outline" size={18} color={colors.brand[700]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>Delete “{a.todo_title}”</Text>
                  <Text style={styles.cardMeta}>{a.requested_by_name} · {a.business_name} · {timeAgo(a.created_at)}</Text>
                  {!!a.reason && <Text style={styles.reason}>“{a.reason}”</Text>}
                </View>
              </View>
              <View style={styles.buttons}>
                <DecisionButton
                  label="Decline"
                  icon="close"
                  loading={busy === `dd${a.id}`}
                  onPress={() => act(`dd${a.id}`, () => api.post(`/approvals/${a.id}/decide`, { decision: 'reject' }), 'Request declined')}
                />
                <DecisionButton
                  label="Approve delete"
                  icon="trash"
                  solid
                  loading={busy === `ok${a.id}`}
                  onPress={() => act(`ok${a.id}`, () => api.post(`/approvals/${a.id}/decide`, { decision: 'approve' }), 'Task deleted')}
                />
              </View>
            </View>
          ))}

          {mine.length > 0 && <SectionHeader title="Your requests" count={mine.length} />}
          {mine.map((a) => (
            <View key={`m${a.id}`} style={styles.mineRow}>
              <View style={[styles.statusDot, a.status === 'pending' && { backgroundColor: colors.brand[400] }, a.status === 'cancelled' && { backgroundColor: colors.gray[300] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mineTitle} numberOfLines={1}>Delete “{a.todo_title}”</Text>
                <Text style={styles.cardMeta}>
                  {a.status === 'pending' ? 'Waiting for approval' : `${a.status[0].toUpperCase()}${a.status.slice(1)}${a.decided_by_name ? ` by ${a.decided_by_name}` : ''}`}
                  {a.decision_note ? ` — “${a.decision_note}”` : ''}
                </Text>
              </View>
              {a.status === 'pending' && (
                <AnimatedPressable onPress={() => act(`can${a.id}`, () => api.delete(`/approvals/${a.id}`), 'Request withdrawn')}>
                  <Text style={styles.withdraw}>Withdraw</Text>
                </AnimatedPressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      <PromptSheet value={prompt} onClose={() => setPrompt(null)} onSubmit={onPrompt} />
    </View>
  );
}

function DecisionButton({ label, icon, solid, loading, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={loading}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
        borderRadius: radius.md, backgroundColor: solid ? colors.brand[600] : colors.gray[100],
      }}
    >
      {loading ? <ActivityIndicator size="small" color={solid ? '#fff' : colors.gray[600]} /> : <Ionicons name={icon} size={16} color={solid ? '#fff' : colors.gray[700]} />}
      <Text style={{ fontWeight: '600', fontSize: fontSize.sm, color: solid ? '#fff' : colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.6 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  cardMeta: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 3 },
  kindIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[100] },
  reason: { fontSize: fontSize.sm, color: colors.gray[700], marginTop: 6 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand[600] },
  mineTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[900] },
  withdraw: { fontSize: fontSize.sm, fontWeight: '700', color: colors.red[600] },
});
