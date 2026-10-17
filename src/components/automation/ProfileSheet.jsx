import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import { showToast, confirmDialog } from '../../utils/events';
import FieldInput, { fieldVisible } from './FieldInput';
import TypePicker from './TypePicker';
import TaskEditorSheet from './TaskEditorSheet';
import { useCatalog, describeContext, blankContext } from './meta';

function ContextCard({ ctx, spec, catalog, open, onToggle, onChange, onDelete, fieldCtx }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const useHere = () => {
    if (!navigator.geolocation) return showToast({ message: 'This browser cannot share a location', icon: 'alert-circle' });
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lon: Math.round(pos.coords.longitude * 1e5) / 1e5 }),
      () => showToast({ message: 'Location was not shared. Allow it in the browser and try again', icon: 'alert-circle' }),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };
  return (
    <View style={styles.card} {...glass('inset')}>
      <AnimatedPressable onPress={onToggle} style={styles.head}>
        <View style={[styles.badge, spec.kind === 'state' && styles.badgeState]}>
          <Ionicons name={spec.icon} size={16} color={colors.brand[600]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kind}>{spec.kind === 'event' ? 'Starts when' : 'Only while'}</Text>
          <Text style={styles.summary} numberOfLines={open ? 3 : 2}>{describeContext(ctx, catalog)}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray[400]} />
      </AnimatedPressable>
      {open && (
        <View style={styles.body}>
          {!!spec.hint && <Text style={styles.hint}>{spec.hint}</Text>}
          {spec.fields.filter((f) => fieldVisible(f, ctx)).map((f) => (
            <FieldInput key={f.key} field={f} value={ctx[f.key]} onChange={(v) => onChange({ [f.key]: v })} ctx={fieldCtx} />
          ))}
          {ctx.type === 'place' && (
            <AnimatedPressable onPress={useHere} style={styles.inline}>
              <Ionicons name="locate" size={16} color={colors.brand[600]} />
              <Text style={styles.inlineText}>Use my current location</Text>
            </AnimatedPressable>
          )}
          {ctx.type === 'webhook' && <Text style={styles.hint}>The secret link appears here once you save.</Text>}
          <AnimatedPressable onPress={onDelete} style={styles.inline}>
            <Ionicons name="trash-outline" size={16} color={colors.red[600]} />
            <Text style={[styles.inlineText, { color: colors.red[600] }]}>Remove this</Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  );
}

function TaskChoice({ label, hint, value, tasks, optional, onChange, onNew, onEdit }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] }}>{label}</Text>
      {!!hint && <Text style={{ fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 }}>{hint}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {optional && <Chip small label="Nothing" active={!value} onPress={() => onChange(null)} />}
        {tasks.map((t) => <Chip key={t.id} small label={t.name} active={value === t.id} onPress={() => onChange(t.id)} />)}
        <Chip small icon="add" label="New task" onPress={onNew} />
        {!!value && <Chip small icon="create-outline" label="Edit it" onPress={onEdit} />}
      </View>
    </View>
  );
}

/** Make or change a profile: when it starts, what must also be true, and which task it runs. */
export default function ProfileSheet({ visible, onClose, profile, tasks, globals = [], onSaved, onTasksChanged }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { catalog } = useCatalog();
  const [name, setName] = useState('');
  const [contexts, setContexts] = useState([]);
  const [mode, setMode] = useState('all');
  const [enterId, setEnterId] = useState(null);
  const [exitId, setExitId] = useState(null);
  const [cooldown, setCooldown] = useState('5');
  const [open, setOpen] = useState(null);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(null); // { slot, task }
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setLocal(profile || null);
    setName(profile?.name || '');
    setContexts(profile?.contexts || []);
    setMode(profile?.match_mode || 'all');
    setEnterId(profile?.enter_task_id || null);
    setExitId(profile?.exit_task_id || null);
    setCooldown(String(profile?.cooldown_seconds ?? 5));
    setOpen(profile ? null : 0);
    setEditing(null);
  }, [visible, profile]);

  if (!catalog) return null;

  const specOf = (c) => catalog.contextByType[c.type];
  const eventCtx = contexts.find((c) => specOf(c)?.kind === 'event');
  const states = contexts.filter((c) => specOf(c)?.kind === 'state');
  const isState = !eventCtx;
  const contextVars = eventCtx ? (specOf(eventCtx).vars || []) : [];
  const fieldCtx = { comparisons: catalog.comparisons, vars: [...globals, 'TIME', 'DATE'] };

  const patch = (i, change) => setContexts((l) => l.map((c, k) => (k === i ? { ...c, ...change } : c)));
  const add = (spec) => {
    setContexts((l) => [...l, blankContext(spec)]);
    setOpen(contexts.length);
    setPicker(false);
  };

  const save = async () => {
    if (!name.trim()) return showToast({ message: 'Give the profile a name', icon: 'alert-circle' });
    if (!contexts.length) return showToast({ message: 'Add what it should listen for', icon: 'alert-circle' });
    setBusy(true);
    try {
      const body = {
        name: name.trim(), contexts, match_mode: mode, enter_task_id: enterId, exit_task_id: isState ? exitId : null,
        cooldown_seconds: Number(cooldown) || 0,
      };
      const res = local?.id ? await api.put(`/automation/profiles/${local.id}`, body) : await api.post('/automation/profiles', { ...body, enabled: true });
      onSaved?.(res.data.profile);
      if (!enterId) showToast({ message: 'Saved. Pick a task to run, or it will do nothing', icon: 'information-circle' });
      else showToast({ message: 'Profile saved', icon: 'checkmark-circle' });
      if (res.data.profile.hook_url) { setLocal(res.data.profile); setOpen(null); } else onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const newLink = async () => {
    const ok = await confirmDialog({ title: 'Make a new link?', message: 'The old link stops working right away.', confirmLabel: 'New link' });
    if (!ok) return;
    try {
      const res = await api.post(`/automation/profiles/${local.id}/new-link`);
      setLocal(res.data.profile); onSaved?.(res.data.profile);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not do that', icon: 'alert-circle' });
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); showToast({ message: 'Link copied', icon: 'copy-outline' }); } catch { showToast({ message: text, icon: 'link' }); }
  };

  const openTask = async (slot, id) => {
    if (!id) return setEditing({ slot, task: null });
    try {
      const res = await api.get(`/automation/tasks/${id}`);
      setEditing({ slot, task: res.data.task });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not open the task', icon: 'alert-circle' });
    }
  };

  const eventTypes = catalog.contexts.filter((c) => c.kind === 'event').map((c) => c.type);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={760}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>{local?.id ? 'Edit profile' : 'New profile'}</Text>
        <Text style={styles.sub}>A profile says when something should happen, and which task does it.</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Name, such as Morning briefing" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} maxLength={80} />

        <Text style={styles.label}>When</Text>
        {contexts.map((c, i) => {
          const spec = specOf(c);
          if (!spec) return null;
          return (
            <ContextCard
              key={i}
              ctx={c}
              spec={spec}
              catalog={catalog}
              open={open === i}
              fieldCtx={fieldCtx}
              onToggle={() => setOpen(open === i ? null : i)}
              onChange={(ch) => patch(i, ch)}
              onDelete={() => { setContexts((l) => l.filter((_, k) => k !== i)); setOpen(null); }}
            />
          );
        })}
        <AnimatedPressable onPress={() => setPicker(true)} style={styles.add}>
          <Ionicons name="add-circle" size={20} color={colors.brand[600]} />
          <Text style={styles.addText}>{contexts.length ? 'Add a condition' : 'Choose when'}</Text>
        </AnimatedPressable>
        {isState && contexts.length > 0 && (
          <Text style={styles.hint}>This profile has no starting moment, so it works while its conditions are true: the first task runs when they become true, the second when they stop.</Text>
        )}
        {states.length > 1 && (
          <View style={styles.row}>
            <Chip small label="All must be true" active={mode === 'all'} onPress={() => setMode('all')} />
            <Chip small label="Any one is enough" active={mode === 'any'} onPress={() => setMode('any')} />
          </View>
        )}

        <Text style={styles.label}>Then</Text>
        <TaskChoice
          label={isState ? 'When it starts, run' : 'Run'}
          value={enterId}
          tasks={tasks}
          onChange={setEnterId}
          onNew={() => openTask('enter', null)}
          onEdit={() => openTask('enter', enterId)}
        />
        {isState && (
          <TaskChoice
            label="When it stops, run (optional)"
            value={exitId}
            tasks={tasks}
            optional
            onChange={setExitId}
            onNew={() => openTask('exit', null)}
            onEdit={() => openTask('exit', exitId)}
          />
        )}

        {!!local?.hook_url && (
          <View style={styles.link} {...glass('inset')}>
            <Text style={styles.kind}>Secret web link</Text>
            <Text style={styles.linkText} selectable numberOfLines={3}>{local.hook_url}</Text>
            <Text style={styles.hint}>Anything that can open this address starts the profile. Send text with ?text=hello, or POST JSON with a text, title or message field. Keep it private.</Text>
            <View style={styles.row}>
              <Chip small icon="copy-outline" label="Copy" onPress={() => copy(local.hook_url)} />
              <Chip small icon="refresh" label="New link" onPress={newLink} />
            </View>
          </View>
        )}

        <Text style={styles.label}>Wait between runs</Text>
        <Text style={styles.hint}>So a busy moment does not run it again and again. Seconds.</Text>
        <TextInput value={cooldown} onChangeText={(t) => setCooldown(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" {...glass('inset')} style={[styles.input, { width: 120 }]} />

        <PrimaryButton onPress={save} loading={busy} style={{ marginTop: spacing.lg }}>Save profile</PrimaryButton>
      </ScrollView>

      <TypePicker
        visible={picker}
        onClose={() => setPicker(false)}
        title={eventCtx ? 'Add a condition' : 'What should it listen for?'}
        items={catalog.contexts}
        hideTypes={eventCtx ? eventTypes : []}
        onPick={add}
      />
      <TaskEditorSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        task={editing?.task}
        tasks={tasks}
        globals={globals}
        contextVars={contextVars}
        onSaved={(t) => {
          if (editing?.slot === 'exit') setExitId(t.id); else setEnterId(t.id);
          onTasksChanged?.(t);
        }}
      />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 4 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.sm },
  input: { marginTop: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100], fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  label: { marginTop: spacing.xl, marginBottom: 2, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] },
  hint: { fontSize: fontSize.xs, color: colors.gray[500], lineHeight: 17, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  card: { borderRadius: radius.lg, marginTop: 6, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 11 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[100] },
  badgeState: { backgroundColor: colors.brand[50] },
  kind: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] },
  summary: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900], marginTop: 1 },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginTop: 4 },
  inlineText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.md },
  addText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.brand[600] },
  link: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg },
  linkText: { fontSize: fontSize.sm, color: colors.gray[800], marginTop: 4 },
});
