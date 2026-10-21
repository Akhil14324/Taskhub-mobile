import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import PromptSheet from './PromptSheet';
import { PickerSheet } from './Pickers';
import useDirectory from '../../hooks/useDirectory';
import { showToast } from '../../utils/events';
import api from '../../api/client';

const STATE_LABEL = {
  awaiting_review: 'Waiting for a decision',
  approved: 'Cleared to go on',
  redo: 'Sent back to redo',
  stopped: 'Stopped here',
};

/** Small status tag shown on a step once it has been finished. */
export function StepTag({ step }) {
  const colors = useColors();
  if (!step?.step_state || !STATE_LABEL[step.step_state]) return null;
  const bad = step.step_state === 'redo' || step.step_state === 'stopped';
  const wait = step.step_state === 'awaiting_review';
  return (
    <View style={[styles.tag, { backgroundColor: wait ? colors.brand[100] : bad ? colors.brand[200] : colors.gray[100] }]}>
      <Ionicons name={wait ? 'hourglass-outline' : bad ? 'refresh' : 'checkmark'} size={11} color={bad || wait ? colors.brand[700] : colors.gray[600]} />
      <Text style={[styles.tagText, { color: bad || wait ? colors.brand[700] : colors.gray[600] }]}>{STATE_LABEL[step.step_state]}</Text>
    </View>
  );
}

/**
 * The checkpoint after a step: whoever set the work decides what happens next. Only they see the buttons;
 * everyone else just sees that the step is waiting.
 */
export default function StepReview({ step }) {
  const colors = useColors();
  const { user } = useAuth();
  const { people } = useDirectory();
  const { todos, fetchTodos } = useTodos();
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(null); // { decision, title, ... }
  const [pickOpen, setPickOpen] = useState(false);
  const parent = useMemo(() => todos.find((t) => t.id === step.parent_id), [todos, step.parent_id]);

  if (step.step_state !== 'awaiting_review') return null;
  const mayDecide = step.parent_created_by === user?.id || parent?.permissions?.can_edit;
  if (!mayDecide) return <StepTag step={step} />;

  const send = async (decision, note, userId) => {
    setBusy(true);
    try {
      await api.post(`/todos/${step.id}/step-review`, { decision, note: note || undefined, user_id: userId || undefined });
      await fetchTodos();
      showToast({
        message: { continue: 'Go ahead sent', redo: 'Sent back to redo', stop: 'Stopped here', delegate: 'Handed over', roadblock: 'Roadblock raised' }[decision],
        tone: 'success',
      });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save that decision', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const actions = [
    { key: 'continue', icon: 'play-forward', label: 'Go ahead', primary: true, run: () => send('continue') },
    { key: 'redo', icon: 'refresh', label: 'Redo', run: () => setPrompt({ decision: 'redo', title: 'What needs to be redone?', hint: `"${step.title}" goes back to the person.`, placeholder: 'Say what to fix', confirmLabel: 'Send back', required: true }) },
    { key: 'stop', icon: 'stop-circle-outline', label: 'Stop', run: () => setPrompt({ decision: 'stop', title: 'Stop here?', hint: 'The whole to-do is put on hold.', placeholder: 'Why? (optional)', confirmLabel: 'Put on hold' }) },
    { key: 'delegate', icon: 'person-add-outline', label: 'Hand over', run: () => setPickOpen(true) },
    { key: 'roadblock', icon: 'hand-left-outline', label: 'Roadblock', run: () => setPrompt({ decision: 'roadblock', title: 'What is in the way?', hint: 'It is raised as a blocker on the whole to-do.', placeholder: 'Describe the roadblock', confirmLabel: 'Raise it', required: true }) },
  ];

  return (
    <View {...glass('inset')} style={[styles.card, { borderColor: colors.brand[200] }]}>
      <View style={styles.head}>
        <Ionicons name="flag" size={15} color={colors.brand[600]} />
        <Text style={[styles.title, { color: colors.gray[900] }]}>Step finished. What next?</Text>
      </View>
      <Text style={[styles.sub, { color: colors.gray[500] }]} numberOfLines={2}>{step.title}</Text>
      <View style={styles.row}>
        {actions.map((a) => (
          <AnimatedPressable
            key={a.key}
            disabled={busy}
            onPress={a.run}
            haptic="light"
            style={[styles.btn, { backgroundColor: a.primary ? colors.brand[600] : colors.gray[100] }]}
          >
            <Ionicons name={a.icon} size={15} color={a.primary ? '#fff' : colors.gray[700]} />
            <Text style={[styles.btnText, { color: a.primary ? '#fff' : colors.gray[800] }]}>{a.label}</Text>
          </AnimatedPressable>
        ))}
      </View>
      <PromptSheet
        value={prompt}
        onClose={() => setPrompt(null)}
        onSubmit={(text) => { const p = prompt; setPrompt(null); send(p.decision, text); }}
      />
      <PickerSheet
        visible={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Who takes it from here?"
        options={people.filter((p) => p.id !== user?.id).slice(0, 80).map((p) => ({ key: p.id, label: p.name, icon: 'person-outline' }))}
        onPick={(id) => send('delegate', '', id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginTop: 4, marginBottom: 6, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: fontSize.base, fontWeight: '700' },
  sub: { fontSize: fontSize.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 },
  btnText: { fontSize: fontSize.sm, fontWeight: '700' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700' },
});
