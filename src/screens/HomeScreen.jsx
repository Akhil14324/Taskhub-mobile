import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { useColors, useTheme } from '../context/ThemeContext';
import useAi from '../hooks/useAi';
import HomeDashboard from '../components/home/HomeDashboard';
import { useHomeStats } from '../components/home/HomeWidgets';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { IconButton } from '../components/kit';
import useIsDesktop from '../hooks/useBreakpoint';
import { greeting, WEEKDAYS, MONTHS_SHORT } from '../utils/dates';
import { pushEnvironment } from '../services/webPush';
import { showToast } from '../utils/events';
import { glass } from '../theme/glass';

/**
 * Home: the greeting and any banner, then the dashboard (components/home/HomeDashboard.jsx). The to-do store
 * feeds every panel; only the team panels fetch.
 */
export default function HomeScreen() {
  const colors = useColors();
  const { theme, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const { user, refreshUser } = useAuth();
  const { todos, fetchTodos, fetchInsights, toggleTodo } = useTodos();
  const { unreadCount, pushState, enablePush, refreshCounts } = useNotifications();
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

  const meId = user?.id;
  const firstName = (user?.name || '').split(' ').find((p) => p.length > 1) || user?.name || '';
  const notPlaced = !user?.is_leader && !(user?.memberships || []).length;
  const d = new Date();

  const tryEnablePush = async () => {
    const result = await enablePush();
    if (result === 'granted') showToast({ message: 'Notifications are on', tone: 'success' });
    else if (result === 'denied') showToast({ message: 'Notifications are blocked in your browser settings', tone: 'error' });
  };

  const stats = useHomeStats(todos, meId);
  const ctx = {
    stats, todos, reportKey, toggleTodo,
    go: (name, params) => navigation.navigate(name, params),
    openAdd: () => setAddOpen(true),
    openTodo: (id) => setOpenTodoId(id),
  };

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
          {desktop && (
            <AnimatedPressable style={styles.addBtn} onPress={() => setAddOpen(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add task</Text>
            </AnimatedPressable>
          )}
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


        <HomeDashboard ctx={ctx} user={user} />

      </ScrollView>

      <QuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} defaults={{}} />
      <TodoDetailSheet todoId={openTodoId} onClose={() => setOpenTodoId(null)} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg },
  contentDesktop: { paddingHorizontal: spacing.xl, maxWidth: 2200, width: '100%', alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  date: { fontSize: fontSize.sm, color: colors.gray[500], fontWeight: '600' },
  greeting: { fontSize: fontSize.base, color: colors.gray[500], fontWeight: '500', marginTop: 4 },
  name: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.gray[900], letterSpacing: -0.5, marginTop: 0 },
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.brand[600] },
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
