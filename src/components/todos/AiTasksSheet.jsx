import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { formatDue } from '../../utils/dates';
import { showToast } from '../../utils/events';

/**
 * A list the AI proposed (tasks from a spoken message, action items from a meeting, steps for a to-do) that
 * the person reads, edits and ticks before anything is created.
 *   load()    -> Promise<{ tasks: [{ title, assignee?, due_date?, due_time?, priority? }], summary?, decisions? }>
 *   parent    when given, the items can be added as steps (sub-tasks) of that to-do
 *   stepsOnly the items are always steps and have no people or dates
 */
export default function AiTasksSheet({ visible, onClose, title, load, parent = null, stepsOnly = false, onDone }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { createTodo } = useTodos();
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState('');
  const [decisions, setDecisions] = useState([]);
  const [asSteps, setAsSteps] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    setState('loading');
    setError('');
    setAsSteps(true);
    load().then((out) => {
      if (!live) return;
      setItems((out.tasks || []).map((t) => ({ ...t, on: true })));
      setSummary(out.summary || '');
      setDecisions(out.decisions || []);
      setState('ready');
    }).catch((err) => {
      if (!live) return;
      setError(err.response?.data?.error || err.message || 'The AI could not help right now');
      setState('error');
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const chosen = items.filter((i) => i.on && i.title.trim());
  const edit = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const asChildren = !!parent && (stepsOnly || asSteps);

  const create = async () => {
    setSaving(true);
    let made = 0;
    try {
      for (const t of chosen) {
        const base = { title: t.title.trim(), due_date: t.due_date || undefined, due_time: t.due_time || undefined, priority: t.priority || undefined };
        const payload = asChildren
          ? { ...base, parent_id: parent.id, mention_ids: t.assignee ? [t.assignee.id] : undefined }
          : t.assignee ? { ...base, delegate_to: t.assignee.id } : base;
        await createTodo(payload, { silent: true });
        made += 1;
      }
      showToast({ message: asChildren ? `${made} step${made === 1 ? '' : 's'} added` : `${made} to-do${made === 1 ? '' : 's'} created`, tone: 'success' });
      onDone?.();
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || (made ? `Only ${made} were created` : 'Could not create them'), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={680} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm, flexShrink: 1 }}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles" size={18} color={colors.brand[600]} />
          <Text style={styles.title}>{title}</Text>
        </View>

        {state === 'loading' && (
          <View style={styles.center}><ActivityIndicator color={colors.brand[600]} /><Text style={styles.hint}>Thinking it through...</Text></View>
        )}
        {state === 'error' && <Text style={[styles.hint, { color: colors.red[600], paddingVertical: spacing.lg }]}>{error}</Text>}

        {state === 'ready' && (
          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            {!!summary && <View {...glass('inset')} style={styles.summary}><Text style={styles.summaryText}>{summary}</Text></View>}
            {decisions.length > 0 && (
              <View style={{ marginBottom: spacing.sm }}>
                <Text style={styles.label}>Decided</Text>
                {decisions.map((d, i) => <Text key={i} style={styles.decision}>• {d}</Text>)}
              </View>
            )}
            {items.length === 0 && <Text style={[styles.hint, { paddingVertical: spacing.lg }]}>Nothing to add from that.</Text>}
            {items.length > 0 && !stepsOnly && <Text style={styles.label}>{asChildren ? 'Steps to add' : 'To-dos to create'}</Text>}
            {items.map((t, idx) => (
              <View key={idx} style={styles.row}>
                <AnimatedPressable onPress={() => edit(idx, { on: !t.on })} hitSlop={8}>
                  <Ionicons name={t.on ? 'checkbox' : 'square-outline'} size={22} color={t.on ? colors.brand[600] : colors.gray[400]} />
                </AnimatedPressable>
                <View style={{ flex: 1 }}>
                  <TextInput value={t.title} onChangeText={(v) => edit(idx, { title: v })} style={[styles.input, !t.on && { opacity: 0.45 }]} multiline />
                  {!stepsOnly && (
                    <View style={styles.meta}>
                      <View style={styles.tag}><Ionicons name="person-outline" size={11} color={colors.gray[600]} /><Text style={styles.tagText}>{t.assignee ? t.assignee.name.split(' ')[0] : 'Me'}</Text></View>
                      {!!t.due_date && <View style={styles.tag}><Ionicons name="calendar-outline" size={11} color={colors.gray[600]} /><Text style={styles.tagText}>{formatDue(t.due_date)}{t.due_time ? ` ${t.due_time}` : ''}</Text></View>}
                    </View>
                  )}
                </View>
              </View>
            ))}
            {!!parent && !stepsOnly && items.length > 0 && (
              <AnimatedPressable style={styles.toggle} onPress={() => setAsSteps((v) => !v)}>
                <Ionicons name={asSteps ? 'toggle' : 'toggle-outline'} size={30} color={asSteps ? colors.brand[600] : colors.gray[400]} />
                <Text style={styles.toggleText}>Add them as steps of "{parent.title}"</Text>
              </AnimatedPressable>
            )}
          </ScrollView>
        )}

        {state === 'ready' && items.length > 0 && (
          <AnimatedPressable style={[styles.go, (!chosen.length || saving) && { opacity: 0.5 }]} disabled={!chosen.length || saving} onPress={create}>
            <Text style={styles.goText}>{saving ? 'Adding...' : asChildren ? `Add ${chosen.length} step${chosen.length === 1 ? '' : 's'}` : `Create ${chosen.length} to-do${chosen.length === 1 ? '' : 's'}`}</Text>
          </AnimatedPressable>
        )}
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], flex: 1 },
  center: { alignItems: 'center', gap: 10, paddingVertical: spacing.xl },
  hint: { fontSize: fontSize.sm, color: colors.gray[500] },
  label: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  summary: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  summaryText: { fontSize: fontSize.base, color: colors.gray[800], lineHeight: 21 },
  decision: { fontSize: fontSize.sm, color: colors.gray[700], marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 8 },
  input: { fontSize: fontSize.base, color: colors.gray[900], paddingVertical: 2, outlineStyle: 'none' },
  meta: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gray[100], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.gray[700] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.md },
  toggleText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[700] },
  go: { backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  goText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});
