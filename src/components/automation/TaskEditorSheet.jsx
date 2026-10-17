import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { PrimaryButton, SecondaryButton } from '../Button';
import { showToast, confirmDialog } from '../../utils/events';
import FieldInput, { fieldVisible } from './FieldInput';
import TypePicker from './TypePicker';
import RunResult from './RunResult';
import { useCatalog, describeAction, depths, blockPartner, blankAction, variablesAt } from './meta';

const HIDDEN_WHEN_ADDING = ['end_if', 'end_for'];

function ActionCard({ action, index, total, depth, open, error, spec, catalog, ctx, onToggle, onChange, onMove, onDisable, onDelete }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const structural = ['else', 'end_if', 'end_for', 'elseif'].includes(action.type);
  return (
    <View style={{ marginLeft: Math.min(depth, 4) * 14 }}>
      <View style={[styles.card, error && styles.cardError, action.disabled && { opacity: 0.5 }]} {...glass('inset')}>
        <AnimatedPressable onPress={onToggle} style={styles.head}>
          <Text style={styles.num}>{index + 1}</Text>
          <Ionicons name={spec.icon || 'ellipse-outline'} size={17} color={structural ? colors.gray[500] : colors.brand[600]} />
          <Text style={[styles.summary, structural && { color: colors.gray[600], fontWeight: '600' }]} numberOfLines={open ? 3 : 1}>{describeAction(action, catalog)}</Text>
          {action.when ? <Ionicons name="funnel-outline" size={13} color={colors.gray[500]} /> : null}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray[400]} />
        </AnimatedPressable>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {open && (
          <View style={styles.body}>
            {spec.fields.filter((f) => fieldVisible(f, action)).map((f) => (
              <FieldInput key={f.key} field={f} value={action[f.key]} onChange={(v) => onChange({ [f.key]: v })} ctx={ctx} />
            ))}
            {!['else', 'end_if', 'end_for', 'label', 'if', 'elseif', 'for'].includes(action.type) && (
              <FieldInput
                field={{ key: 'when', type: 'text', label: 'Only if (optional)', hint: 'A rule such as %todo_priority <= 2. Leave empty to always do it', raw: true, placeholder: '%todo_priority <= 2' }}
                value={action.when || ''}
                onChange={(v) => onChange({ when: v })}
                ctx={ctx}
              />
            )}
            <View style={styles.tools}>
              <AnimatedPressable onPress={() => onMove(-1)} disabled={index === 0} style={styles.tool}><Ionicons name="arrow-up" size={16} color={colors.gray[600]} /><Text style={styles.toolText}>Up</Text></AnimatedPressable>
              <AnimatedPressable onPress={() => onMove(1)} disabled={index === total - 1} style={styles.tool}><Ionicons name="arrow-down" size={16} color={colors.gray[600]} /><Text style={styles.toolText}>Down</Text></AnimatedPressable>
              <AnimatedPressable onPress={onDisable} style={styles.tool}><Ionicons name={action.disabled ? 'eye-outline' : 'eye-off-outline'} size={16} color={colors.gray[600]} /><Text style={styles.toolText}>{action.disabled ? 'Turn on' : 'Skip'}</Text></AnimatedPressable>
              <AnimatedPressable onPress={onDelete} style={styles.tool}><Ionicons name="trash-outline" size={16} color={colors.red[600]} /><Text style={[styles.toolText, { color: colors.red[600] }]}>Delete</Text></AnimatedPressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Make or change a task: a name and an ordered list of actions. Tap an action to edit it. "Test" runs the
 * list for real (as you) before it is saved, and shows what each step did.
 */
export default function TaskEditorSheet({ visible, onClose, task, onSaved, tasks = [], globals = [], contextVars = [] }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { catalog } = useCatalog();
  const [name, setName] = useState('');
  const [actions, setActions] = useState([]);
  const [open, setOpen] = useState(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!visible) return;
    setName(task?.name || '');
    setActions((task?.actions || []).map((a) => ({ ...a, id: a.id || Math.random().toString(36).slice(2, 10) })));
    setOpen(null); setResult(null); setErrors({});
  }, [visible, task]);

  const levels = useMemo(() => depths(actions), [actions]);
  if (!catalog) return null;

  const patch = (i, change) => setActions((l) => l.map((a, k) => (k === i ? { ...a, ...change } : a)));
  const move = (i, dir) => setActions((l) => {
    const j = i + dir;
    if (j < 0 || j >= l.length) return l;
    const next = [...l];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i) => {
    const partner = ['if', 'end_if', 'for', 'end_for'].includes(actions[i].type) ? blockPartner(actions, i) : -1;
    setActions((l) => l.filter((_, k) => k !== i && k !== partner));
    setOpen(null);
  };

  const add = (spec) => {
    const at = open !== null ? open + 1 : actions.length;
    const first = blankAction(spec);
    const batch = [first];
    if (spec.type === 'if') batch.push(blankAction(catalog.actionByType.end_if));
    if (spec.type === 'for') batch.push(blankAction(catalog.actionByType.end_for));
    setActions((l) => [...l.slice(0, at), ...batch, ...l.slice(at)]);
    setOpen(at);
    setPicker(false);
  };

  const ctx = (i) => ({ tasks: tasks.filter((t) => t.id !== task?.id), comparisons: catalog.comparisons, vars: variablesAt(actions, i, contextVars, globals) });

  const send = async (path) => {
    const body = { name: name.trim() || 'Task', actions };
    return api.post(path, body);
  };

  const test = async () => {
    setTesting(true); setResult(null); setErrors({});
    try {
      const res = await send('/automation/run-draft');
      setResult(res.data.run);
    } catch (err) {
      showErrors(err);
    } finally {
      setTesting(false);
    }
  };

  const showErrors = (err) => {
    const list = err.response?.data?.errors;
    if (list?.length) {
      setErrors(Object.fromEntries(list.map((e) => [e.index, e.message])));
      setOpen(list[0].index);
    }
    showToast({ message: err.response?.data?.error || 'Could not do that', icon: 'alert-circle' });
  };

  const save = async () => {
    if (!name.trim()) return showToast({ message: 'Give the task a name', icon: 'alert-circle' });
    setBusy(true); setErrors({});
    try {
      const body = { name: name.trim(), actions };
      const res = task?.id ? await api.put(`/automation/tasks/${task.id}`, body) : await api.post('/automation/tasks', body);
      showToast({ message: 'Task saved', icon: 'checkmark-circle' });
      onSaved?.(res.data.task);
      onClose();
    } catch (err) {
      showErrors(err);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    const changed = (task?.name || '') !== name || JSON.stringify((task?.actions || []).map(({ id, ...r }) => r)) !== JSON.stringify(actions.map(({ id, ...r }) => r));
    if (changed && (actions.length || name)) {
      const ok = await confirmDialog({ title: 'Close without saving?', message: 'Your changes to this task will be lost.', confirmLabel: 'Close', destructive: true });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} avoidKeyboard maxHeight={760}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>{task?.id ? 'Edit task' : 'New task'}</Text>
        <Text style={styles.sub}>A task is a list of things to do, one after another.</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Name, such as Morning briefing" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={80} />

        <Text style={styles.label}>Actions</Text>
        {actions.map((a, i) => {
          const spec = catalog.actionByType[a.type];
          if (!spec) return null;
          return (
            <ActionCard
              key={a.id}
              action={a}
              index={i}
              total={actions.length}
              depth={levels[i]}
              open={open === i}
              error={errors[i]}
              spec={spec}
              catalog={catalog}
              ctx={ctx(i)}
              onToggle={() => setOpen(open === i ? null : i)}
              onChange={(c) => patch(i, c)}
              onMove={(d) => { move(i, d); setOpen(i + d); }}
              onDisable={() => patch(i, { disabled: !a.disabled })}
              onDelete={() => remove(i)}
            />
          );
        })}
        {!actions.length && <Text style={styles.empty}>Nothing here yet. Add the first thing this task should do.</Text>}
        <AnimatedPressable onPress={() => setPicker(true)} style={styles.add}>
          <Ionicons name="add-circle" size={20} color={colors.brand[600]} />
          <Text style={styles.addText}>{open !== null ? `Add an action after ${open + 1}` : 'Add an action'}</Text>
        </AnimatedPressable>

        {!!result && <RunResult run={result} catalog={catalog} />}

        <View style={styles.footer}>
          <SecondaryButton onPress={test} loading={testing} disabled={!actions.length} style={{ flex: 1 }}>Test it now</SecondaryButton>
          <PrimaryButton onPress={save} loading={busy} style={{ flex: 1 }}>Save</PrimaryButton>
        </View>
        <Text style={styles.note}>Testing really runs the actions as you: it can add to-dos and send notifications.</Text>
      </ScrollView>
      <TypePicker visible={picker} onClose={() => setPicker(false)} title="Add an action" items={catalog.actions} hideTypes={HIDDEN_WHEN_ADDING} onPick={add} />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 4 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.sm },
  input: { marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100], fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  label: { marginTop: spacing.lg, marginBottom: 4, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] },
  card: { borderRadius: radius.lg, marginTop: 6, overflow: 'hidden' },
  cardError: { borderWidth: 1.5, borderColor: colors.red[500] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 11 },
  num: { width: 20, fontSize: 11, fontWeight: '800', color: colors.gray[400], textAlign: 'center' },
  summary: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  error: { paddingHorizontal: spacing.md, paddingBottom: 8, fontSize: fontSize.xs, color: colors.red[600], fontWeight: '600' },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  toolText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[600] },
  empty: { fontSize: fontSize.sm, color: colors.gray[500], paddingVertical: spacing.md },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.md },
  addText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.brand[600] },
  footer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  note: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 6 },
});
