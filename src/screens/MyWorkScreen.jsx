import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import DraftReviewSheet from '../components/drafts/DraftReviewSheet';
import { TodoCheckbox, PRIORITY } from '../components/kit';
import { formatDue, formatDayHeader } from '../utils/dates';
import { progressOf } from '../utils/progress';
import { useFreshness } from '../utils/freshness';
import { paletteHex, paletteInk } from '../components/board/model';

// Stage colours of the to-do statuses, the same as a board's default status labels.
const STATUS = {
  todo: ['Not started', 'grey'], in_progress: ['Working on it', 'orange'], blocked: ['Stuck', 'red'],
  in_review: ['In review', 'blue'], on_hold: ['On hold', 'purple'], done: ['Done', 'green'],
};

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function Row({ todo, todos, meId, onOpen, onTick }) {
  const colors = useColors();
  const [label, color] = STATUS[todo.status] || STATUS.todo;
  const when = [todo.due_date, todo.deadline_date].filter(Boolean).sort()[0];
  const late = todo.overdue_days > 0 && !todo.is_done;
  const pri = PRIORITY[todo.priority] || PRIORITY[4];
  const progress = progressOf(todo, todos);
  const note = String(todo.notes || '').split('\n')[0].trim();
  const people = todo.assignee_id && todo.created_by !== todo.assignee_id
    ? (todo.assignee_id === meId ? `Assigned by ${todo.created_by_name}` : `Assigned to ${todo.assignee_name || 'someone'}`)
    : '';
  const meta = [todo.business_name || 'Personal', people].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onOpen(todo.id)}
      accessibilityLabel={todo.title}
      style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderColor: colors.gray[200], borderLeftWidth: 3, borderLeftColor: late ? colors.red[600] : todo.priority <= 2 ? pri.color : 'transparent', backgroundColor: hovered ? colors.gray[50] : 'transparent' })}
    >
      {todo.permissions?.can_change_status && <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => onTick(todo)} />}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: pri.color }}>{pri.short}</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: colors.gray[900], textDecorationLine: todo.is_done ? 'line-through' : 'none' }}>{todo.title}</Text>
        </View>
        {!!note && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[600] }}>{note}</Text>}
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>
          {meta}{progress ? ` · ${progress.done}/${progress.total} steps (${progress.pct}%)` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {!!when && (
          <Text style={{ fontSize: 13, fontWeight: late ? '700' : '400', color: late ? colors.red[600] : colors.gray[700] }}>
            {late ? `${plural(todo.overdue_days, 'day')} overdue` : `${formatDue(when)}${todo.due_time && when === todo.due_date ? ` ${todo.due_time}` : ''}`}
          </Text>
        )}
        <View style={{ backgroundColor: paletteHex(color), borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, color: paletteInk(color) }}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function Section({ title, icon, tone, items, empty, todos, meId, onOpen, onTick, groupByDay }) {
  const colors = useColors();
  if (!items.length && !empty) return null;
  const groups = groupByDay
    ? [...items.reduce((m, t) => { const d = [t.due_date, t.deadline_date].filter(Boolean).sort()[0]; if (!m.has(d)) m.set(d, []); m.get(d).push(t); return m; }, new Map())]
    : [[null, items]];
  return (
    <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: items.length ? 1 : 0, borderColor: colors.gray[200] }}>
        <Ionicons name={icon} size={17} color={tone} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>{items.length}</Text>
      </View>
      {groups.map(([day, rows]) => (
        <View key={day || 'all'}>
          {!!day && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500], paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 2 }}>{formatDayHeader(day)}</Text>}
          {rows.map((t) => <Row key={t.id} todo={t} todos={todos} meId={meId} onOpen={onOpen} onTick={onTick} />)}
        </View>
      ))}
      {!items.length && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>{empty}</Text>}
    </View>
  );
}

const FILTERS = [['all', 'All'], ['today', 'Today'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming'], ['progress', 'In progress'], ['done', 'Completed']];

function SummaryCard({ label, value, tone, active, onPress }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${label}: ${value}`} style={{ flexGrow: 1, flexBasis: 110, backgroundColor: active ? colors.brand[50] : colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: active ? colors.brand[200] : colors.gray[200], paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tone || colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.gray[600] }}>{label}</Text>
    </Pressable>
  );
}

/**
 * My work: the person's own command centre, built from their real to-dos (the ones they hold plus business
 * work given to them). Summary numbers, what to do next, and sections ordered by the server (overdue first, then
 * high priority, today, tomorrow, later): see services/myWork.js. Meeting drafts waiting for review sit on top.
 */
export default function MyWorkScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { subscribe } = useChat();
  const { user } = useAuth();
  const { todos, toggleTodo } = useTodos();
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [review, setReview] = useState(false);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const timer = useRef(null);

  const guard = useFreshness();
  const load = useCallback(async () => {
    try {
      await guard.fresh(() => api.get('/me/work', { __skipOops: true }), (res) => setData(res.data));
    } catch {
      setData((d) => d || { overdue: [], due_today: [], in_progress: [], waiting_on_me: [], upcoming: [], later: [], no_deadline: [], completed_today: [], tips: [], next: null, drafts: { count: 0 } });
    }
  }, [guard]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe('todo:changed', () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 400);
  }), [subscribe, load]);

  // A: review the drafts waiting (like the button), when nothing else has the keyboard.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || review || openId) return;
      if ((e.key === 'a' || e.key === 'A') && data?.drafts?.count) { e.preventDefault(); setReview(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, review, openId]);

  const open = useCallback((id) => { if (todos.some((t) => t.id === id)) setOpenId(id); }, [todos]);
  // The ticked item leaves its section and joins "Completed today" at once, so the numbers move with it;
  // the reload (held back until the tick is saved) confirms it.
  const tick = useCallback(async (t) => {
    setData((d) => {
      if (!d) return d;
      const next = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => x.id !== t.id) : v]));
      if (!t.is_done) next.completed_today = [{ ...t, is_done: true, status: 'done' }, ...(next.completed_today || [])];
      if (d.next?.todo?.id === t.id) next.next = null;
      return next;
    });
    try { await guard.edit(() => toggleTodo(t)); } finally { load(); }
  }, [toggleTodo, load, guard]);

  const needle = q.trim().toLowerCase();
  const pick = useCallback((list) => (list || []).filter((t) => !needle || String(t.title).toLowerCase().includes(needle)), [needle]);

  // The numbers come from the lists on screen, so a tick moves them at once.
  const counts = useMemo(() => {
    if (!data) return null;
    const openCount = data.overdue.length + data.due_today.length + data.upcoming.length + (data.later || []).length + (data.no_deadline || []).length;
    return { total: openCount + (data.completed_today || []).length, due_today: data.due_today.length, overdue: data.overdue.length, in_progress: (data.in_progress || []).length, done: (data.completed_today || []).length };
  }, [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    const shown = new Set([...data.overdue, ...data.due_today].map((t) => t.id));
    const all = filter === 'all';
    const out = [];
    if (all || filter === 'overdue') out.push({ key: 'overdue', title: 'Overdue', icon: 'alert-circle', tone: colors.red[600], items: pick(data.overdue), empty: filter === 'overdue' ? 'Nothing is overdue.' : '' });
    if (all || filter === 'today') out.push({ key: 'today', title: "Today's tasks", icon: 'today-outline', tone: colors.amber[600], items: pick(data.due_today), empty: 'Nothing due today.' });
    if (all || filter === 'progress') out.push({ key: 'progress', title: 'In progress', icon: 'play-circle-outline', tone: colors.blue[600], items: pick(all ? (data.in_progress || []).filter((t) => !shown.has(t.id)) : data.in_progress), empty: filter === 'progress' ? 'Nothing is in progress.' : '' });
    if (all || filter === 'upcoming') out.push({ key: 'upcoming', title: 'Next 7 days', icon: 'calendar-outline', tone: colors.brand[600], items: pick(data.upcoming), groupByDay: true, empty: filter === 'upcoming' ? 'Nothing coming up this week.' : '' });
    if (all || filter === 'upcoming') out.push({ key: 'later', title: 'Later', icon: 'time-outline', tone: colors.gray[600], items: pick(data.later), groupByDay: true, empty: '' });
    if (all) out.push({ key: 'nodate', title: 'No deadline', icon: 'help-circle-outline', tone: colors.gray[600], items: pick(data.no_deadline), empty: '' });
    if (all) out.push({ key: 'waiting', title: 'Waiting on you', icon: 'hand-left-outline', tone: colors.purple[600], items: pick(data.waiting_on_me), empty: '' });
    if (all || filter === 'done') out.push({ key: 'done', title: 'Completed today', icon: 'checkmark-done-outline', tone: colors.green[600], items: pick(data.completed_today), empty: filter === 'done' ? 'Nothing finished yet today.' : '' });
    return out;
  }, [data, filter, pick, colors]);

  const nothing = counts && counts.total === 0;
  const next = data?.next;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingVertical: spacing.md }}>
        <Text style={{ fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }}>My work</Text>
        {counts && <Text style={{ fontSize: 14, color: colors.gray[600] }}>{counts.overdue + counts.due_today ? `${plural(counts.overdue + counts.due_today, 'thing')} need you today` : 'Nothing needs you today'}</Text>}
      </View>
      {!data ? <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} /> : (
        <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: 140, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
          {data.drafts?.count > 0 && (
            <Pressable onPress={() => setReview(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brand[50], borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.brand[200] }}>
              <Ionicons name="mic" size={20} color={BRAND} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{data.drafts.count} task{data.drafts.count === 1 ? '' : 's'} from meetings wait for your OK</Text>
                <Text style={{ fontSize: 13, color: colors.gray[600] }}>
                  {(data.drafts.summary?.people || []).slice(0, 4).map((p) => `${p.name.split(' ')[0]} ${p.count}`).join(', ')}
                  {data.drafts.summary?.unsure ? ` · ${data.drafts.summary.unsure} need a person` : ''}
                </Text>
              </View>
              <Text style={{ color: BRAND, fontWeight: '600' }}>Review{desktop ? ' (A)' : ''}</Text>
            </Pressable>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <SummaryCard label="Total tasks" value={counts.total} active={filter === 'all'} onPress={() => setFilter('all')} />
            <SummaryCard label="Due today" value={counts.due_today} tone={colors.amber[600]} active={filter === 'today'} onPress={() => setFilter('today')} />
            <SummaryCard label="Overdue" value={counts.overdue} tone={counts.overdue ? colors.red[600] : undefined} active={filter === 'overdue'} onPress={() => setFilter('overdue')} />
            <SummaryCard label="In progress" value={counts.in_progress} tone={colors.blue[600]} active={filter === 'progress'} onPress={() => setFilter('progress')} />
            <SummaryCard label="Completed" value={counts.done} tone={colors.green[600]} active={filter === 'done'} onPress={() => setFilter('done')} />
          </View>

          {!!next && (
            <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 6, borderWidth: 1, borderColor: colors.brand[200] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flash-outline" size={17} color={BRAND} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND, flex: 1 }}>What should I do next?</Text>
                <Pressable onPress={() => navigation.navigate('Assistant')} accessibilityLabel="Ask the AI Assistant"><Text style={{ fontSize: 12, color: colors.gray[600] }}>Ask the assistant</Text></Pressable>
              </View>
              <Pressable onPress={() => open(next.todo.id)}>
                <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: '600', color: colors.gray[900] }}>{next.todo.title}</Text>
              </Pressable>
              <Text style={{ fontSize: 13, color: colors.gray[600] }}>{next.reason}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2 }}>
                <Pressable onPress={() => open(next.todo.id)} style={{ backgroundColor: BRAND, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7 }}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Open</Text></Pressable>
                {next.todo.permissions?.can_change_status && <Pressable onPress={() => tick(next.todo)} style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7 }}><Text style={{ color: colors.gray[800], fontWeight: '600', fontSize: 13 }}>Mark done</Text></Pressable>}
              </View>
            </View>
          )}
          {(data.tips || []).length > 0 && (
            <View style={{ gap: 2, paddingHorizontal: 2 }}>
              {data.tips.map((tip) => <Text key={tip} style={{ fontSize: 13, color: colors.gray[600] }}>{tip}</Text>)}
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
            {FILTERS.map(([k, label]) => (
              <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: filter === k ? colors.brand[600] : colors.gray[100] }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: filter === k ? '#fff' : colors.gray[700] }}>{label}</Text>
              </Pressable>
            ))}
            <View style={{ flexGrow: 1, flexBasis: 160, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.white }}>
              <Ionicons name="search" size={15} color={colors.gray[500]} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search by title" placeholderTextColor={colors.gray[400]} style={{ flex: 1, paddingVertical: 7, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
            </View>
          </View>

          {nothing && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.lg }}>Nothing is assigned to you yet. New work shows up here as it arrives.</Text>}
          {sections.map(({ key, ...sec }) => <Section key={key} {...sec} todos={todos} meId={user?.id} onOpen={open} onTick={tick} />)}
          {!nothing && !!needle && sections.every((s) => !s.items.length) && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.md }}>No task matches this search.</Text>}
        </ScrollView>
      )}
      <TodoDetailSheet todoId={openId} onClose={() => { setOpenId(null); load(); }} />
      <DraftReviewSheet open={review} onClose={() => { setReview(false); load(); }} onConfirmed={load} />
    </View>
  );
}
