import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/BottomSheet';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, EmptyHero, DueChip } from '../components/kit';
import { TimelineEntries } from '../components/todos/TimeHealth';
import { STATUS } from '../utils/timeline';
import { timeAgo } from '../utils/dates';

/** Read-only look at one to-do: what it says, who is on it, the sub-tasks, every comment and the history. */
function TodoLook({ todoId, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  useEffect(() => {
    if (!todoId) return;
    setDetail(null);
    api.get(`/todos/${todoId}`, { __skipOops: true }).then((r) => setDetail(r.data)).catch(() => {});
    api.get(`/todos/${todoId}/comments`, { __skipOops: true }).then((r) => setComments(r.data.comments || [])).catch(() => setComments([]));
    api.get(`/todos/${todoId}/timeline`, { __skipOops: true }).then((r) => setTimeline(r.data.entries || [])).catch(() => setTimeline([]));
  }, [todoId]);
  const t = detail?.todo;
  return (
    <BottomSheet visible={!!todoId} onClose={onClose} maxHeight={760}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xl }}>
        {!t ? <SkeletonList count={3} type="notification" /> : (
          <>
            <Text style={styles.todoTitle}>{t.title}</Text>
            <View style={styles.tagRow}>
              {!!t.business_name && <Chip small icon="briefcase-outline" label={t.business_name} />}
              <Chip small icon={t.is_done ? 'checkmark-circle' : STATUS[t.status]?.icon} label={t.is_done ? 'Done' : STATUS[t.status]?.label || t.status} />
              {!!t.due_date && <DueChip date={t.due_date} time={t.due_time} done={t.is_done} />}
            </View>
            {!!t.notes && <Text style={styles.notes}>{t.notes}</Text>}
            <Text style={styles.label}>People</Text>
            {(t.members || []).map((m) => (
              <View key={m.id} style={styles.person}>
                <Avatar name={m.name} uri={m.profile_picture} size={26} />
                <Text style={styles.personName}>{m.name}{m.id === t.created_by ? ' (made it)' : ''}{m.id === t.assignee_id ? ' · assigned' : ''}</Text>
              </View>
            ))}
            {(detail.subtasks || []).length > 0 && (
              <>
                <Text style={styles.label}>Sub-tasks</Text>
                {detail.subtasks.map((s) => (
                  <View key={s.id} style={styles.person}>
                    <Ionicons name={s.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={s.is_done ? colors.brand[600] : colors.gray[400]} />
                    <Text style={[styles.personName, s.is_done && { textDecorationLine: 'line-through', color: colors.gray[400] }]}>{s.title}</Text>
                  </View>
                ))}
              </>
            )}
            <Text style={styles.label}>Comments · {comments.length}</Text>
            {comments.length === 0 && <Text style={styles.empty}>No comments.</Text>}
            {comments.map((c) => (
              <View key={c.id} style={styles.comment}>
                <Text style={styles.commentHead}>{c.user_name || 'Someone'} · {timeAgo(c.created_at)}</Text>
                <Text style={styles.commentBody}>{c.body}</Text>
              </View>
            ))}
            <Text style={styles.label}>History</Text>
            <TimelineEntries entries={timeline} limit={30} />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function ChatLook({ chat, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const load = useCallback(async (before) => {
    setLoading(true);
    try {
      const res = await api.get(`/access/chats/${chat.id}/messages`, { params: { before, limit: 60 }, __skipOops: true });
      setMessages((prev) => (before ? [...res.data.messages, ...prev] : res.data.messages));
      setMore(res.data.has_more);
    } finally {
      setLoading(false);
    }
  }, [chat?.id]);
  useEffect(() => { if (chat) { setMessages([]); load(null); } }, [chat, load]);
  if (!chat) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const title = chat.name || (chat.participants || []).map((p) => p.name).join(' and ');
  return (
    <BottomSheet visible onClose={onClose} maxHeight={760}>
      <Text style={styles.todoTitle}>{title}</Text>
      <Text style={styles.empty}>Read only. {(chat.participants || []).map((p) => p.name).join(', ')}</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {more && (
          <AnimatedPressable onPress={() => load(messages[0]?.id)} style={{ alignItems: 'center', paddingVertical: spacing.sm }} disabled={loading}>
            <Text style={styles.link}>{loading ? 'Loading' : 'Load older'}</Text>
          </AnimatedPressable>
        )}
        {messages.map((m) => (
          <View key={m.id} style={styles.comment}>
            <Text style={styles.commentHead}>{m.sender_name} · {new Date(m.created_at).toLocaleString()}{m.deleted_at ? ' · deleted' : ''}</Text>
            {!!m.body && <Text style={[styles.commentBody, m.deleted_at && { color: colors.gray[400] }]}>{m.body}</Text>}
            {m.meta?.kind === 'todos' && <Text style={styles.empty}>Shared {m.meta.items?.length || 0} to-do(s): {(m.meta.items || []).map((i) => i.title).join(', ')}</Text>}
            {!!m.attachment_url && <Text style={styles.link}>Attachment ({m.attachment_type || 'file'})</Text>}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** Everything in the company: every person's to-dos and every chat. Only for people who hold those switches. */
export default function EverythingScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canTodos = !!user?.permissions?.view_all_todos;
  const canChats = !!user?.permissions?.chat_audit;
  const [tab, setTab] = useState(canTodos ? 'todos' : 'chats');
  const [people, setPeople] = useState(null);
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState(null);
  const [personTodos, setPersonTodos] = useState(null);
  const [lookTodo, setLookTodo] = useState(null);
  const [lookChat, setLookChat] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (canTodos) setPeople((await api.get('/access/everyone', { __skipOops: true })).data.people);
      if (canChats) setChats((await api.get('/access/chats', { __skipOops: true })).data.conversations);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load');
    }
  }, [canTodos, canChats]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPerson = async (p) => {
    setPerson(p);
    setPersonTodos(null);
    try {
      setPersonTodos((await api.get(`/access/everyone/${p.id}/todos`, { __skipOops: true })).data.todos);
    } catch {
      setPersonTodos([]);
    }
  };

  const q = query.trim().toLowerCase();
  const shownPeople = (people || []).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q));
  const shownChats = (chats || []).filter((c) => {
    const names = (c.participants || []).map((p) => p.name).join(' ').toLowerCase();
    return !q || (c.name || '').toLowerCase().includes(q) || names.includes(q);
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title={person ? person.name : 'Everything'} style={styles.title} />
        <Text style={styles.subtitle}>{person ? 'Read only. Everything they are on' : 'Every person\'s to-dos and every chat, read only'}</Text>
      </View>
      {person && (
        <AnimatedPressable style={styles.backRow} onPress={() => { setPerson(null); setPersonTodos(null); }}>
          <Ionicons name="arrow-back" size={16} color={colors.brand[600]} />
          <Text style={styles.link}>All people</Text>
        </AnimatedPressable>
      )}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        keyboardShouldPersistTaps="handled"
      >
        {!person && canTodos && canChats && (
          <View style={styles.tabs}>
            <Chip icon="checkbox-outline" label="To-dos" active={tab === 'todos'} onPress={() => setTab('todos')} />
            <Chip icon="chatbubbles-outline" label="Chats" active={tab === 'chats'} onPress={() => setTab('chats')} />
          </View>
        )}
        {!person && (
          <View {...glass('card')} style={styles.search}>
            <Ionicons name="search" size={16} color={colors.gray[400]} />
            <TextInput value={query} onChangeText={setQuery} placeholder={tab === 'todos' ? 'Search people' : 'Search chats'} placeholderTextColor={colors.gray[400]} style={styles.searchInput} />
          </View>
        )}
        {!!error && <EmptyHero icon="lock-closed" title="Not available" message={error} />}
        {!error && !people && !chats && <SkeletonList count={5} type="notification" />}

        {!person && tab === 'todos' && shownPeople.map((p) => (
          <AnimatedPressable key={p.id} {...glass('card')} style={styles.row} onPress={() => openPerson(p)}>
            <Avatar name={p.name} uri={p.profile_picture} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.meta}>{p.open} open · {p.done} done</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        ))}

        {!person && tab === 'chats' && shownChats.map((c) => (
          <AnimatedPressable key={c.id} {...glass('card')} style={styles.row} onPress={() => setLookChat(c)}>
            <View style={styles.chatIcon}><Ionicons name={c.type === 'group' ? 'people' : 'person'} size={18} color={colors.brand[700]} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{c.name || (c.participants || []).map((p) => p.name).join(' and ')}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {c.last_body ? `${c.last_sender}: ${c.last_body}` : c.last_meta ? `${c.last_sender} shared to-dos` : 'No messages'} · {c.message_count}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        ))}

        {!!person && !personTodos && <SkeletonList count={4} type="notification" />}
        {!!person && personTodos && personTodos.length === 0 && <EmptyHero icon="checkbox-outline" title="Nothing here" message="They are not on any to-do right now." />}
        {!!person && (personTodos || []).filter((t) => !t.parent_id).map((t) => (
          <AnimatedPressable key={t.id} {...glass('card')} style={styles.row} onPress={() => setLookTodo(t.id)}>
            <Ionicons name={t.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={t.is_done ? colors.brand[600] : colors.gray[400]} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.name, t.is_done && { textDecorationLine: 'line-through', color: colors.gray[400] }]} numberOfLines={2}>{t.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                {!!t.business_name && <Text style={styles.meta}>{t.business_name}</Text>}
                {!!t.due_date && <DueChip date={t.due_date} time={t.due_time} done={t.is_done} compact />}
                {t.comment_count > 0 && <Text style={styles.meta}>{t.comment_count} comments</Text>}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        ))}
      </ScrollView>
      <TodoLook todoId={lookTodo} onClose={() => setLookTodo(null)} />
      <ChatLook chat={lookChat} onClose={() => setLookChat(null)} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.white },
  chatIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[100] },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  meta: { fontSize: 12, color: colors.gray[500] },
  link: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  todoTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], paddingHorizontal: spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  notes: { fontSize: fontSize.base, color: colors.gray[700], paddingHorizontal: spacing.sm, marginTop: spacing.md, lineHeight: 21 },
  label: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: spacing.sm, marginTop: spacing.lg, marginBottom: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  personName: { fontSize: fontSize.base, color: colors.gray[900], flex: 1 },
  empty: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, paddingVertical: 4 },
  comment: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  commentHead: { fontSize: 12, fontWeight: '700', color: colors.gray[600] },
  commentBody: { fontSize: fontSize.base, color: colors.gray[900], marginTop: 2, lineHeight: 20 },
});
