import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import DraftReviewSheet from '../components/drafts/DraftReviewSheet';
import { TodoCheckbox } from '../components/kit';
import { formatDue } from '../utils/dates';
import { paletteHex, paletteInk } from '../components/board/model';

// Stage colours of the to-do statuses, the same as a board's default status labels.
const STATUS = {
  todo: ['Not started', 'grey'], in_progress: ['Working on it', 'orange'], blocked: ['Stuck', 'red'],
  in_review: ['In review', 'blue'], on_hold: ['On hold', 'purple'], done: ['Done', 'green'],
};

function Row({ todo, onOpen, onTick }) {
  const colors = useColors();
  const [label, color] = STATUS[todo.status] || STATUS.todo;
  const when = [todo.due_date, todo.deadline_date].filter(Boolean).sort()[0];
  return (
    <Pressable
      onPress={() => onOpen(todo.id)}
      accessibilityLabel={todo.title}
      style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: hovered ? colors.gray[50] : 'transparent' })}
    >
      {todo.permissions?.can_change_status && <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => onTick(todo)} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, color: colors.gray[900] }}>{todo.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>
          {todo.business_name || 'Personal'}{todo.created_by_name && todo.assignee_id && todo.created_by !== todo.assignee_id ? ` · from ${todo.created_by_name}` : ''}
        </Text>
      </View>
      {!!when && <Text style={{ fontSize: 13, color: colors.gray[700] }}>{formatDue(when)}</Text>}
      <View style={{ backgroundColor: paletteHex(color), borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, minWidth: 92, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: paletteInk(color) }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function Section({ title, icon, tone, items, empty, onOpen, onTick }) {
  const colors = useColors();
  if (!items.length && !empty) return null;
  return (
    <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: items.length ? 1 : 0, borderColor: colors.gray[200] }}>
        <Ionicons name={icon} size={17} color={tone} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>{items.length}</Text>
      </View>
      {items.map((t) => <Row key={t.id} todo={t} onOpen={onOpen} onTick={onTick} />)}
      {!items.length && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>{empty}</Text>}
    </View>
  );
}

/**
 * My work (F-WM-00, F-WM-01): everything that is mine for today, across every company: overdue first, then
 * due today, what is waiting on me, and the next 7 days. Meeting drafts waiting for review sit on top.
 */
export default function MyWorkScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { subscribe } = useChat();
  const { todos, toggleTodo } = useTodos();
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [review, setReview] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/me/work', { __skipOops: true });
      setData(res.data);
    } catch {
      setData((d) => d || { overdue: [], due_today: [], waiting_on_me: [], upcoming: [], drafts: { count: 0 } });
    }
  }, []);

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
  const tick = useCallback(async (t) => { await toggleTodo(t); load(); }, [toggleTodo, load]);
  const total = useMemo(() => (data ? data.overdue.length + data.due_today.length + data.waiting_on_me.length : 0), [data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingVertical: spacing.md }}>
        <Text style={{ fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }}>My work</Text>
        {data && <Text style={{ fontSize: 14, color: colors.gray[600] }}>{total ? `${total} thing${total === 1 ? '' : 's'} need you today` : 'Nothing needs you today'}</Text>}
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
          <Section title="Overdue" icon="alert-circle" tone={colors.red[600]} items={data.overdue} onOpen={open} onTick={tick} />
          <Section title="Due today" icon="today-outline" tone={colors.amber[600]} items={data.due_today} empty="Nothing due today." onOpen={open} onTick={tick} />
          <Section title="Waiting on you" icon="hand-left-outline" tone={colors.purple[600]} items={data.waiting_on_me} onOpen={open} onTick={tick} />
          <Section title="Next 7 days" icon="calendar-outline" tone={colors.brand[600]} items={data.upcoming} onOpen={open} onTick={tick} />
        </ScrollView>
      )}
      <TodoDetailSheet todoId={openId} onClose={() => { setOpenId(null); load(); }} />
      <DraftReviewSheet open={review} onClose={() => { setReview(false); load(); }} onConfirmed={load} />
    </View>
  );
}
