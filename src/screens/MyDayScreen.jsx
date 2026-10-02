import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useEngage } from '../context/EngageContext';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import BackTitle from '../components/BackTitle';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import KudosSheet from '../components/engage/KudosSheet';
import KudosCard from '../components/engage/KudosCard';
import { Avatar, DueChip, PRIORITY, ProgressRing, SectionHeader, TodoCheckbox } from '../components/kit';
import useIsDesktop from '../hooks/useBreakpoint';
import { greeting, daysFromToday, todayYmd, toYmd, WEEKDAYS, MONTHS_SHORT, WEEKDAYS_SHORT, parseYmd } from '../utils/dates';
import { formatSeconds } from '../utils/timeline';
import { showToast } from '../utils/events';

/** Why a task is being suggested, and how strongly. Higher score = do it sooner. */
function rank(t, today, waiting) {
  let score = 0;
  let why = 'Next on your list';
  if (t.status === 'blocked') return { score: -100, why };
  if (waiting.has(t.id)) { score += 50; why = 'Someone is waiting on this'; }
  if (t.deadline_date && t.deadline_date <= today) { score += 36; why = t.deadline_date < today ? 'Past its deadline' : 'Deadline is today'; }
  if (t.due_date && t.due_date < today) {
    score += 40 + Math.min(10, -daysFromToday(t.due_date));
    if (score < 60) why = 'Overdue';
  } else if (t.due_date === today) {
    score += 25;
    if (why === 'Next on your list') why = 'Due today';
  }
  score += (4 - (t.priority || 4)) * 6;
  if (t.priority === 1 && why === 'Next on your list') why = 'Top priority';
  if (t.status === 'in_progress') { score += 8; if (why === 'Next on your list') why = 'Already in progress'; }
  return { score, why };
}

/**
 * My Day: the one screen to open first. What to do next, who is waiting on you, what is late and due,
 * your streak and the thanks you have received. Everything is computed from the to-do store plus one
 * small `/engage/myday` call, so it opens instantly.
 */
export default function MyDayScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const { todos, fetchTodos, toggleTodo } = useTodos();
  const { myDay, refreshMyDay, setRest, loadKudos, kudosTick } = useEngage();
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [kudosOpen, setKudosOpen] = useState(false);
  const [received, setReceived] = useState([]);
  const [showDone, setShowDone] = useState(false);

  const today = todayYmd();
  const meId = user?.id;
  const firstName = (user?.name || '').split(' ').find((p) => p.length > 1) || user?.name || '';
  const d = new Date();

  const loadReceived = useCallback(async () => {
    try { setReceived((await loadKudos('received', 4)).kudos); } catch { /* keep */ }
  }, [loadKudos]);
  useEffect(() => { loadReceived(); }, [loadReceived, kudosTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchTodos(), refreshMyDay(), loadReceived()]);
    setRefreshing(false);
  }, [fetchTodos, refreshMyDay, loadReceived]);

  const waiting = useMemo(() => new Set((myDay?.waiting_on_you || []).map((w) => w.todo_id)), [myDay]);

  // Mine: personal to-dos, and business tasks accepted and assigned to me.
  const mine = useMemo(
    () => todos.filter((t) => t.review_state !== 'rejected' && (t.business_id ? (t.assignee_id === meId && t.review_state === 'accepted') : true)),
    [todos, meId]
  );
  const open = useMemo(() => mine.filter((t) => !t.is_done), [mine]);
  const overdue = useMemo(() => open.filter((t) => t.due_date && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date)), [open, today]);
  const dueToday = useMemo(() => open.filter((t) => t.due_date === today), [open, today]);
  const doneToday = useMemo(
    () => mine.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today),
    [mine, today]
  );
  const inProgress = useMemo(() => open.filter((t) => t.status === 'in_progress' && t.due_date !== today && !(t.due_date && t.due_date < today)), [open, today]);

  const next = useMemo(() => {
    const ranked = open
      .filter((t) => !open.some((o) => o.parent_id === t.id))
      .map((t) => ({ t, ...rank(t, today, waiting) }))
      .filter((r) => r.score > -50 && (r.t.due_date ? r.t.due_date <= today : r.score >= 14))
      .sort((a, b) => b.score - a.score);
    return ranked[0] || null;
  }, [open, today, waiting]);

  const remaining = overdue.length + dueToday.length;
  const total = remaining + doneToday.length;
  const percent = total ? Math.round((doneToday.length / total) * 100) : 0;
  const allClear = remaining === 0 && doneToday.length > 0;
  const streak = myDay?.streak || 0;

  const openBusinessTodo = (id) => setOpenId(id);

  const renderRow = (t, hint) => {
    return (
      <View key={t.id} style={styles.row}>
        <TodoCheckbox checked={t.is_done} priority={t.priority} onPress={() => toggleTodo(t)} size={22} />
        <AnimatedPressable style={{ flex: 1 }} onPress={() => setOpenId(t.id)}>
          <Text style={[styles.rowTitle, t.is_done && styles.rowDone]} numberOfLines={2}>{t.title}</Text>
          <View style={styles.rowMeta}>
            {!!t.business_name && <Text style={styles.tag}>{t.business_name}</Text>}
            {!!t.due_date && !t.is_done && <DueChip date={t.due_date} time={t.due_time} compact />}
            {waiting.has(t.id) && <View style={styles.waitPill}><Ionicons name="hourglass" size={10} color="#fff" /><Text style={styles.waitText}>Someone is waiting</Text></View>}
            {!!hint && <Text style={styles.tag}>{hint}</Text>}
          </View>
        </AnimatedPressable>
        {t.priority < 4 && PRIORITY[t.priority] && <Text style={[styles.prio, { color: PRIORITY[t.priority].color }]}>{PRIORITY[t.priority].short}</Text>}
      </View>
    );
  };

  const hero = (
    <View style={styles.hero}>
      <View style={{ flex: 1 }}>
        <Text style={styles.date}>{WEEKDAYS[d.getDay()]}, {d.getDate()} {MONTHS_SHORT[d.getMonth()]}</Text>
        <Text style={styles.greet}>{greeting()}, {firstName}</Text>
        <Text style={styles.heroLine}>
          {total === 0 ? 'Nothing is due today. A clear day to get ahead.'
            : allClear ? 'Day complete. Everything that was due is done.'
              : `${remaining} left today${overdue.length ? `, ${overdue.length} overdue` : ''}`}
        </Text>
      </View>
      <ProgressRing percent={allClear ? 100 : percent} size={76} stroke={7} color={colors.brand[600]}>
        <Text style={styles.ringValue}>{doneToday.length}/{total}</Text>
      </ProgressRing>
    </View>
  );

  const streakCard = (
    <View style={styles.card}>
      <View style={styles.streakTop}>
        <View style={styles.flame}><Ionicons name="flame" size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.streakNum}>{streak} day{streak === 1 ? '' : 's'}</Text>
          <Text style={styles.sub}>Current streak · best {myDay?.longest_streak || streak}</Text>
        </View>
        <AnimatedPressable
          style={[styles.restBtn, myDay?.resting_today && styles.restOn]}
          onPress={async () => {
            try { await setRest(!myDay?.resting_today); } catch (err) { showToast({ message: err.response?.data?.error || 'Could not change that', tone: 'error' }); }
          }}
        >
          <Ionicons name="moon" size={13} color={myDay?.resting_today ? '#fff' : colors.brand[700]} />
          <Text style={[styles.restText, myDay?.resting_today && { color: '#fff' }]}>{myDay?.resting_today ? 'Resting today' : 'Rest day'}</Text>
        </AnimatedPressable>
      </View>
      <View style={styles.weekRow}>
        {(myDay?.week || []).map((x) => {
          const rested = (myDay?.rests || []).includes(x.day);
          const isToday = x.day === myDay?.today;
          return (
            <View key={x.day} style={styles.dayCol}>
              <View style={[styles.dayDot, x.count > 0 && styles.dayDotOn, rested && x.count === 0 && styles.dayDotRest, isToday && styles.dayDotToday]}>
                {x.count > 0 ? <Ionicons name="checkmark" size={14} color="#fff" /> : rested ? <Ionicons name="moon" size={11} color={colors.gray[500]} /> : null}
              </View>
              <Text style={[styles.dayLabel, isToday && { color: colors.gray[900], fontWeight: '800' }]}>{WEEKDAYS_SHORT[parseYmd(x.day).getDay()][0]}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.sub}>Weekends and rest days never break your streak.</Text>
    </View>
  );

  const nextCard = next ? (
    <View style={styles.next}>
      <Text style={styles.nextKicker}>DO THIS NEXT</Text>
      <View style={styles.nextBody}>
        <TodoCheckbox checked={false} priority={next.t.priority} onPress={() => toggleTodo(next.t)} size={26} />
        <AnimatedPressable style={{ flex: 1 }} onPress={() => setOpenId(next.t.id)}>
          <Text style={styles.nextTitle} numberOfLines={3}>{next.t.title}</Text>
          <Text style={styles.nextWhy}>{next.why}{next.t.business_name ? ` · ${next.t.business_name}` : ''}</Text>
        </AnimatedPressable>
      </View>
    </View>
  ) : null;

  const waitingCard = (myDay?.waiting_on_you || []).length > 0 ? (
    <View style={styles.card}>
      <SectionHeader title="Waiting on you" count={myDay.waiting_on_you.length} style={{ paddingTop: 0 }} />
      <Text style={styles.sub}>Their work is held up until you act.</Text>
      {myDay.waiting_on_you.map((w) => (
        <AnimatedPressable key={w.blocker_id} style={styles.waitRow} onPress={() => openBusinessTodo(w.todo_id)}>
          <Avatar name={w.by_name || '?'} uri={w.by_picture} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{w.by_name || 'Someone'} is waiting</Text>
            <Text style={styles.sub} numberOfLines={1}>{w.title}{w.note ? ` · ${w.note}` : ''}</Text>
          </View>
          <Text style={styles.heldFor}>{formatSeconds(Math.max(60, (Date.now() - new Date(w.raised_at).getTime()) / 1000))}</Text>
        </AnimatedPressable>
      ))}
    </View>
  ) : null;

  const listCard = (title, items, opts = {}) => (items.length > 0 ? (
    <View style={styles.card}>
      <SectionHeader title={title} count={items.length} style={{ paddingTop: 0 }} color={opts.hot ? colors.brand[700] : undefined} />
      {items.map((t) => renderRow(t))}
    </View>
  ) : null);

  const allClearCard = allClear ? (
    <View style={[styles.card, styles.clear]}>
      <View style={styles.clearIcon}><Ionicons name="checkmark-done" size={26} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.clearTitle}>Day complete</Text>
        <Text style={styles.sub}>{doneToday.length} finished today{streak > 1 ? ` · ${streak}-day streak` : ''}. Thank someone who helped?</Text>
      </View>
      <AnimatedPressable style={styles.clearBtn} onPress={() => setKudosOpen(true)}>
        <Ionicons name="heart" size={14} color="#fff" />
        <Text style={styles.clearBtnText}>Kudos</Text>
      </AnimatedPressable>
    </View>
  ) : null;

  const kudosCard = (
    <View style={styles.card}>
      <SectionHeader
        title="Kudos for you"
        count={myDay?.kudos_this_week ? `${myDay.kudos_this_week} this week` : undefined}
        style={{ paddingTop: 0 }}
        right={(
          <AnimatedPressable style={styles.smallBtn} onPress={() => setKudosOpen(true)}>
            <Ionicons name="heart" size={13} color={colors.brand[700]} />
            <Text style={styles.smallBtnText}>Send kudos</Text>
          </AnimatedPressable>
        )}
      />
      {received.length === 0
        ? <Text style={styles.sub}>No kudos yet. Thank someone, and they will remember it.</Text>
        : received.map((k) => <View key={k.id} style={{ marginBottom: spacing.sm }}><KudosCard k={k} compact onPressTodo={setOpenId} /></View>)}
    </View>
  );

  const recapLink = (
    <AnimatedPressable style={styles.recapLink} onPress={() => navigation.navigate('Recap')}>
      <View style={styles.recapIcon}><Ionicons name="stats-chart" size={18} color={colors.brand[700]} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Your week in review</Text>
        <Text style={styles.sub}>Finished, on time, speed and how you compare with last week</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
    </AnimatedPressable>
  );

  const left = (
    <>
      {nextCard}
      {allClearCard}
      {waitingCard}
      {listCard('Overdue', overdue, { hot: true })}
      {listCard('Due today', dueToday)}
      {listCard('In progress', inProgress.slice(0, 5))}
      {total === 0 && inProgress.length === 0 && !waitingCard && (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: spacing.xl }]}>
          <Ionicons name="sunny-outline" size={32} color={colors.gray[300]} />
          <Text style={[styles.rowTitle, { marginTop: 8 }]}>Nothing is due today</Text>
          <AnimatedPressable style={[styles.smallBtn, { marginTop: 10 }]} onPress={() => setAddOpen(true)}>
            <Ionicons name="add" size={14} color={colors.brand[700]} />
            <Text style={styles.smallBtnText}>Add a to-do</Text>
          </AnimatedPressable>
        </View>
      )}
      {doneToday.length > 0 && (
        <View style={styles.card}>
          <AnimatedPressable onPress={() => setShowDone((v) => !v)} style={styles.doneHead}>
            <Text style={styles.rowTitle}>Done today · {doneToday.length}</Text>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray[400]} />
          </AnimatedPressable>
          {showDone && doneToday.map((t) => renderRow(t))}
        </View>
      )}
    </>
  );

  const right = (
    <>
      {streakCard}
      {kudosCard}
      {recapLink}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: desktop ? spacing.lg : insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, desktop && styles.contentDesktop, { paddingBottom: 110 + insets.bottom }]}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!desktop && <BackTitle title="My Day" style={styles.screenTitle} />}
        {hero}
        <View style={[styles.cols, desktop && styles.colsDesktop]}>
          <View style={desktop ? { flex: 3, minWidth: 0 } : undefined}>{left}</View>
          <View style={desktop ? { flex: 2, minWidth: 0 } : undefined}>{right}</View>
        </View>
      </ScrollView>

      <AnimatedPressable style={[styles.fab, { bottom: 24 + (desktop ? 0 : insets.bottom) }]} onPress={() => setAddOpen(true)} haptic="medium" accessibilityLabel="Add a to-do">
        <Ionicons name="add" size={26} color="#fff" />
      </AnimatedPressable>
      <QuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} defaults={{ due_date: today }} />
      <TodoDetailSheet todoId={openId} onClose={() => setOpenId(null)} />
      <KudosSheet visible={kudosOpen} onClose={() => { setKudosOpen(false); loadReceived(); }} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  content: { padding: spacing.lg, gap: spacing.md },
  contentDesktop: { paddingHorizontal: spacing.xxxl, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  screenTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xl, borderRadius: radius.xl,
    backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  date: { fontSize: fontSize.sm, color: colors.gray[500], fontWeight: '600' },
  greet: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5, marginTop: 2 },
  heroLine: { fontSize: fontSize.base, color: colors.gray[600], marginTop: 6 },
  ringValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  cols: { gap: spacing.md },
  colsDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  card: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  sub: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2, lineHeight: 16 },
  next: { backgroundColor: colors.brand[600], borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  nextKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.8)' },
  nextBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  nextTitle: { fontSize: fontSize.lg, fontWeight: '800', color: '#fff', lineHeight: 24 },
  nextWhy: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.88)', marginTop: 4, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100] },
  rowTitle: { fontSize: fontSize.base, color: colors.gray[900], fontWeight: '600' },
  rowDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  rowMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: 3 },
  tag: { fontSize: 11, color: colors.gray[500], fontWeight: '600' },
  prio: { fontSize: 11, fontWeight: '800' },
  waitPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brand[600], paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  waitText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[100], marginTop: 4 },
  heldFor: { fontSize: fontSize.xs, fontWeight: '800', color: colors.brand[700] },
  doneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flame: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  streakNum: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  restBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.brand[50] },
  restOn: { backgroundColor: colors.gray[600] },
  restText: { fontSize: 12, fontWeight: '700', color: colors.brand[700] },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.lg },
  dayCol: { alignItems: 'center', gap: 5, flex: 1 },
  dayDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  dayDotOn: { backgroundColor: colors.brand[600] },
  dayDotRest: { backgroundColor: colors.gray[200] },
  dayDotToday: { borderWidth: 2, borderColor: colors.brand[400] },
  dayLabel: { fontSize: 11, color: colors.gray[400], fontWeight: '600' },
  clear: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.brand[50], borderColor: colors.brand[200] },
  clearIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  clearTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.brand[600] },
  clearBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.brand[50] },
  smallBtnText: { fontSize: 12, fontWeight: '700', color: colors.brand[700] },
  recapLink: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  recapIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand[100], alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', right: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand[600],
    alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand[600], shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
});
