import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import MentionSuggestions from '../MentionSuggestions';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { activeMentionQuery, completeMention } from '../../utils/quickAdd';
import { timeAgo } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import api from '../../api/client';
import { RichText, ReactionBar, AttachmentList, pickFile, uploadAttachment, collabStyles } from './collab';

const THREAD_PREVIEW = 2;

/**
 * Conversation on one to-do: threaded comments, reactions, files and @mentions. Reactions and files
 * on the to-do itself sit above the thread. Reloads live when anyone else adds to it.
 */
export default function TodoComments({ todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cs = useMemo(() => collabStyles(colors), [colors]);
  const { user } = useAuth();
  const { subscribe } = useChat();
  const { fetchComments, addComment, deleteComment } = useTodos();
  const { people } = useDirectory();
  const [comments, setComments] = useState([]);
  const [collab, setCollab] = useState({ reactions: [], attachments: [] });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [pending, setPending] = useState([]); // files uploaded for the comment being written
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    try {
      const [list, extra] = await Promise.all([
        fetchComments(todo.id),
        api.get(`/collab/todos/${todo.id}`, { __skipOops: true }).then((r) => r.data).catch(() => null),
      ]);
      setComments(list);
      if (extra) setCollab({ reactions: extra.reactions, attachments: extra.attachments });
    } catch {
      // keep what we have
    }
  }, [fetchComments, todo.id]);

  useEffect(() => { load(); }, [load, todo.comment_count]);
  useEffect(() => subscribe('todo:changed', (e) => { if (Number(e?.todoId) === Number(todo.id)) load(); }), [subscribe, todo.id, load]);

  const canManage = (item) => item.user_id === user?.id || todo.created_by === user?.id || !!todo.permissions?.can_edit;

  const mentionQuery = activeMentionQuery(text);
  const suggestions = mentionQuery !== null
    ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 5 })
    : [];

  const { threads, replies } = useMemo(() => {
    const byParent = {};
    const top = [];
    comments.forEach((c) => {
      if (c.parent_id) (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c);
      else top.push(c);
    });
    return { threads: top, replies: byParent };
  }, [comments]);

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    try {
      const comment = await addComment(todo.id, body, [], { parentId: replyTo?.id, attachmentIds: pending.map((a) => a.id) });
      setComments((prev) => [...prev, comment]);
      if (replyTo) setExpanded((e) => ({ ...e, [replyTo.id]: true }));
      setText('');
      setPending([]);
      setReplyTo(null);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not post the comment', tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment) => {
    const ok = await confirmDialog({ title: 'Delete this comment?', message: replies[comment.id]?.length ? 'Its replies go with it.' : undefined, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await deleteComment(todo.id, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id && c.parent_id !== comment.id));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete the comment', tone: 'error' });
    }
  };

  const react = async (comment, kind) => {
    try {
      const res = await api.post(`/collab/comments/${comment.id}/react`, { kind });
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, reactions: res.data.reactions } : c)));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not react', tone: 'error' });
    }
  };

  const reactToTodo = async (kind) => {
    try {
      const res = await api.post(`/collab/todos/${todo.id}/react`, { kind });
      setCollab((c) => ({ ...c, reactions: res.data.reactions }));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not react', tone: 'error' });
    }
  };

  const attach = async (forComment) => {
    const file = await pickFile();
    if (!file) return;
    setUploading(true);
    try {
      const a = await uploadAttachment(todo.id, file, forComment);
      if (forComment) setPending((p) => [...p, a]);
      else setCollab((c) => ({ ...c, attachments: [...c.attachments, a] }));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not upload the file', tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (a, fromPending) => {
    try {
      await api.delete(`/collab/attachments/${a.id}`);
      if (fromPending) setPending((p) => p.filter((x) => x.id !== a.id));
      else setCollab((c) => ({ ...c, attachments: c.attachments.filter((x) => x.id !== a.id) }));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not remove the file', tone: 'error' });
    }
  };

  const renderComment = (c, isReply) => {
    const mine = c.user_id === user?.id;
    return (
      <View key={c.id} style={[styles.comment, isReply && styles.reply]}>
        <Avatar name={c.user_name || '?'} uri={c.user_picture} size={isReply ? 24 : 28} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.commentHead}>
            <Text style={styles.author}>{mine ? 'You' : c.user_name || 'Someone'}</Text>
            {c.kind === 'question' && <Text style={styles.questionTag}>QUESTION</Text>}
            <Text style={styles.when}>{timeAgo(c.created_at)}</Text>
          </View>
          {!!c.body && <RichText text={c.body} style={[styles.body, c.kind === 'question' && styles.questionBody]} mentionStyle={cs.mention} />}
          <AttachmentList items={c.attachments || []} />
          <View style={styles.actions}>
            <ReactionBar reactions={c.reactions || []} onToggle={(k) => react(c, k)} compact />
            <AnimatedPressable onPress={() => setReplyTo(isReply ? { id: c.parent_id, name: c.user_name } : { id: c.id, name: c.user_name })} hitSlop={6}>
              <Text style={cs.small}>Reply</Text>
            </AnimatedPressable>
          </View>
        </View>
        {canManage(c) && (
          <AnimatedPressable onPress={() => remove(c)} hitSlop={8} haptic="light" accessibilityLabel="Delete comment">
            <Ionicons name="close" size={16} color={colors.gray[400]} />
          </AnimatedPressable>
        )}
      </View>
    );
  };

  return (
    <View>
      <View style={styles.taskRow}>
        <ReactionBar reactions={collab.reactions} onToggle={reactToTodo} />
        <AnimatedPressable style={styles.attachBtn} onPress={() => attach(false)} disabled={uploading}>
          <Ionicons name="attach" size={15} color={colors.brand[600]} />
          <Text style={styles.attachText}>{uploading ? 'Uploading...' : 'Attach a file'}</Text>
        </AnimatedPressable>
      </View>
      {collab.attachments.length > 0 && (
        <View style={{ paddingHorizontal: spacing.sm }}>
          <AttachmentList items={collab.attachments} canRemove={canManage} onRemove={(a) => removeFile(a, false)} />
        </View>
      )}

      <Text style={styles.label}>Discussion{comments.length ? ` · ${comments.length}` : ''}</Text>
      {!comments.length && <Text style={styles.empty}>Nothing yet. Ask a question, share a file, or @name someone to bring them in.</Text>}
      {threads.map((c) => {
        const kids = replies[c.id] || [];
        const open = expanded[c.id] || kids.length <= THREAD_PREVIEW;
        const shown = open ? kids : kids.slice(-THREAD_PREVIEW);
        return (
          <View key={c.id}>
            {renderComment(c, false)}
            {kids.length > 0 && (
              <View style={styles.thread}>
                {!open && (
                  <AnimatedPressable onPress={() => setExpanded((e) => ({ ...e, [c.id]: true }))} style={{ paddingVertical: 4 }}>
                    <Text style={cs.small}>Show {kids.length - THREAD_PREVIEW} earlier repl{kids.length - THREAD_PREVIEW === 1 ? 'y' : 'ies'}</Text>
                  </AnimatedPressable>
                )}
                {shown.map((r) => renderComment(r, true))}
              </View>
            )}
          </View>
        );
      })}

      <MentionSuggestions
        people={suggestions}
        onPick={(p) => setText((t) => completeMention(t, p.username))}
        style={{ marginHorizontal: spacing.sm, marginBottom: spacing.sm }}
      />
      {replyTo && (
        <View style={styles.replying}>
          <Ionicons name="return-down-forward" size={14} color={colors.brand[600]} />
          <Text style={[cs.small, { flex: 1 }]} numberOfLines={1}>Replying to {replyTo.name || 'a comment'}</Text>
          <AnimatedPressable onPress={() => setReplyTo(null)} hitSlop={8}><Ionicons name="close" size={14} color={colors.gray[500]} /></AnimatedPressable>
        </View>
      )}
      {pending.length > 0 && (
        <View style={{ paddingHorizontal: spacing.sm, marginBottom: 6 }}>
          <AttachmentList items={pending} canRemove={() => true} onRemove={(a) => removeFile(a, true)} />
        </View>
      )}
      <View style={styles.inputRow}>
        <AnimatedPressable onPress={() => attach(true)} hitSlop={8} disabled={uploading} accessibilityLabel="Attach a file to the comment">
          <Ionicons name="attach" size={24} color={uploading ? colors.gray[300] : colors.gray[500]} />
        </AnimatedPressable>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          blurOnSubmit={false}
          placeholder={replyTo ? 'Write a reply...' : 'Write a comment... use @name to bring someone in'}
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          multiline
        />
        <AnimatedPressable onPress={send} haptic="light" hitSlop={8} disabled={(!text.trim() && !pending.length) || sending}>
          <Ionicons name="arrow-up-circle" size={30} color={text.trim() || pending.length ? colors.brand[600] : colors.gray[300]} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  taskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap', paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.brand[50] },
  attachText: { fontSize: 11, fontWeight: '800', color: colors.brand[700] },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  empty: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, lineHeight: 19 },
  comment: { flexDirection: 'row', gap: spacing.md, paddingVertical: 6, paddingHorizontal: spacing.sm },
  reply: { paddingVertical: 4, paddingHorizontal: 0 },
  thread: { marginLeft: spacing.xl + 8, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.gray[200], marginBottom: 4 },
  commentHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  author: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  when: { fontSize: 11, color: colors.gray[400] },
  body: { fontSize: fontSize.base, color: colors.gray[700], marginTop: 1, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginTop: 2 },
  questionTag: { fontSize: 9, fontWeight: '800', color: colors.brand[600], backgroundColor: colors.brand[50], paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.sm, overflow: 'hidden' },
  questionBody: { color: colors.gray[900], fontWeight: '600' },
  replying: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.sm, marginBottom: 4, paddingHorizontal: 10, height: 28, borderRadius: radius.md, backgroundColor: colors.brand[50] },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: 4 },
  input: {
    flex: 1,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    maxHeight: 110,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
});
