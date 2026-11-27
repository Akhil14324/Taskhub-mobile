import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { spacing, radius, fontSize, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import Modal from '../components/Modal';
import { Avatar, Chip, PriorityFlag, PRIORITY } from '../components/kit';
import { AttachmentList } from '../components/todos/collab';
import { formatDue } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

const TABS = [
  ['pending', 'Pending Reviews', 'Nothing is waiting for your decision.'],
  ['submitted', 'Submitted for Review', 'You have nothing waiting with a reviewer.'],
  ['approved', 'Approved Reviews', 'No approved reviews yet.'],
  ['changes_requested', 'Changes Requested', 'Nothing needs correcting.'],
  ['rejected', 'Rejected Reviews', 'No rejected reviews.'],
  ['history', 'Review History', 'Reviews you send or receive are kept here.'],
];
const STATUS = {
  pending: ['Pending review', 'brand'],
  approved: ['Approved', 'green'],
  changes_requested: ['Changes requested', 'yellow'],
  rejected: ['Rejected', 'red'],
  withdrawn: ['Withdrawn', 'gray'],
};
const TASK_STATUS = { todo: 'Not started', in_progress: 'Working on it', blocked: 'Stuck', in_review: 'In review', on_hold: 'On hold', done: 'Done' };

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const errorText = (err, fallback) => err.response?.data?.error || fallback;

function StatusBadge({ status }) {
  const colors = useColors();
  const [label, tone] = STATUS[status] || STATUS.withdrawn;
  const scale = colors[tone] || colors.gray;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full, backgroundColor: scale[50], borderWidth: 1, borderColor: scale[100] }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: tone === 'gray' ? colors.gray[600] : scale[700] }}>{label}</Text>
    </View>
  );
}

function Priority({ value }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <PriorityFlag priority={value} size={13} />
      <Text style={{ fontSize: 13, color: colors.gray[700] }}>{PRIORITY[value]?.label || PRIORITY[4].label}</Text>
    </View>
  );
}

const COLS = [['Task', 2.6], ['Assigned to', 1.3], ['Reviewer', 1.3], ['Submitted', 1.5], ['Priority', 1], ['Status', 1.7]];

/** The list of one tab: a table on a wide screen, stacked rows on phones and tablets. */
function ReviewList({ rows, onOpen, empty }) {
  const colors = useColors();
  const desktop = useIsDesktop();
  const cell = { fontSize: 13, color: colors.gray[800] };
  return (
    <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
      {!rows.length && <Text style={{ padding: spacing.lg, color: colors.gray[500], fontSize: fontSize.base }}>{empty}</Text>}
      {desktop && !!rows.length && (
        <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
          {COLS.map(([label, flex]) => <Text key={label} style={{ flex, fontSize: 12, fontWeight: '700', color: colors.gray[500] }}>{label}</Text>)}
        </View>
      )}
      {rows.map((r, i) => (
        <Pressable
          key={r.id}
          onPress={() => onOpen(r.id)}
          accessibilityLabel={`Open the review of ${r.task_title}`}
          style={({ hovered }) => ({
            borderTopWidth: i ? 1 : 0, borderColor: colors.gray[200], backgroundColor: hovered ? colors.gray[50] : 'transparent',
            paddingHorizontal: spacing.lg, paddingVertical: 12,
            ...(desktop ? { flexDirection: 'row', alignItems: 'center', gap: spacing.md } : { gap: 5 }),
          })}
        >
          {desktop ? (
            <>
              <View style={{ flex: 2.6, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{r.task_title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{r.business_name || 'Personal'}{r.round > 1 ? ` · round ${r.round}` : ''}</Text>
              </View>
              <Text numberOfLines={1} style={[cell, { flex: 1.3 }]}>{r.assigned_to}</Text>
              <Text numberOfLines={1} style={[cell, { flex: 1.3 }]}>{r.reviewer_name}</Text>
              <Text style={[cell, { flex: 1.5 }]}>{when(r.submitted_at)}</Text>
              <View style={{ flex: 1 }}><Priority value={r.priority} /></View>
              <View style={{ flex: 1.7 }}><StatusBadge status={r.status} /></View>
            </>
          ) : (
            <>
              <Text numberOfLines={3} style={{ fontSize: 15, fontWeight: '600', color: colors.gray[900], wordBreak: 'break-word' }}>{r.task_title}</Text>
              <Text style={{ fontSize: 13, color: colors.gray[600] }}>Assigned to {r.assigned_to} · Reviewer {r.reviewer_name}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>Submitted {when(r.submitted_at)}{r.round > 1 ? ` · round ${r.round}` : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: 2 }}>
                <StatusBadge status={r.status} />
                <Priority value={r.priority} />
              </View>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function Heading({ children }) {
  const colors = useColors();
  return <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.lg, marginBottom: 6 }}>{children}</Text>;
}

function Button({ label, icon, onPress, tone = 'plain', disabled }) {
  const colors = useColors();
  const look = tone === 'solid' ? { bg: BRAND, fg: '#fff', line: BRAND }
    : tone === 'danger' ? { bg: colors.red[50], fg: colors.red[700], line: colors.red[100] }
      : { bg: colors.gray[100], fg: colors.gray[800], line: colors.gray[100] };
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: look.bg, borderWidth: 1, borderColor: look.line, opacity: disabled ? 0.5 : 1 }}
    >
      {!!icon && <Ionicons name={icon} size={16} color={look.fg} />}
      <Text style={{ fontSize: 14, fontWeight: '700', color: look.fg }}>{label}</Text>
    </AnimatedPressable>
  );
}

function Input(props) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.gray[400]}
      {...props}
      style={[{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50], paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' }, props.multiline && { minHeight: 76, textAlignVertical: 'top' }]}
    />
  );
}

/** One review: the complete task, its history, and the actions the person is allowed to take. */
function ReviewDetail({ reviewId, onClose, onChanged, onResubmit }) {
  const colors = useColors();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useRef(null);
  if (reviewId) shown.current = reviewId; // keeps the content while the window closes

  const load = useCallback(async (id) => {
    try {
      const res = await api.get(`/reviews/${id}`, { __skipOops: true });
      if (shown.current === id) { setData(res.data); setError(''); }
    } catch (err) {
      if (shown.current === id) setError(errorText(err, 'Could not open this review.'));
    }
  }, []);
  useEffect(() => {
    if (!reviewId) return;
    setData(null); setError(''); setNote(''); setProblem('');
    load(reviewId);
  }, [reviewId, load]);

  const decide = async (decision) => {
    const text = note.trim();
    if (decision !== 'approve' && !text) {
      setProblem(decision === 'reject' ? 'Write the reason for rejecting.' : 'Write what needs to be corrected.');
      return;
    }
    if (decision !== 'changes') {
      const ok = await confirmDialog(decision === 'approve'
        ? { title: 'Approve this task?', message: `"${data.task.title}" will be marked Done.`, confirmLabel: 'Approve' }
        : { title: 'Reject this task?', message: 'It goes back to its owner with your reason.', confirmLabel: 'Reject', destructive: true });
      if (!ok) return;
    }
    setBusy(true); setProblem('');
    try {
      const res = await api.post(`/reviews/${data.review.id}/${decision}`, { note: text }, { __skipOops: true });
      showToast({
        message: decision === 'approve' ? (res.data.rolled_to ? `Approved. Repeats on ${formatDue(res.data.rolled_to)}` : 'Approved. The task is Done.') : decision === 'changes' ? 'Sent back for changes' : 'Rejected',
        tone: 'success',
      });
      setNote('');
      await load(data.review.id);
      onChanged();
    } catch (err) {
      setProblem(errorText(err, 'Could not save your decision.'));
      load(data.review.id);
    } finally {
      setBusy(false);
    }
  };

  const review = data?.review;
  const task = data?.task;
  const fact = (label, value) => (
    <View key={label} style={{ minWidth: 130, flexGrow: 1, flexBasis: '30%' }}>
      <Text style={{ fontSize: 12, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.gray[900], fontWeight: '600' }}>{value || '–'}</Text>
    </View>
  );
  const body = { fontSize: fontSize.base, color: colors.gray[800], lineHeight: 20 };
  const quiet = { fontSize: fontSize.sm, color: colors.gray[500] };
  const files = data?.files || [];

  return (
    <Modal open={!!reviewId} onClose={onClose} title="Review" width={720}>
      <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.lg }}>
        {!data && !error && <ActivityIndicator color={BRAND} style={{ marginVertical: spacing.xl }} />}
        {!!error && <Text style={[body, { color: colors.red[600], paddingVertical: spacing.lg }]}>{error}</Text>}
        {!!data && (
          <>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray[900], marginTop: spacing.sm, wordBreak: 'break-word' }} selectable>{task.title}</Text>
            {!!task.parent_title && <Text style={quiet}>Sub-task of {task.parent_title}</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
              <StatusBadge status={review.status} />
              <Priority value={task.priority} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
              {fact('Assigned to', review.assigned_to)}
              {fact('Reviewer', review.reviewer_name)}
              {fact('Submitted', when(review.submitted_at))}
              {fact('Task status', TASK_STATUS[task.status] || task.status)}
              {fact('Due date', task.due_date ? formatDue(task.due_date) : '')}
              {fact('Business', task.business_name || 'Personal')}
              {fact('Created by', task.created_by_name)}
              {!!task.labels?.length && fact('Labels', task.labels.join(', '))}
            </View>

            <Heading>Description</Heading>
            <Text style={task.notes ? body : quiet} selectable>{task.notes || 'No description.'}</Text>

            {!!data.subtasks.length && (
              <>
                <Heading>Sub-tasks · {data.subtasks.filter((s) => s.is_done).length} of {data.subtasks.length} done</Heading>
                {data.subtasks.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 3 }}>
                    <Ionicons name={s.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={s.is_done ? colors.green[600] : colors.gray[400]} />
                    <Text style={[body, { flex: 1 }]}>{s.title}{s.assignee_name ? ` · ${s.assignee_name}` : ''}</Text>
                  </View>
                ))}
              </>
            )}

            {!!files.filter((f) => !f.comment_id).length && (
              <>
                <Heading>Files</Heading>
                <AttachmentList items={files.filter((f) => !f.comment_id)} />
              </>
            )}

            <Heading>Comments</Heading>
            {!data.comments.length && <Text style={quiet}>No comments on this task.</Text>}
            {data.comments.map((c) => (
              <View key={c.id} style={{ paddingVertical: 5 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }}>{c.author || 'Someone'} <Text style={{ fontWeight: '400', color: colors.gray[400] }}>{when(c.created_at)}</Text></Text>
                <Text style={body} selectable>{c.body}</Text>
                {!!files.filter((f) => f.comment_id === c.id).length && <AttachmentList items={files.filter((f) => f.comment_id === c.id)} />}
              </View>
            ))}

            <Heading>Review history</Heading>
            {data.rounds.map((r) => (
              <View key={r.id} style={{ borderLeftWidth: 2, borderColor: colors.brand[200], paddingLeft: spacing.md, paddingVertical: 4, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }}>Round {r.round}</Text>
                <Text style={body}>{r.submitter_name} sent it to {r.reviewer_name} · {when(r.submitted_at)}</Text>
                {!!r.submit_note && <Text style={[body, { color: colors.gray[600] }]} selectable>“{r.submit_note}”</Text>}
                <View style={{ marginTop: 5, gap: 3 }}>
                  <StatusBadge status={r.status} />
                  {!!r.decided_at && <Text style={quiet}>{r.status === 'withdrawn' ? '' : `${r.reviewer_name} · `}{when(r.decided_at)}</Text>}
                  {!!r.decision_note && <Text style={body} selectable>{r.decision_note}</Text>}
                </View>
              </View>
            ))}

            {review.can_decide && (
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                <Input value={note} onChangeText={(v) => { setNote(v); setProblem(''); }} multiline placeholder="Comment: needed to request changes or to reject" accessibilityLabel="Review comment" />
                {!!problem && <Text style={{ color: colors.red[600], fontSize: fontSize.sm }}>{problem}</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  <Button label="Approve" icon="checkmark-done" tone="solid" disabled={busy} onPress={() => decide('approve')} />
                  <Button label="Request Changes" icon="arrow-undo" disabled={busy} onPress={() => decide('changes')} />
                  <Button label="Reject" icon="close-circle-outline" tone="danger" disabled={busy} onPress={() => decide('reject')} />
                </View>
              </View>
            )}
            {!review.can_decide && !!problem && <Text style={{ color: colors.red[600], fontSize: fontSize.sm, marginTop: spacing.sm }}>{problem}</Text>}
            {review.can_resubmit && (
              <View style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}>
                <Button label="Resubmit for review" icon="send" tone="solid" onPress={() => onResubmit({ todoId: task.id, reviewerId: review.reviewer_id })} />
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

/** A searchable one-of-many list; once chosen it folds to the choice, with "Change". */
function Picker({ label, items, value, onChange, search, render, empty }) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const chosen = items?.find((x) => x.id === value);
  const found = (items || []).filter((x) => search(x).toLowerCase().includes(q.trim().toLowerCase()));
  const row = (x, onPress, right) => (
    <Pressable key={x.id} onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      {render(x)}
      {right}
    </Pressable>
  );
  return (
    <View>
      <Heading>{label}</Heading>
      {!items && <ActivityIndicator color={BRAND} />}
      {!!chosen && (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand[200], backgroundColor: colors.brand[50] }}>
          {row(chosen, () => onChange(null), <Text style={{ color: BRAND, fontWeight: '700', fontSize: fontSize.sm }}>Change</Text>)}
        </View>
      )}
      {!!items && !chosen && (
        <>
          {items.length > 5 && <Input value={q} onChangeText={setQ} placeholder="Search" accessibilityLabel={`Search ${label}`} />}
          <ScrollView style={{ maxHeight: 230, marginTop: 4 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {found.map((x) => row(x, () => { onChange(x.id); setQ(''); }))}
            {!found.length && <Text style={{ color: colors.gray[500], fontSize: fontSize.sm, padding: spacing.sm }}>{items.length ? 'Nothing matches.' : empty}</Text>}
          </ScrollView>
        </>
      )}
    </View>
  );
}

/** Send one of my tasks (again) to a chosen reviewer. `preset` = { todoId, reviewerId } when resubmitting. */
function SubmitReview({ preset, open, onClose, onSent }) {
  const colors = useColors();
  const [tasks, setTasks] = useState(null);
  const [people, setPeople] = useState(null);
  const [todoId, setTodoId] = useState(null);
  const [reviewerId, setReviewerId] = useState(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTasks(null); setPeople(null); setNote(''); setProblem('');
    setTodoId(preset?.todoId || null); setReviewerId(preset?.reviewerId || null);
    api.get('/reviews/tasks', { __skipOops: true }).then((r) => setTasks(r.data.tasks)).catch((err) => { setTasks([]); setProblem(errorText(err, 'Could not load your tasks.')); });
    api.get('/reviews/people', { __skipOops: true }).then((r) => setPeople(r.data.people)).catch((err) => { setPeople([]); setProblem(errorText(err, 'Could not load the people.')); });
  }, [open, preset]);

  const send = async () => {
    setBusy(true); setProblem('');
    try {
      await api.post('/reviews', { todo_id: todoId, reviewer_id: reviewerId, note: note.trim() }, { __skipOops: true });
      showToast({ message: 'Sent for review', tone: 'success' });
      onSent();
    } catch (err) {
      setProblem(errorText(err, 'Could not send it.'));
    } finally {
      setBusy(false);
    }
  };

  const title = { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] };
  const sub = { fontSize: fontSize.sm, color: colors.gray[500] };
  return (
    <Modal open={open} onClose={onClose} title={preset ? 'Resubmit for review' : 'Submit for review'} width={560}>
      <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.lg }}>
        <Picker
          label="Task you have finished" items={tasks} value={todoId} onChange={setTodoId} empty="You have no open tasks to send."
          search={(t) => `${t.title} ${t.business_name || ''}`}
          render={(t) => (
            <>
              <PriorityFlag priority={t.priority} size={13} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={title}>{t.title}</Text>
                <Text numberOfLines={1} style={sub}>
                  {t.business_name || 'Personal'}{t.due_date ? ` · due ${formatDue(t.due_date)}` : ''}{t.last_review && STATUS[t.last_review.status] ? ` · last: ${STATUS[t.last_review.status][0].toLowerCase()}` : ''}
                </Text>
              </View>
            </>
          )}
        />
        <Picker
          label="Reviewer" items={people} value={reviewerId} onChange={setReviewerId} empty="No other registered users."
          search={(p) => `${p.name} ${p.username}`}
          render={(p) => (
            <>
              <Avatar name={p.name} uri={p.profile_picture} size={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={title}>{p.name}</Text>
                <Text numberOfLines={1} style={sub}>@{p.username}</Text>
              </View>
            </>
          )}
        />
        <Heading>Note for the reviewer (optional)</Heading>
        <Input value={note} onChangeText={setNote} multiline placeholder="What did you finish or correct?" accessibilityLabel="Note for the reviewer" />
        {!!problem && <Text style={{ color: colors.red[600], fontSize: fontSize.sm, marginTop: spacing.sm }}>{problem}</Text>}
        <View style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}>
          <Button label={preset ? 'Resubmit' : 'Submit for review'} icon="send" tone="solid" disabled={busy || !todoId || !reviewerId} onPress={send} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Review & Approval: send a finished task to a chosen reviewer; the reviewer approves it (it becomes Done), asks for
 * changes or rejects it. The lists and every round come from /api/reviews.
 */
export default function ReviewScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { subscribe } = useChat();
  const { fetchTodos } = useTodos();
  const { unreadCount } = useNotifications();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);
  const [submit, setSubmit] = useState({ open: false, preset: null });
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/reviews', { __skipOops: true });
      setData(res.data); setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load the reviews.'));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // A new notification or a changed task may mean a review moved.
  const later = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 500); }, [load]);
  useEffect(() => subscribe('todo:changed', later), [subscribe, later]);
  useEffect(() => { later(); }, [unreadCount, later]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Opened from a notification: show that review.
  const wanted = route.params?.reviewId;
  useEffect(() => {
    if (!wanted) return;
    setOpenId(Number(wanted));
    navigation.setParams({ reviewId: undefined });
  }, [wanted, navigation]);

  const changed = useCallback(() => { load(); fetchTodos(); }, [load, fetchTodos]);
  const [, label, empty] = TABS.find(([k]) => k === tab);
  const subtitle = useMemo(() => {
    if (!data) return '';
    const n = data.counts.pending;
    return n ? `${n} task${n === 1 ? '' : 's'} waiting for your decision` : 'Nothing is waiting for your decision';
  }, [data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingVertical: spacing.md }}>
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          {desktop
            ? <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Review</Text>
            : <BackTitle title="Review" style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }} />}
          {!!subtitle && <Text style={{ fontSize: 14, color: colors.gray[600] }}>{subtitle}</Text>}
        </View>
        <Button label="Submit for review" icon="send" tone="solid" onPress={() => setSubmit({ open: true, preset: null })} />
      </View>
      <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: 140, width: '100%' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="tablist">
          {TABS.map(([key, name]) => (
            <Chip key={key} label={data ? `${name} (${data.counts[key]})` : name} active={tab === key} onPress={() => setTab(key)} />
          ))}
        </View>
        {!!error && (
          <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
            <Text style={{ color: colors.red[600] }}>{error}</Text>
            <Button label="Try again" icon="refresh" onPress={load} />
          </View>
        )}
        {!data && !error && <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} />}
        {!!data && (
          <View accessibilityLabel={label}>
            <ReviewList rows={data[tab]} onOpen={setOpenId} empty={empty} />
          </View>
        )}
      </ScrollView>
      <ReviewDetail
        reviewId={openId}
        onClose={() => setOpenId(null)}
        onChanged={changed}
        onResubmit={(preset) => { setOpenId(null); setTimeout(() => setSubmit({ open: true, preset }), 320); }}
      />
      <SubmitReview
        open={submit.open}
        preset={submit.preset}
        onClose={() => setSubmit((s) => ({ ...s, open: false }))}
        onSent={() => { setSubmit((s) => ({ ...s, open: false })); setTab('submitted'); changed(); }}
      />
    </View>
  );
}
