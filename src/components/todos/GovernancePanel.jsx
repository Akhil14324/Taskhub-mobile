import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import PromptSheet from './PromptSheet';
import { timeAgo } from '../../utils/dates';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

/**
 * Business-only controls of a to-do, driven entirely by the server's `permissions`:
 *  - a proposal waiting for a manager (accept / decline)
 *  - finished work waiting for review (approve / ask for changes)
 *  - warnings and pending deletion requests
 *  - warn the assignee
 * Renders nothing for personal to-dos.
 */
export default function GovernancePanel({ todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reviewTodo, approveTodo, rejectTodo, warnTodo } = useTodos();
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!todo?.business_id) return null;
  const p = todo.permissions || {};

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) showToast({ message, tone: 'success' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Something went wrong', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onPrompt = async (text) => {
    const kind = prompt?.kind;
    setPrompt(null);
    if (kind === 'decline') await run(() => reviewTodo(todo.id, 'reject', text), 'Declined');
    if (kind === 'changes') await run(() => rejectTodo(todo.id, text), 'Sent back with your note');
    if (kind === 'warn') await run(() => warnTodo(todo.id, text), 'Warning sent');
  };

  const first = (name) => (name || 'Someone').split(' ')[0];

  return (
    <View style={styles.wrap}>
      {todo.review_state === 'proposed' && (
        <View {...glass('inset')} style={styles.card}>
          <View style={styles.head}>
            <Ionicons name="git-pull-request-outline" size={18} color={colors.brand[700]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Suggested by {first(todo.created_by_name)}</Text>
              <Text style={styles.sub}>
                {p.can_review
                  ? 'Accept it to make it real work for the business, or decline it with a reason.'
                  : 'Waiting for a manager to accept or decline it.'}
              </Text>
            </View>
          </View>
          {p.can_review && (
            <View style={styles.buttons}>
              <Btn label="Decline" icon="close" onPress={() => setPrompt({ kind: 'decline', title: 'Decline this task', hint: 'Tell them why. They can see your reason.', placeholder: 'Reason', confirmLabel: 'Decline', required: true })} disabled={busy} />
              <Btn label="Accept" icon="checkmark" solid onPress={() => run(() => reviewTodo(todo.id, 'accept'), 'Accepted')} disabled={busy} />
            </View>
          )}
        </View>
      )}

      {todo.review_state === 'rejected' && (
        <View {...glass('inset')} style={styles.card}>
          <View style={styles.head}>
            <Ionicons name="close-circle-outline" size={18} color={colors.brand[700]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Declined{todo.reviewed_by_name ? ` by ${first(todo.reviewed_by_name)}` : ''}</Text>
              {!!todo.review_note && <Text style={styles.sub}>{todo.review_note}</Text>}
            </View>
          </View>
          {p.can_review && (
            <View style={styles.buttons}>
              <Btn label="Accept after all" icon="checkmark" solid onPress={() => run(() => reviewTodo(todo.id, 'accept'), 'Accepted')} disabled={busy} />
            </View>
          )}
        </View>
      )}

      {todo.status === 'in_review' && !todo.is_done && (
        <View {...glass('inset')} style={styles.card}>
          <View style={styles.head}>
            <Ionicons name="eye-outline" size={18} color={colors.brand[700]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Finished — waiting for review</Text>
              <Text style={styles.sub}>
                {first(todo.submitted_by_name)} sent it {todo.submitted_at ? timeAgo(todo.submitted_at) : ''}.
                {p.can_approve ? ' Approve it to close it, or send it back.' : ''}
              </Text>
            </View>
          </View>
          {p.can_approve && (
            <View style={styles.buttons}>
              <Btn label="Ask for changes" icon="arrow-undo" onPress={() => setPrompt({ kind: 'changes', title: 'Ask for changes', hint: 'It goes back to in progress with your note.', placeholder: 'What should change?', confirmLabel: 'Send back' })} disabled={busy} />
              <Btn label="Approve" icon="checkmark-done" solid onPress={() => run(() => approveTodo(todo.id), 'Approved')} disabled={busy} />
            </View>
          )}
        </View>
      )}

      {todo.is_done && !!todo.approved_by_name && (
        <View {...glass('inset')} style={[styles.card, styles.quiet]}>
          <View style={styles.head}>
            <Ionicons name="ribbon-outline" size={18} color={colors.gray[500]} />
            <Text style={styles.sub}>Approved by {first(todo.approved_by_name)} {todo.approved_at ? timeAgo(todo.approved_at) : ''}</Text>
          </View>
        </View>
      )}

      {todo.is_warned && !!todo.warning_message && (
        <View {...glass('inset')} style={styles.card}>
          <View style={styles.head}>
            <Ionicons name="warning" size={18} color={colors.red[600]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.red[700] }]}>Warning</Text>
              <Text style={styles.sub}>{todo.warning_message}</Text>
            </View>
          </View>
        </View>
      )}

      {!!todo.pending_delete_request_id && (
        <View {...glass('inset')} style={[styles.card, styles.quiet]}>
          <View style={styles.head}>
            <Ionicons name="trash-outline" size={18} color={colors.gray[500]} />
            <Text style={styles.sub}>A deletion request is waiting for approval.</Text>
          </View>
        </View>
      )}

      {p.can_warn && (
        <AnimatedPressable
          style={styles.warn}
          onPress={() => setPrompt({ kind: 'warn', title: 'Send a warning', hint: 'The assignee is notified and marked as warned until this is finished.', placeholder: 'Warning message', confirmLabel: 'Send warning', required: true })}
        >
          <Ionicons name="warning-outline" size={16} color={colors.red[600]} />
          <Text style={styles.warnText}>Send a warning</Text>
        </AnimatedPressable>
      )}

      <PromptSheet value={prompt} onClose={() => setPrompt(null)} onSubmit={onPrompt} />
    </View>
  );
}

function Btn({ label, icon, solid, onPress, disabled }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
        borderRadius: radius.md, backgroundColor: solid ? colors.brand[600] : colors.gray[100], opacity: disabled ? 0.6 : 1,
      }}
    >
      <Ionicons name={icon} size={16} color={solid ? '#fff' : colors.gray[700]} />
      <Text style={{ fontWeight: '600', fontSize: fontSize.sm, color: solid ? '#fff' : colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  card: {
    backgroundColor: colors.brand[50], borderRadius: radius.lg, padding: spacing.md, gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brand[200],
  },
  quiet: { backgroundColor: colors.gray[100], borderColor: colors.gray[200], paddingVertical: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 1, flexShrink: 1 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  warnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.red[600] },
});
