import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import MentionSuggestions from '../MentionSuggestions';
import { Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { activeMentionQuery, completeMention } from '../../utils/quickAdd';
import { timeAgo } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';

/** Comment thread of one to-do. Reloads when someone else comments (comment_count changes). */
export default function TodoComments({ todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { fetchComments, addComment, deleteComment } = useTodos();
  const { people } = useDirectory();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments(await fetchComments(todo.id));
    } catch {
      // keep what we have
    }
  }, [fetchComments, todo.id]);

  useEffect(() => { load(); }, [load, todo.comment_count]);

  const mentionQuery = activeMentionQuery(text);
  const suggestions = mentionQuery !== null
    ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 5 })
    : [];

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const comment = await addComment(todo.id, body);
      setComments((prev) => [...prev, comment]);
      setText('');
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not post the comment', tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment) => {
    const ok = await confirmDialog({ title: 'Delete this comment?', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await deleteComment(todo.id, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete the comment', tone: 'error' });
    }
  };

  return (
    <View>
      <Text style={styles.label}>Comments{comments.length ? ` · ${comments.length}` : ''}</Text>
      {comments.map((c) => {
        const mine = c.user_id === user?.id;
        return (
          <View key={c.id} style={styles.comment}>
            <Avatar name={c.user_name || '?'} uri={c.user_picture} size={28} />
            <View style={{ flex: 1 }}>
              <View style={styles.commentHead}>
                <Text style={styles.author}>{mine ? 'You' : c.user_name || 'Someone'}</Text>
                {c.kind === 'question' && <Text style={styles.questionTag}>QUESTION</Text>}
                <Text style={styles.when}>{timeAgo(c.created_at)}</Text>
              </View>
              <Text style={[styles.body, c.kind === 'question' && styles.questionBody]}>{c.body}</Text>
            </View>
            {(mine || todo.created_by === user?.id) && (
              <AnimatedPressable onPress={() => remove(c)} hitSlop={8} haptic="light">
                <Ionicons name="close" size={16} color={colors.gray[400]} />
              </AnimatedPressable>
            )}
          </View>
        );
      })}
      <MentionSuggestions
        people={suggestions}
        onPick={(p) => setText((t) => completeMention(t, p.username))}
        style={{ marginHorizontal: spacing.sm, marginBottom: spacing.sm }}
      />
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          blurOnSubmit={false}
          placeholder="Write a comment… use @name to bring someone in"
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          multiline
        />
        <AnimatedPressable onPress={send} haptic="light" hitSlop={8} disabled={!text.trim() || sending}>
          <Ionicons name="arrow-up-circle" size={30} color={text.trim() ? colors.brand[600] : colors.gray[300]} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
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
  comment: { flexDirection: 'row', gap: spacing.md, paddingVertical: 6, paddingHorizontal: spacing.sm },
  commentHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  author: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  when: { fontSize: 11, color: colors.gray[400] },
  body: { fontSize: fontSize.base, color: colors.gray[700], marginTop: 1, lineHeight: 20 },
  questionTag: { fontSize: 9, fontWeight: '800', color: colors.brand[600], backgroundColor: colors.brand[50], paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.sm, overflow: 'hidden' },
  questionBody: { color: colors.gray[900], fontWeight: '600' },
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
