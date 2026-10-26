import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { useEngage } from '../context/EngageContext';
import { useChat } from '../context/ChatContext';
import { useColors, useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import useAi from '../hooks/useAi';
import AtRiskCard from '../components/engage/AtRiskCard';
import DailyReportCard from '../components/engage/DailyReportCard';
import TeamBoard from '../components/engage/TeamBoard';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { IconButton, ProgressRing, TodoCheckbox, DueChip } from '../components/kit';
import useIsDesktop from '../hooks/useBreakpoint';
import { greeting, todayYmd, toYmd, WEEKDAYS, MONTHS_SHORT, WEEKDAYS_SHORT, parseYmd } from '../utils/dates';
import { pushEnvironment } from '../services/webPush';
import { showToast } from '../utils/events';
import { glass } from '../theme/glass';

/**
 * Home. The daily report and the team graph (completed and pending work, attendance) come first, then my own
 * day and the business work given to me. The to-do store feeds the personal panels; the team data is fetched.
 */
export default function HomeScreen() {
  const colors = useColors();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang } = useLang();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const { user, refreshUser } = useAuth();
  const { todos, businesses, insights, fetchTodos, fetchInsights, toggleTodo } = useTodos();
  const { unreadCount, approvalCount, pushState, enablePush, refreshCounts } = useNotifications();
  const { totalUnread } = useChat();
  const { myDay } = useEngage();
  const ai = useAi();

  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openTodoId, setOpenTodoId] = useState(null);
  const [reportKey, setReportKey] = useState(0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setReportKey((k) => k + 1);
    await Promise.all([fetchTodos(), fetchInsights(), refreshCounts(), refreshUser?.()]);
    setRefreshing(false);
  }, [fetchTodos, fetchInsights, refreshCounts, refreshUser]);

  const today = todayYmd();
  const meId = user?.id;
  const firstName = (user?.name || '').split(' ').find((p) => p.length > 1) || user?.name || '';
  const notPlaced = !user?.is_leader && !(user?.memberships || []).length;
  const d = new Date();

  // ---- my to-dos -----------------------------------------------------------
  const personal = useMemo(() => todos.filter((t) => !t.business_id), [todos]);
  const personalToday = useMemo(
    () => personal.filter((t) => t.due_date === today || (!t.due_date && t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today)),
    [personal, today]
  );
  const overduePersonal = personal.filter((t) => !t.is_done && t.due_date && t.due_date < today);
  const dueNow = [...overduePersonal, ...personalToday.filter((t) => !t.is_done)];
  const doneToday = personalToday.filter((t) => t.is_done).length;
  const totalToday = dueNow.length + doneToday;
  const percent = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  const weekMax = Math.max(1, ...(insights?.week || []).map((x) => x.count));

  // ---- business work given to me (the team graph covers everyone else) ----
  const assignedToMe = useMemo(
    () => todos
      .filter((t) => t.business_id && !t.is_done && t.assignee_id === meId && t.review_state === 'accepted')
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.priority - b.priority)
      .slice(0, 6),
    [todos, meId]
  );
  const tryEnablePush = async () => {
    const result = await enablePush();
    if (result === 'granted') showToast({ message: 'Notifications are on', tone: 'success' });
    else if (result === 'denied') showToast({ message: 'Notifications are blocked in your browser settings', tone: 'error' });
  };

  const personalPanel = (
    <View {...glass('card')} style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="person-outline" size={16} color={colors.brand[600]} />
          <Text style={styles.panelTitle}>Today</Text>
        </View>
        <AnimatedPressable style={styles.addBtn} onPress={() => setAddOpen(true)} accessibilityLabel="Add a to-do">
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.todayRow}>
        <ProgressRing percent={percent} size={64} stroke={6} color={colors.brand[600]}>
          <Text style={styles.ringValue}>{doneToday}/{totalToday}</Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Text style={styles.bigLine}>{doneToday} of {totalToday} done</Text>
          <Text style={styles.mutedLine}>
            {totalToday === 0 ? 'Nothing scheduled. Plan your day.'
              : dueNow.length === 0 ? 'Everything is done.'
                : `${dueNow.length} left${overduePersonal.length ? `, ${overduePersonal.length} overdue` : ''}`}
          </Text>
          {!!insights?.streak && <Text style={styles.streak}>{insights.streak}-day streak</Text>}
        </View>
      </View>

      {/* The full list lives in My day and the Inbox; Home only says how the day is going and where to go. */}
      <AnimatedPressable onPress={() => navigation.navigate('Progress', { tab: 'today' })} style={styles.linkRow}>
        <Text style={styles.link}>Plan my day</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.brand[600]} />
      </AnimatedPressable>
      <AnimatedPressable onPress={() => navigation.navigate('Todos')} style={styles.linkRow}>
        <Text style={styles.link}>Open my Inbox{personal.filter((t) => !t.is_done && !t.due_date && !t.list_id).length ? ` · ${personal.filter((t) => !t.is_done && !t.due_date && !t.list_id).length} waiting` : ''}</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.brand[600]} />
      </AnimatedPressable>
    </View>
  );

  // Business work assigned to me. The same tasks also sit in my To-do; the whole team is on the graph above.
  const assignedPanel = assignedToMe.length > 0 ? (
    <View {...glass('card')} style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="briefcase-outline" size={16} color={colors.brand[600]} />
          <Text style={styles.panelTitle}>Business work for you</Text>
        </View>
      </View>
      <View style={styles.list}>
        {assignedToMe.map((t) => (
          <View key={t.id} style={styles.row}>
            <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => toggleTodo(t)} size={20} />
            <AnimatedPressable style={{ flex: 1 }} onPress={() => setOpenTodoId(t.id)}>
              <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
              <View style={styles.rowMeta}>
                <Text style={styles.metaTag}>{t.business_name}</Text>
                {!!t.due_date && <DueChip date={t.due_date} compact />}
              </View>
            </AnimatedPressable>
          </View>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: desktop ? spacing.lg : insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, desktop && styles.contentDesktop, { paddingBottom: 110 + insets.bottom }]}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{WEEKDAYS[d.getDay()]}, {d.getDate()} {MONTHS_SHORT[d.getMonth()]}</Text>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
            {!!user?.display_title && (
              <Text style={styles.role} numberOfLines={1}>
                {user.display_title}
                {user.memberships?.length ? ` · ${user.memberships.map((m) => m.business_name).join(', ')}` : ''}
              </Text>
            )}
          </View>
          {!desktop && <IconButton icon={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} onPress={toggleTheme} />}
          {ai && <IconButton icon="sparkles-outline" onPress={() => navigation.navigate('Assistant')} />}
          {!desktop && <IconButton icon="notifications-outline" badge={unreadCount} onPress={() => navigation.navigate('Notifications')} />}
        </View>

        {(pushState === 'default' || pushState === 'needs-install') && (
          <View {...glass('accent')} style={styles.pushCard}>
            <View style={styles.pushIcon}><Ionicons name="notifications" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pushTitle}>Never miss a task</Text>
              <Text style={styles.pushText}>
                {pushState === 'needs-install'
                  ? `Add TaskHub to your Home Screen to get alerts: tap ${pushEnvironment.isIOS() ? 'Share, then Add to Home Screen' : 'the browser menu, then Install app'}, and open it from there.`
                  : 'Get alerts for new tasks, mentions, reminders and chats.'}
              </Text>
            </View>
            {pushState === 'default' && (
              <AnimatedPressable onPress={tryEnablePush} style={styles.pushBtn}>
                <Text style={styles.pushBtnText}>Turn on</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {notPlaced && (
          <View {...glass('card')} style={[styles.banner, { backgroundColor: colors.brand[50] }]}>
            <Ionicons name="hourglass-outline" size={20} color={colors.brand[700]} />
            <Text style={styles.bannerText}>You are not placed in a business yet. The Chairman or Chief of Staff will add you soon. Your personal to-dos and chat work as usual.</Text>
          </View>
        )}

        {approvalCount > 0 && (
          <AnimatedPressable onPress={() => navigation.navigate('Approvals')}>
            <View {...glass('card')} style={[styles.banner, styles.bannerLink]}>
              <Ionicons name="shield-checkmark" size={20} color={colors.brand[700]} />
              <Text style={[styles.bannerText, { fontWeight: '700' }]}>{approvalCount} item{approvalCount > 1 ? 's' : ''} waiting for your decision</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.brand[700]} />
            </View>
          </AnimatedPressable>
        )}

        <DailyReportCard refreshKey={reportKey} />
        <TeamBoard refreshKey={reportKey} />

        <AnimatedPressable onPress={() => navigation.navigate('Progress')}>
          <View {...glass('accent')} style={styles.dayCard}>
            <View style={styles.dayIcon}><Ionicons name="sunny" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayTitle}>My Day</Text>
              <Text style={styles.dayText}>
                {myDay?.all_clear ? 'Day complete. Everything due is done.'
                  : myDay?.waiting_on_you?.length ? `${myDay.waiting_on_you.length} waiting on you · ${myDay.remaining_today} left today`
                    : myDay ? `${myDay.remaining_today} left today` : 'What to do next, and who is waiting on you'}
              </Text>
            </View>
            {!!myDay?.streak && (
              <View style={styles.dayStreak}>
                <Ionicons name="flame" size={14} color="#fff" />
                <Text style={styles.dayStreakText}>{myDay.streak}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </View>
        </AnimatedPressable>

        <AtRiskCard onOpen={(id) => navigation.navigate('Main', { screen: 'Todos', params: { highlightId: id } })} />

        <View style={[styles.panels, desktop && styles.panelsDesktop]}>
          <View style={desktop ? styles.col : undefined}>{personalPanel}</View>
          {assignedPanel && <View style={desktop ? styles.col : undefined}>{assignedPanel}</View>}
        </View>

        {!desktop && (
          <View style={styles.quickGrid}>
            <Quick icon="checkbox-outline" label="Add to-do" onPress={() => setAddOpen(true)} />
            <Quick icon="chatbubbles-outline" label={totalUnread ? `Chats · ${totalUnread}` : 'Chats'} onPress={() => navigation.navigate('ChatList')} />
            {user?.can_monitor && <Quick icon="speedometer-outline" label="Team monitor" onPress={() => navigation.navigate('TeamMonitor')} />}
            <Quick icon="git-network-outline" label="Organisation" onPress={() => navigation.navigate('Organization')} />
          </View>
        )}
      </ScrollView>

      <QuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} defaults={{}} />
      <TodoDetailSheet todoId={openTodoId} onClose={() => setOpenTodoId(null)} />
    </View>
  );
}

function Quick({ icon, label, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
        backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand[100], alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.brand[700]} />
      </View>
      <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] }} numberOfLines={1}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg },
  contentDesktop: { paddingHorizontal: spacing.xxxl, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, marginBottom: spacing.xl },
  date: { fontSize: fontSize.sm, color: colors.gray[500], fontWeight: '600' },
  greeting: { fontSize: fontSize.md, color: colors.gray[500], fontWeight: '500', marginTop: 6 },
  name: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.7, marginTop: 0 },
  role: { fontSize: fontSize.sm, color: colors.brand[600], fontWeight: '600', marginTop: 4 },
  langBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  langText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[600] },
  pushCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.brand[600], marginBottom: spacing.md,
  },
  pushIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  pushTitle: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
  pushText: { color: '#fff', opacity: 0.92, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  pushBtn: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  pushBtnText: { color: colors.brand[600], fontWeight: '700', fontSize: fontSize.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md },
  bannerLink: { backgroundColor: colors.brand[50], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brand[200] },
  bannerText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[800], lineHeight: 19 },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.brand[600], marginBottom: spacing.md },
  dayIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  dayTitle: { color: '#fff', fontSize: fontSize.md, fontWeight: '800' },
  dayText: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm, marginTop: 2 },
  dayStreak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)' },
  dayStreakText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  panels: { gap: spacing.md },
  panelsDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  col: { flex: 1, minWidth: 0 },
  panel: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gray[900] },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: colors.brand[600] },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md },
  ringValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  bigLine: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] },
  mutedLine: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  streak: { fontSize: 12, fontWeight: '700', color: colors.brand[600], marginTop: 6 },
  list: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100] },
  rowTitle: { fontSize: fontSize.base, color: colors.gray[900], fontWeight: '500' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  metaTag: { fontSize: 11, color: colors.gray[500], fontWeight: '600' },
  moreText: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: 6 },
  empty: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  link: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  week: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallHead: { fontSize: 11, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: { height: 64, width: '100%', maxWidth: 22, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 5, backgroundColor: colors.brand[200] },
  barToday: { backgroundColor: colors.brand[600] },
  barLabel: { fontSize: 11, color: colors.gray[400], marginTop: 5 },
  barLabelToday: { color: colors.gray[900], fontWeight: '700' },
  biz: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100],
  },
  bizName: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  bizMeta: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, marginTop: spacing.lg },
});
