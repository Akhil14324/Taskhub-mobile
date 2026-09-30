import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/BottomSheet';
import MentionSuggestions from '../components/MentionSuggestions';
import TaskFormSheet from '../components/tasks/TaskFormSheet';
import { Avatar, DueChip, PRIORITY, IconButton, accent, tint } from '../components/kit';
import useDirectory, { filterPeople } from '../hooks/useDirectory';
import useKeyboardInset from '../hooks/useKeyboardInset';
import { activeMentionQuery, completeMention } from '../utils/quickAdd';
import { statusMeta, describeActivity } from '../utils/taskMeta';
import { timeAgo } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

export default function TaskDetailScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { subscribe } = useChat();
  const { people } = useDirectory();
  const taskId = Number(route.params?.taskId);

  const [task, setTask] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [prompt, setPrompt] = useState(null); // { kind: 'reject' | 'warn' | 'request-delete', text }
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/tasks/${taskId}`, { __skipOops: true });
      setTask(res.data.task);
      setActivity(res.data.activity || []);
      setError('');
    } catch (err) {
      setError(err.response?.status === 404 ? 'This task was deleted.' : err.response?.data?.error || 'Could not load the task');
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe('task:changed', (evt) => {
    if (Number(evt.taskId) === taskId) load();
  }), [subscribe, taskId, load]);

  const run = async (key, fn, successMessage) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res?.data?.task) setTask(res.data.task);
      if (successMessage) showToast({ message: successMessage(res?.data?.task), tone: 'success' });
      await load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Something went wrong', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status) => run(status, () => api.put(`/tasks/${taskId}/status`, { status }), (t) => (
    t?.status === 'in_review' ? 'Sent for review ✅'
      : t?.status === 'completed' ? 'Task completed 🎉'
        : t?.status === 'in_progress' ? 'Started — good luck!'
          : t?.status === 'on_hold' ? 'Put on hold' : 'Updated'
  ));

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete this task?',
      message: task.title,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      showToast({ message: 'Task deleted', icon: 'trash' });
      navigation.goBack();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete', tone: 'error' });
    }
  };

  const submitPrompt = async () => {
    const text = prompt?.text?.trim() || '';
    const kind = prompt?.kind;
    if (kind === 'warn' && !text) {
      showToast({ message: 'Write the warning message', tone: 'error' });
      return;
    }
    setPrompt(null);
    if (kind === 'reject') await run('reject', () => api.post(`/tasks/${taskId}/reject`, { note: text }), () => 'Sent back with your note');
    if (kind === 'warn') await run('warn', () => api.put(`/tasks/${taskId}/warn`, { message: text }), () => 'Warning sent');
    if (kind === 'request-delete') await run('request-delete', () => api.post(`/tasks/${taskId}/request-delete`, { reason: text }), () => 'Request sent up the chain');
  };

  const sendComment = async () => {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/tasks/${taskId}/comments`, { body });
      setActivity((prev) => [...prev, res.data.activity]);
      setComment('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not post the comment', tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const mentionQuery = activeMentionQuery(comment);
  const suggestions = mentionQuery !== null ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 5 }) : [];

  if (!task) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.center}>
          {error ? <Text style={styles.errorText}>{error}</Text> : <ActivityIndicator color={colors.brand[600]} />}
        </View>
      </View>
    );
  }

  const status = statusMeta(task.status);
  const p = task.permissions || {};
  const isAssignee = task.assigned_user_id === user?.id;
  const done = task.status === 'completed';

  const actions = [];
  if (p.can_approve) {
    actions.push({ key: 'approve', label: 'Approve', icon: 'checkmark-done', color: '#058527', solid: true, onPress: () => run('approve', () => api.post(`/tasks/${taskId}/approve`), () => 'Approved 👍') });
    actions.push({ key: 'reject', label: 'Request changes', icon: 'arrow-undo', color: '#eb8909', onPress: () => setPrompt({ kind: 'reject', text: '' }) });
  }
  if (p.can_change_status && !done && task.status !== 'in_review') {
    if (task.status === 'pending') actions.push({ key: 'in_progress', label: 'Start', icon: 'play', color: '#246fe0', onPress: () => setStatus('in_progress') });
    actions.push({
      key: 'completed',
      label: task.requires_approval && !p.can_edit ? 'Done — send for review' : 'Mark done',
      icon: 'checkmark-circle',
      color: '#058527',
      solid: !p.can_approve,
      onPress: () => setStatus('completed'),
    });
  }
  if ((p.can_change_status || p.can_edit) && (done || task.status === 'in_review')) {
    actions.push({ key: 'pending', label: 'Reopen', icon: 'refresh', color: colors.gray[600], onPress: () => setStatus('pending') });
  }
  if (p.can_hold && !done && task.status !== 'in_review') {
    actions.push(task.status === 'on_hold'
      ? { key: 'resume', label: 'Resume', icon: 'play-circle', color: '#246fe0', onPress: () => setStatus('pending') }
      : { key: 'on_hold', label: 'Hold', icon: 'pause-circle', color: '#eb8909', onPress: () => setStatus('on_hold') });
  }
  if (p.can_warn) actions.push({ key: 'warn', label: 'Warn', icon: 'warning', color: colors.red[600], onPress: () => setPrompt({ kind: 'warn', text: '' }) });
  if (p.can_edit) actions.push({ key: 'edit', label: 'Edit', icon: 'create', color: colors.brand[600], onPress: () => setEditOpen(true) });
  if (p.can_delete) actions.push({ key: 'delete', label: 'Delete', icon: 'trash', color: colors.red[600], onPress: handleDelete });
  else if (p.can_request_delete) actions.push({ key: 'request-delete', label: 'Ask to delete', icon: 'trash-bin', color: colors.red[600], onPress: () => setPrompt({ kind: 'request-delete', text: '' }) });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
        <View style={[styles.statusPill, { backgroundColor: tint(status.color, 0.14) }]}>
          <Ionicons name={status.icon} size={14} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {task.priority < 4 && (
          <View style={[styles.statusPill, { backgroundColor: tint(PRIORITY[task.priority].color, 0.14) }]}>
            <Ionicons name="flag" size={13} color={PRIORITY[task.priority].color} />
            <Text style={[styles.statusText, { color: PRIORITY[task.priority].color }]}>{PRIORITY[task.priority].short}</Text>
          </View>
        )}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(260)}>
          <Text style={[styles.title, done && styles.titleDone]}>{task.title}</Text>

          <View style={styles.bizLine}>
            <View style={[styles.bizDot, { backgroundColor: accent(task.business_color) }]} />
            <Text style={styles.bizText}>{task.business_name}</Text>
            {task.source_business_name && <Text style={styles.bizFrom}>· requested by {task.source_business_name}</Text>}
          </View>

          {/* Who → whom */}
          <View style={styles.flowCard}>
            <Person label="Assigned by" name={task.created_by_name} you={task.created_by === user?.id} />
            <Ionicons name="arrow-forward" size={18} color={colors.gray[300]} />
            {task.assigned_user_id
              ? <Person label="Assigned to" name={task.assigned_user_name} uri={task.assigned_user_picture} you={isAssignee} />
              : <Person label="Assigned to" name="Whole team" team />}
          </View>

          <View style={styles.metaGrid}>
            <MetaRow icon="calendar-outline" label="Due">
              {task.due_date ? <DueChip date={task.due_date} done={done} /> : <Text style={styles.metaValue}>No date</Text>}
            </MetaRow>
            <MetaRow icon="shield-checkmark-outline" label="Review">
              <Text style={styles.metaValue}>{task.requires_approval ? 'Needs approval when done' : 'Closes when marked done'}</Text>
            </MetaRow>
            {task.completed_by_name && (
              <MetaRow icon="checkmark-done-outline" label={task.status === 'in_review' ? 'Finished by' : 'Done by'}>
                <Text style={styles.metaValue}>{task.completed_by_name} · {timeAgo(task.completed_at)}</Text>
              </MetaRow>
            )}
            {task.approved_by_name && (
              <MetaRow icon="ribbon-outline" label="Approved by">
                <Text style={styles.metaValue}>{task.approved_by_name}</Text>
              </MetaRow>
            )}
          </View>

          {!!task.description && <Text style={styles.description}>{task.description}</Text>}

          {task.status === 'in_review' && !p.can_approve && (
            <View style={[styles.banner, { backgroundColor: tint('#692ec2', 0.1) }]}>
              <Ionicons name="hourglass-outline" size={18} color="#692ec2" />
              <Text style={[styles.bannerText, { color: '#692ec2' }]}>
                Waiting for {task.created_by === user?.id ? 'someone senior' : task.created_by_name?.split(' ')[0]} to review.
              </Text>
            </View>
          )}
          {task.is_warned && task.warning_message && (
            <View style={[styles.banner, { backgroundColor: colors.red[50] }]}>
              <Ionicons name="warning" size={18} color={colors.red[600]} />
              <Text style={[styles.bannerText, { color: colors.red[700] }]}>{task.warning_message}</Text>
            </View>
          )}
          {task.pending_delete_request_id && (
            <View style={[styles.banner, { backgroundColor: colors.red[50] }]}>
              <Ionicons name="trash-bin-outline" size={18} color={colors.red[600]} />
              <Text style={[styles.bannerText, { color: colors.red[700] }]}>A deletion request is waiting for approval.</Text>
            </View>
          )}
        </Animated.View>

        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.map((a) => (
              <AnimatedPressable
                key={a.key}
                onPress={a.onPress}
                disabled={!!busy}
                haptic="medium"
                style={[styles.action, a.solid ? { backgroundColor: a.color } : { backgroundColor: tint(a.color.startsWith('#') ? a.color : '#64748b', 0.12) }]}
              >
                {busy === a.key ? (
                  <ActivityIndicator size="small" color={a.solid ? '#fff' : a.color} />
                ) : (
                  <Ionicons name={a.icon} size={16} color={a.solid ? '#fff' : a.color} />
                )}
                <Text style={[styles.actionText, { color: a.solid ? '#fff' : a.color }]}>{a.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Activity</Text>
        {activity.map((a) => (
          <Animated.View key={a.id} entering={FadeIn.duration(200)}>
            {a.kind === 'comment' ? (
              <View style={styles.comment}>
                <Avatar name={a.user_name} uri={a.user_picture} size={30} />
                <View style={styles.commentBubble}>
                  <Text style={styles.commentAuthor}>
                    {a.user_id === user?.id ? 'You' : a.user_name}
                    <Text style={styles.commentTime}>  {timeAgo(a.created_at)}</Text>
                  </Text>
                  <Text style={styles.commentBody}>{a.body}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.event}>
                <View style={styles.eventDot} />
                <Text style={styles.eventText}>
                  {describeActivity(a)}
                  {a.body && ['changes_requested', 'warning', 'delete_requested', 'approved', 'delete_rejected'].includes(a.kind) ? `: “${a.body}”` : ''}
                  <Text style={styles.eventTime}>  {timeAgo(a.created_at)}</Text>
                </Text>
              </View>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      {/* Comment composer */}
      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, spacing.sm), marginBottom: keyboardInset }]}>
        <MentionSuggestions
          people={suggestions}
          onPick={(person) => setComment((c) => completeMention(c, person.username))}
          style={{ marginBottom: spacing.sm }}
        />
        <View style={styles.composer}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Comment… @mention to notify"
            placeholderTextColor={colors.gray[400]}
            style={styles.composerInput}
            multiline
          />
          <AnimatedPressable onPress={sendComment} disabled={!comment.trim() || sending} haptic="light" style={[styles.sendBtn, (!comment.trim() || sending) && { opacity: 0.4 }]}>
            <Ionicons name="arrow-up" size={18} color={colors.white} />
          </AnimatedPressable>
        </View>
      </View>

      <TaskFormSheet visible={editOpen} onClose={() => setEditOpen(false)} task={task} onSaved={(t) => { setTask(t); load(); }} />

      <BottomSheet visible={!!prompt} onClose={() => setPrompt(null)} maxHeight={420} avoidKeyboard>
        {prompt && (
          <View style={{ paddingHorizontal: spacing.sm }}>
            <Text style={styles.promptTitle}>
              {prompt.kind === 'reject' ? 'What needs to change?' : prompt.kind === 'warn' ? 'Send a warning' : 'Why should this be deleted?'}
            </Text>
            <Text style={styles.promptHint}>
              {prompt.kind === 'request-delete'
                ? 'Your request goes to the person who created it and the next person up the chain.'
                : prompt.kind === 'warn' ? 'They get a notification and the task is flagged.' : 'The task goes back to them with your note.'}
            </Text>
            <TextInput
              autoFocus
              value={prompt.text}
              onChangeText={(text) => setPrompt((pr) => ({ ...pr, text }))}
              placeholder={prompt.kind === 'warn' ? 'e.g. This is 3 days late — please update today' : 'Add a note'}
              placeholderTextColor={colors.gray[400]}
              style={styles.promptInput}
              multiline
            />
            <AnimatedPressable onPress={submitPrompt} haptic="medium" style={[styles.promptBtn, prompt.kind !== 'reject' && { backgroundColor: colors.red[600] }]}>
              <Text style={styles.promptBtnText}>
                {prompt.kind === 'reject' ? 'Send back' : prompt.kind === 'warn' ? 'Send warning' : 'Send request'}
              </Text>
            </AnimatedPressable>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

function Person({ label, name, uri, you, team }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {team ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people" size={16} color={colors.gray[500]} />
        </View>
      ) : <Avatar name={name} uri={uri} size={32} />}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: colors.gray[400], fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }} numberOfLines={1}>{you ? 'You' : name}</Text>
      </View>
    </View>
  );
}

function MetaRow({ icon, label, children }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 }}>
      <Ionicons name={icon} size={17} color={colors.gray[400]} />
      <Text style={{ width: 90, fontSize: fontSize.sm, color: colors.gray[500] }}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  statusText: { fontSize: fontSize.sm, fontWeight: '700' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], lineHeight: 30 },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  bizLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  bizDot: { width: 9, height: 9, borderRadius: 5 },
  bizText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[600] },
  bizFrom: { fontSize: fontSize.sm, color: colors.gray[400] },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  metaGrid: { marginTop: spacing.md },
  metaValue: { fontSize: fontSize.sm, color: colors.gray[800], fontWeight: '500' },
  description: { fontSize: fontSize.base, color: colors.gray[700], lineHeight: 22, marginTop: spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.md },
  bannerText: { flex: 1, fontSize: fontSize.sm, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg },
  actionText: { fontSize: fontSize.sm, fontWeight: '700' },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900], marginTop: spacing.xxl, marginBottom: spacing.sm },
  comment: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderTopLeftRadius: 4,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  commentAuthor: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  commentTime: { fontSize: fontSize.xs, fontWeight: '400', color: colors.gray[400] },
  commentBody: { fontSize: fontSize.base, color: colors.gray[800], marginTop: 3, lineHeight: 20 },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 6, paddingLeft: 11 },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gray[300], marginTop: 5 },
  eventText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[600], lineHeight: 18 },
  eventTime: { fontSize: fontSize.xs, color: colors.gray[400] },
  composerWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.gray[50],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingLeft: spacing.lg,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  composerInput: { flex: 1, fontSize: fontSize.base, color: colors.gray[900], maxHeight: 110, paddingVertical: 8, outlineStyle: 'none' },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' },
  promptTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  promptHint: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 4 },
  promptInput: {
    marginTop: spacing.md,
    minHeight: 90,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.gray[900],
    textAlignVertical: 'top',
    outlineStyle: 'none',
  },
  promptBtn: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: 13,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: colors.brand[600],
  },
  promptBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
