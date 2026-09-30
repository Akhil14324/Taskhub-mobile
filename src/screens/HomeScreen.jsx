import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { useChat } from '../context/ChatContext';
import { useColors, useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { IconButton, ProgressRing, TodoCheckbox, DueChip, accent, tint } from '../components/kit';
import { greeting, todayYmd, toYmd, WEEKDAYS_SHORT, parseYmd } from '../utils/dates';
import { pushEnvironment } from '../services/webPush';
import { showToast } from '../utils/events';

export default function HomeScreen() {
  const colors = useColors();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang } = useLang();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const { todos, insights, fetchTodos, fetchInsights, toggleTodo } = useTodos();
  const { unreadCount, approvalCount, pushState, enablePush, refreshCounts } = useNotifications();
  const { totalUnread } = useChat();

  const [summary, setSummary] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openTodoId, setOpenTodoId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [sum, org] = await Promise.all([
        api.get('/tasks/summary', { __skipOops: true }),
        user?.is_leader || user?.manages_business_ids?.length ? api.get('/org/structure', { __skipOops: true }) : Promise.resolve(null),
      ]);
      setSummary(sum.data);
      if (org) {
        const all = org.data.businesses || [];
        setBusinesses(user?.is_leader ? all : all.filter((b) => user.manages_business_ids.includes(b.id)));
      }
    } catch {
      // offline; keep what we have
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), fetchTodos(), fetchInsights(), refreshCounts(), refreshUser?.()]);
  };

  const today = todayYmd();
  const openToday = todos.filter((t) => !t.is_done && t.due_date && t.due_date <= today);
  const doneToday = todos.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today);
  const totalToday = openToday.length + doneToday.length;
  const percent = totalToday ? Math.round((doneToday.length / totalToday) * 100) : 0;
  const firstName = (user?.name || '').split(' ').find((p) => p.length > 1) || user?.name || '';
  const notPlaced = !user?.is_leader && !(user?.memberships || []).length;

  const tryEnablePush = async () => {
    const result = await enablePush();
    if (result === 'granted') showToast({ message: 'Notifications are on 🔔', tone: 'success' });
    else if (result === 'denied') showToast({ message: 'Notifications are blocked in your browser settings', tone: 'error' });
  };

  const weekMax = Math.max(1, ...(insights?.week || []).map((d) => d.count));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Greeting */}
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>{firstName} 👋</Text>
            {!!user?.display_title && (
              <Text style={styles.role} numberOfLines={1}>
                {user.display_title}
                {user.memberships?.length ? ` · ${user.memberships.map((m) => m.business_name).join(', ')}` : ''}
              </Text>
            )}
          </View>
          <IconButton icon={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} onPress={toggleTheme} />
          <AnimatedPressable onPress={toggleLang} style={styles.langBtn} haptic="light">
            <Text style={styles.langText}>{lang === 'en' ? 'తె' : 'EN'}</Text>
          </AnimatedPressable>
          <IconButton icon="notifications-outline" badge={unreadCount} onPress={() => navigation.navigate('Notifications')} />
        </View>

        {/* Notification permission prompt */}
        {(pushState === 'default' || pushState === 'needs-install') && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.pushCard}>
            <View style={styles.pushIcon}><Ionicons name="notifications" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pushTitle}>Never miss a task</Text>
              <Text style={styles.pushText}>
                {pushState === 'needs-install'
                  ? `Add TaskHub to your Home Screen to get alerts: tap ${pushEnvironment.isIOS() ? 'Share → Add to Home Screen' : 'the browser menu → Install app'}, then open it from there.`
                  : 'Get alerts for new tasks, @mentions, reminders and chats.'}
              </Text>
            </View>
            {pushState === 'default' && (
              <AnimatedPressable onPress={tryEnablePush} style={styles.pushBtn} haptic="medium">
                <Text style={styles.pushBtnText}>Turn on</Text>
              </AnimatedPressable>
            )}
          </Animated.View>
        )}

        {notPlaced && (
          <View style={[styles.card, styles.infoCard]}>
            <Ionicons name="hourglass-outline" size={22} color={colors.amber[600]} />
            <Text style={styles.infoText}>You’re not placed in a business yet. The Chairman or Chief of Staff will add you soon — meanwhile your personal to-dos and chat work as usual.</Text>
          </View>
        )}

        {approvalCount > 0 && (
          <AnimatedPressable onPress={() => navigation.navigate('Approvals')} haptic="light">
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.card, styles.approvalCard]}>
              <Ionicons name="shield-checkmark" size={22} color="#692ec2" />
              <Text style={styles.approvalText}>{approvalCount} item{approvalCount > 1 ? 's' : ''} waiting for your approval</Text>
              <Ionicons name="chevron-forward" size={18} color="#692ec2" />
            </Animated.View>
          </AnimatedPressable>
        )}

        {/* Today */}
        <Animated.View entering={FadeInDown.delay(60).duration(320)} style={styles.card}>
          <View style={styles.todayHeader}>
            <ProgressRing percent={percent} size={64} stroke={6} color="#058527">
              <Text style={styles.ringValue}>{doneToday.length}/{totalToday || 0}</Text>
            </ProgressRing>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Today</Text>
              <Text style={styles.cardSub}>
                {totalToday === 0 ? 'Nothing scheduled — plan your day'
                  : openToday.length === 0 ? 'All done. Brilliant! 🎉'
                    : `${openToday.length} to-do${openToday.length > 1 ? 's' : ''} left`}
              </Text>
              {!!insights?.streak && (
                <View style={styles.streak}>
                  <Text style={styles.streakText}>🔥 {insights.streak}-day streak</Text>
                </View>
              )}
            </View>
            <AnimatedPressable style={styles.addTodoBtn} onPress={() => setAddOpen(true)} haptic="medium">
              <Ionicons name="add" size={22} color="#fff" />
            </AnimatedPressable>
          </View>

          {openToday.slice(0, 5).map((t) => (
            <View key={t.id} style={styles.todoRow}>
              <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => toggleTodo(t)} size={20} />
              <AnimatedPressable style={{ flex: 1 }} onPress={() => setOpenTodoId(t.id)}>
                <Text style={styles.todoTitle} numberOfLines={1}>{t.title}</Text>
                {t.due_date < today && <DueChip date={t.due_date} compact />}
              </AnimatedPressable>
            </View>
          ))}
          {openToday.length > 5 && (
            <Text style={styles.more}>+{openToday.length - 5} more</Text>
          )}
          <AnimatedPressable onPress={() => navigation.navigate('Todos')} style={styles.linkRow} haptic="light">
            <Text style={styles.link}>Open my to-do list</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.brand[600]} />
          </AnimatedPressable>
        </Animated.View>

        {/* Week */}
        {insights?.week && (
          <Animated.View entering={FadeInDown.delay(120).duration(320)} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>This week</Text>
              <Text style={styles.cardSub}>{insights.week.reduce((s, d) => s + d.count, 0)} things done</Text>
            </View>
            <View style={styles.bars}>
              {insights.week.map((d, i) => (
                <Bar key={d.day} value={d.count} max={weekMax} index={i} isToday={d.day === insights.today} label={WEEKDAYS_SHORT[parseYmd(d.day).getDay()][0]} />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Work */}
        <Animated.View entering={FadeInDown.delay(180).duration(320)} style={styles.statsRow}>
          <Stat icon="person" label="My open tasks" value={summary?.mine_open ?? '–'} color="#246fe0" onPress={() => navigation.navigate('Tasks')} />
          <Stat icon="alarm" label="Overdue" value={summary?.overdue ?? '–'} color="#dc4c3e" onPress={() => navigation.navigate('Tasks')} />
          <Stat icon="arrow-redo" label="I assigned" value={summary?.delegated_open ?? '–'} color="#692ec2" onPress={() => navigation.navigate('Tasks')} />
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInDown.delay(240).duration(320)} style={styles.quickGrid}>
          <Quick icon="checkbox-outline" label="Add to-do" color="#dc4c3e" onPress={() => setAddOpen(true)} />
          <Quick icon="clipboard-outline" label="New task" color="#246fe0" onPress={() => navigation.navigate('Tasks', { create: true })} />
          <Quick icon="chatbubbles-outline" label={totalUnread ? `Chats · ${totalUnread}` : 'Chats'} color="#058527" onPress={() => navigation.navigate('ChatList')} />
          <Quick icon="git-network-outline" label="Organisation" color="#b45309" onPress={() => navigation.navigate('Organization')} />
        </Animated.View>

        {/* Businesses at a glance (leaders / managers) */}
        {businesses.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>{user?.is_leader ? 'Businesses at a glance' : 'Your businesses'}</Text>
            {businesses.map((b, i) => {
              const total = b.open_tasks + b.done_tasks;
              const rate = total ? Math.round((b.done_tasks / total) * 100) : 0;
              return (
                <Animated.View key={b.id} entering={FadeInDown.delay(300 + i * 60).duration(300)}>
                  <AnimatedPressable style={styles.bizCard} onPress={() => navigation.navigate('Tasks', { business_id: b.id })} haptic="light">
                    <View style={[styles.bizStripe, { backgroundColor: accent(b.color) }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.bizName} numberOfLines={1}>{b.name}</Text>
                        {b.overdue_tasks > 0 && (
                          <View style={styles.overduePill}>
                            <Ionicons name="alarm" size={11} color={colors.red[600]} />
                            <Text style={styles.overdueText}>{b.overdue_tasks}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.bizMeta}>
                        {b.heads.length ? `Head: ${b.heads.map((h) => h.name.split(' ')[0]).join(' & ')} · ` : ''}{b.open_tasks} open · {b.done_tasks} done
                      </Text>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${rate}%`, backgroundColor: accent(b.color) }]} />
                      </View>
                    </View>
                  </AnimatedPressable>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <QuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} defaults={{ due_date: today }} />
      <TodoDetailSheet todoId={openTodoId} onClose={() => setOpenTodoId(null)} />
    </View>
  );
}

function Bar({ value, max, index, isToday, label }) {
  const colors = useColors();
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(index * 60, withSpring(value / max, { damping: 14, stiffness: 120 }));
  }, [value, max, index, grow]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(4, grow.value * 100)}%` }));
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 10, color: colors.gray[400], marginBottom: 3 }}>{value || ''}</Text>
      <View style={{ height: 70, width: 16, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ width: 16, borderRadius: 6, backgroundColor: isToday ? '#058527' : tint('#058527', 0.35) }, style]} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: isToday ? '800' : '500', color: isToday ? colors.gray[900] : colors.gray[400], marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function Stat({ icon, label, value, color, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{
      flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
    }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], marginTop: spacing.sm }}>{value}</Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }} numberOfLines={1}>{label}</Text>
    </AnimatedPressable>
  );
}

function Quick({ icon, label, color, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} haptic="light" style={{
      width: '48%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
    }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[800] }} numberOfLines={1}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  content: { padding: spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, marginBottom: spacing.lg },
  greeting: { fontSize: fontSize.base, color: colors.gray[500], fontWeight: '500' },
  name: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  role: { fontSize: fontSize.sm, color: colors.brand[600], fontWeight: '600', marginTop: 2 },
  langBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  langText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[600] },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  pushCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.brand[600],
    marginBottom: spacing.md,
  },
  pushIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  pushTitle: { color: colors.white, fontWeight: '800', fontSize: fontSize.base },
  pushText: { color: colors.white, opacity: 0.9, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  pushBtn: { backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  pushBtnText: { color: colors.brand[600], fontWeight: '800', fontSize: fontSize.sm },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.amber[50] },
  infoText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 19 },
  approvalCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: tint('#692ec2', 0.08), borderColor: tint('#692ec2', 0.3) },
  approvalText: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: '#692ec2' },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  ringValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  cardSub: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  streak: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.amber[50], paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  streakText: { fontSize: 11, fontWeight: '800', color: colors.amber[700] },
  addTodoBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dc4c3e', alignItems: 'center', justifyContent: 'center' },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100] },
  todoTitle: { fontSize: fontSize.base, color: colors.gray[900] },
  more: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  link: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.sm },
  bizCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  bizStripe: { width: 4, borderRadius: 2 },
  bizName: { flex: 1, fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900] },
  bizMeta: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  overduePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.red[50], paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  overdueText: { fontSize: 11, fontWeight: '800', color: colors.red[600] },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.gray[100], marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
