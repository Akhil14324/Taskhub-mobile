import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useNotifications } from '../context/NotificationContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { IconButton, EmptyHero, SectionHeader, Avatar, tint, accent } from '../components/kit';
import { timeAgo } from '../utils/dates';
import { showToast } from '../utils/events';

export default function ApprovalsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { subscribe } = useChat();
  const { refreshCounts } = useNotifications();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);

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
  useEffect(() => subscribe('task:changed', () => load()), [subscribe, load]);

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

  const reviews = data?.reviews || [];
  const requests = data?.requests || [];
  const mine = data?.mine || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
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
          {reviews.length === 0 && requests.length === 0 && (
            <EmptyHero icon="shield-checkmark" color="#058527" title="Nothing waiting on you" message="Finished work that needs your sign-off and deletion requests from your team appear here." />
          )}

          {reviews.length > 0 && <SectionHeader title="Finished work to review" count={reviews.length} />}
          {reviews.map((t) => (
            <Animated.View key={`r${t.id}`} layout={LinearTransition} entering={FadeIn} exiting={FadeOut}>
              <View style={styles.card}>
                <AnimatedPressable onPress={() => navigation.navigate('TaskDetail', { taskId: t.id })}>
                  <View style={styles.cardTop}>
                    <Avatar name={t.completed_by_name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{t.title}</Text>
                      <Text style={styles.cardMeta}>
                        {t.completed_by_name} finished it · {timeAgo(t.completed_at)}
                      </Text>
                      <View style={styles.bizLine}>
                        <View style={[styles.bizDot, { backgroundColor: accent(t.business_color) }]} />
                        <Text style={styles.cardMeta}>{t.business_name}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.gray[300]} />
                  </View>
                </AnimatedPressable>
                <View style={styles.buttons}>
                  <DecisionButton
                    label="Request changes"
                    icon="arrow-undo"
                    color="#eb8909"
                    loading={busy === `rej${t.id}`}
                    onPress={() => navigation.navigate('TaskDetail', { taskId: t.id })}
                  />
                  <DecisionButton
                    label="Approve"
                    icon="checkmark-done"
                    color="#058527"
                    solid
                    loading={busy === `app${t.id}`}
                    onPress={() => act(`app${t.id}`, () => api.post(`/tasks/${t.id}/approve`), 'Approved 👍')}
                  />
                </View>
              </View>
            </Animated.View>
          ))}

          {requests.length > 0 && <SectionHeader title="Requests from your team" count={requests.length} />}
          {requests.map((a) => (
            <Animated.View key={`a${a.id}`} layout={LinearTransition} entering={FadeIn} exiting={FadeOut}>
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.kindIcon, { backgroundColor: tint('#dc4c3e', 0.12) }]}>
                    <Ionicons name="trash-bin-outline" size={18} color="#dc4c3e" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>Delete “{a.task_title}”</Text>
                    <Text style={styles.cardMeta}>{a.requested_by_name} · {a.business_name} · {timeAgo(a.created_at)}</Text>
                    {!!a.reason && <Text style={styles.reason}>“{a.reason}”</Text>}
                  </View>
                </View>
                <View style={styles.buttons}>
                  <DecisionButton
                    label="Decline"
                    icon="close"
                    color={colors.gray[600]}
                    loading={busy === `dec${a.id}`}
                    onPress={() => act(`dec${a.id}`, () => api.post(`/approvals/${a.id}/decide`, { decision: 'reject' }), 'Request declined')}
                  />
                  <DecisionButton
                    label="Approve delete"
                    icon="trash"
                    color="#dc4c3e"
                    solid
                    loading={busy === `ok${a.id}`}
                    onPress={() => act(`ok${a.id}`, () => api.post(`/approvals/${a.id}/decide`, { decision: 'approve' }), 'Task deleted')}
                  />
                </View>
              </View>
            </Animated.View>
          ))}

          {mine.length > 0 && <SectionHeader title="Your requests" count={mine.length} />}
          {mine.map((a) => {
            const tone = a.status === 'approved' ? '#058527' : a.status === 'rejected' ? '#dc4c3e' : a.status === 'cancelled' ? colors.gray[400] : '#692ec2';
            return (
              <View key={`m${a.id}`} style={styles.mineRow}>
                <View style={[styles.statusDot, { backgroundColor: tone }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mineTitle} numberOfLines={1}>Delete “{a.task_title}”</Text>
                  <Text style={styles.cardMeta}>
                    {a.status === 'pending' ? 'Waiting for approval' : `${a.status[0].toUpperCase()}${a.status.slice(1)}${a.decided_by_name ? ` by ${a.decided_by_name}` : ''}`}
                    {a.decision_note ? ` — “${a.decision_note}”` : ''}
                  </Text>
                </View>
                {a.status === 'pending' && (
                  <AnimatedPressable onPress={() => act(`can${a.id}`, () => api.delete(`/approvals/${a.id}`), 'Request withdrawn')} haptic="light">
                    <Text style={styles.withdraw}>Withdraw</Text>
                  </AnimatedPressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function DecisionButton({ label, icon, color, solid, loading, onPress }) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={loading}
      haptic="medium"
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: radius.md,
        backgroundColor: solid ? color : tint(color.startsWith('#') ? color : '#64748b', 0.12),
      }}
    >
      {loading ? <ActivityIndicator size="small" color={solid ? '#fff' : color} /> : <Ionicons name={icon} size={16} color={solid ? '#fff' : color} />}
      <Text style={{ fontWeight: '700', fontSize: fontSize.sm, color: solid ? '#fff' : color }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
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
  bizLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bizDot: { width: 7, height: 7, borderRadius: 4, marginTop: 3 },
  kindIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reason: { fontSize: fontSize.sm, color: colors.gray[700], fontStyle: 'italic', marginTop: 6 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  mineTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[900] },
  withdraw: { fontSize: fontSize.sm, fontWeight: '700', color: colors.red[600] },
});
