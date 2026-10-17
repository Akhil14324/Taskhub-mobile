import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Chip, EmptyHero } from '../components/kit';
import { MoreMenu } from '../components/UI';
import ProfileSheet from '../components/automation/ProfileSheet';
import TaskEditorSheet from '../components/automation/TaskEditorSheet';
import RecipesSheet from '../components/automation/RecipesSheet';
import RunLogSheet, { RunRow, ago } from '../components/automation/RunLogSheet';
import { useCatalog, describeContext } from '../components/automation/meta';
import { featureOn } from '../utils/features';
import { showToast, confirmDialog } from '../utils/events';

const TABS = [
  { key: 'profiles', label: 'Profiles', icon: 'flash' },
  { key: 'tasks', label: 'Tasks', icon: 'list' },
  { key: 'vars', label: 'Variables', icon: 'code-slash' },
  { key: 'activity', label: 'Activity', icon: 'time' },
];

function ProfileCard({ profile, catalog, onToggle, onEdit, onMenu, onRun }) {
  const colors = useColors();
  const first = profile.contexts.map((c) => catalog?.contextByType?.[c.type]).find(Boolean);
  const sentence = profile.contexts.map((c) => describeContext(c, catalog)).join('  ·  ');
  return (
    <AnimatedPressable onPress={onEdit} {...glass('card')} style={[styles.card, !profile.enabled && { opacity: 0.65 }]}>
      <View style={styles.cardTop}>
        <View style={[styles.circle, { backgroundColor: colors.brand[100] }]}>
          <Ionicons name={first?.icon || 'flash'} size={20} color={colors.brand[600]} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: colors.gray[900] }]} numberOfLines={1}>{profile.name}</Text>
          <Text style={[styles.sentence, { color: colors.gray[600] }]} numberOfLines={3}>{sentence}</Text>
        </View>
        <Switch
          value={profile.enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.gray[300], true: colors.brand[400] }}
          thumbColor="#fff"
        />
      </View>
      <View style={styles.cardMid}>
        <Ionicons name="play-forward-outline" size={14} color={colors.gray[500]} />
        <Text style={[styles.meta, { flex: 1, color: profile.enter_task_id ? colors.gray[600] : colors.red[600] }]} numberOfLines={1}>
          {profile.enter_task_id ? `Runs ${profile.enter_task_name}${profile.exit_task_name ? `, then ${profile.exit_task_name} when it ends` : ''}` : 'No task chosen yet'}
        </Text>
        {profile.kind === 'state' && profile.enabled && profile.active ? <Chip small label="Active now" active /> : null}
      </View>
      <View style={styles.cardBottom}>
        <Text style={[styles.meta, { flex: 1, color: colors.gray[500] }]}>
          {profile.run_count ? `${profile.run_count} run${profile.run_count === 1 ? '' : 's'} · last ${ago(profile.last_fired_at)}` : 'Has not run yet'}
        </Text>
        <AnimatedPressable onPress={onRun} hitSlop={8} style={styles.iconBtn}><Ionicons name="play-circle" size={26} color={colors.brand[600]} /></AnimatedPressable>
        <AnimatedPressable onPress={onMenu} hitSlop={8} style={styles.iconBtn}><Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.gray[500]} /></AnimatedPressable>
      </View>
    </AnimatedPressable>
  );
}

function TaskCard({ task, onEdit, onRun, onMenu }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onEdit} {...glass('card')} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.circle, { backgroundColor: colors.brand[100] }]}><Ionicons name="list" size={20} color={colors.brand[600]} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: colors.gray[900] }]} numberOfLines={1}>{task.name}</Text>
          <Text style={[styles.sentence, { color: colors.gray[600] }]}>
            {task.action_count} action{task.action_count === 1 ? '' : 's'} · {task.used_by ? `used by ${task.used_by} profile${task.used_by === 1 ? '' : 's'}` : 'not used yet'}
          </Text>
        </View>
        <AnimatedPressable onPress={onRun} hitSlop={8} style={styles.iconBtn}><Ionicons name="play-circle" size={28} color={colors.brand[600]} /></AnimatedPressable>
        <AnimatedPressable onPress={onMenu} hitSlop={8} style={styles.iconBtn}><Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.gray[500]} /></AnimatedPressable>
      </View>
    </AnimatedPressable>
  );
}

function VariablesTab({ vars, onChanged }) {
  const colors = useColors();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const save = async (n, v) => {
    try {
      await api.put(`/automation/vars/${encodeURIComponent(n)}`, { value: v });
      onChanged();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save', icon: 'alert-circle' });
    }
  };
  const remove = async (n) => {
    const ok = await confirmDialog({ title: `Delete ${n}?`, message: 'Automations that use it will see it as empty.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    await api.delete(`/automation/vars/${encodeURIComponent(n)}`).catch(() => {});
    setEditing(null);
    onChanged();
  };

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      <Text style={[styles.sentence, { color: colors.gray[600] }]}>
        Variables remember things between runs. A name in CAPITALS, like %MODE or %DONE_COUNT, is kept for good and can be used by any of your automations. Small letters live only for one run.
      </Text>
      <View {...glass('card')} style={[styles.card, { marginHorizontal: 0, gap: spacing.sm }]}>
        <Text style={[styles.meta, { color: colors.gray[500], fontWeight: '800' }]}>NEW VARIABLE</Text>
        <TextInput value={name} onChangeText={(t) => setName(t.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} placeholder="NAME" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { color: colors.gray[900], backgroundColor: colors.gray[100] }]} autoCapitalize="characters" maxLength={39} />
        <TextInput value={value} onChangeText={setValue} placeholder="Value" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={[styles.input, { color: colors.gray[900], backgroundColor: colors.gray[100] }]} maxLength={2000} />
        <Chip icon="add" label="Add" active onPress={async () => { if (!name) return; await save(name, value); setName(''); setValue(''); }} />
      </View>
      {vars.map((v) => (
        <View key={v.name} {...glass('card')} style={[styles.card, { marginHorizontal: 0 }]}>
          <AnimatedPressable onPress={() => { setEditing(editing === v.name ? null : v.name); setDraft(v.value); }} style={styles.cardTop}>
            <Text style={[styles.name, { color: colors.brand[700], flex: 0 }]}>%{v.name}</Text>
            <Text style={[styles.sentence, { flex: 1, color: colors.gray[700] }]} numberOfLines={editing === v.name ? 0 : 1}>{v.value === '' ? '(empty)' : v.value}</Text>
            <Ionicons name={editing === v.name ? 'chevron-up' : 'create-outline'} size={18} color={colors.gray[400]} />
          </AnimatedPressable>
          {editing === v.name && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput value={draft} onChangeText={setDraft} {...glass('inset')} style={[styles.input, { color: colors.gray[900], backgroundColor: colors.gray[100] }]} maxLength={2000} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Chip icon="checkmark" label="Save" active onPress={async () => { await save(v.name, draft); setEditing(null); }} />
                <Chip icon="trash-outline" label="Delete" onPress={() => remove(v.name)} />
              </View>
            </View>
          )}
        </View>
      ))}
      {!vars.length && <Text style={[styles.sentence, { color: colors.gray[500] }]}>No variables yet. Automations make them as they run (try the "Celebrate every finish" recipe), or add one above.</Text>}
    </View>
  );
}

export default function AutomationScreen({ embedded = false }) {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { subscribe } = useChat();
  const { catalog } = useCatalog();
  const [tab, setTab] = useState('profiles');
  const [data, setData] = useState(null);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profileSheet, setProfileSheet] = useState(null); // { profile } | {}
  const [taskSheet, setTaskSheet] = useState(null);
  const [recipes, setRecipes] = useState(false);
  const [menu, setMenu] = useState(null); // { kind, item }
  const [runId, setRunId] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/automation', { __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load automations');
    }
  }, []);
  const loadRuns = useCallback(async () => {
    try {
      const res = await api.get('/automation/runs', { __skipOops: true });
      setRuns(res.data.runs);
    } catch { /* the tab shows what it has */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); loadRuns(); }, [load, loadRuns]));
  useEffect(() => subscribe('automation:run', () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { load(); loadRuns(); }, 600);
  }), [subscribe, load, loadRuns]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const globals = useMemo(() => (data?.vars || []).map((v) => v.name), [data]);
  const tasks = data?.tasks || [];

  const toggle = async (p, enabled) => {
    setData((d) => ({ ...d, profiles: d.profiles.map((x) => (x.id === p.id ? { ...x, enabled } : x)) }));
    try {
      await api.put(`/automation/profiles/${p.id}`, { enabled });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change it', icon: 'alert-circle' });
      load();
    }
  };

  const runNow = async (path, label) => {
    try {
      const res = await api.post(path, {});
      const run = res.data.run;
      showToast({
        message: run.status === 'ok' ? `${label} finished` : (run.error || `${label} stopped`),
        icon: run.status === 'ok' ? 'checkmark-circle' : 'alert-circle',
        actionLabel: 'See steps',
        onAction: () => setRunId(run.id),
      });
      load(); loadRuns();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not run it', icon: 'alert-circle' });
    }
  };

  const removeItem = async (kind, item) => {
    const ok = await confirmDialog({
      title: `Delete "${item.name}"?`,
      message: kind === 'task' && item.used_by ? `${item.used_by} profile${item.used_by === 1 ? ' uses' : 's use'} this task and will stop running it.` : 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/automation/${kind === 'task' ? 'tasks' : 'profiles'}/${item.id}`);
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete', icon: 'alert-circle' });
    }
  };

  const duplicate = async (kind, item) => {
    try {
      await api.post(`/automation/${kind === 'task' ? 'tasks' : 'profiles'}/${item.id}/duplicate`);
      showToast({ message: 'Copied', icon: 'copy-outline' });
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not copy', icon: 'alert-circle' });
    }
  };

  const exportProfile = async (p) => {
    try {
      const res = await api.get(`/automation/profiles/${p.id}/export`);
      const text = JSON.stringify(res.data, null, 2);
      await navigator.clipboard.writeText(text);
      showToast({ message: 'Copied. Paste it into "Import" on another account', icon: 'copy-outline' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not copy it', icon: 'alert-circle' });
    }
  };

  const importProfile = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const doc = JSON.parse(text);
      await api.post('/automation/import', { doc });
      showToast({ message: 'Imported, switched off. Check it, then turn it on', icon: 'download-outline' });
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Copy an exported automation first, then tap Import', icon: 'alert-circle' });
    }
  };

  const menuItems = menu?.kind === 'task'
    ? [
      { label: 'Run now', icon: 'play-outline', action: 'run' },
      { label: 'Edit', icon: 'create-outline', action: 'edit' },
      { label: 'Copy', icon: 'copy-outline', action: 'dup' },
      { label: 'Delete', icon: 'trash-outline', action: 'del', color: colors.red[600] },
    ]
    : [
      { label: 'Run now', icon: 'play-outline', action: 'run' },
      ...(menu?.item?.kind === 'state' && menu?.item?.exit_task_id ? [{ label: 'Run the "when it stops" task', icon: 'stop-outline', action: 'runexit' }] : []),
      { label: 'Edit', icon: 'create-outline', action: 'edit' },
      { label: 'Copy', icon: 'copy-outline', action: 'dup' },
      { label: 'Copy to share', icon: 'share-outline', action: 'export' },
      { label: 'Delete', icon: 'trash-outline', action: 'del', color: colors.red[600] },
    ];

  const onMenuItem = (it) => {
    const { kind, item } = menu;
    setMenu(null);
    if (it.action === 'run') runNow(kind === 'task' ? `/automation/tasks/${item.id}/run` : `/automation/profiles/${item.id}/run`, item.name);
    else if (it.action === 'runexit') runNow(`/automation/profiles/${item.id}/run`, item.name);
    else if (it.action === 'edit') (kind === 'task' ? openTask(item.id) : setProfileSheet({ profile: item }));
    else if (it.action === 'dup') duplicate(kind, item);
    else if (it.action === 'export') exportProfile(item);
    else if (it.action === 'del') removeItem(kind, item);
  };

  const openTask = async (id) => {
    if (!id) return setTaskSheet({ task: null });
    try {
      const res = await api.get(`/automation/tasks/${id}`);
      setTaskSheet({ task: res.data.task });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not open it', icon: 'alert-circle' });
    }
  };

  if (!featureOn(user?.preferences, 'automation')) {
    return (
      <View style={[styles.container, { paddingTop: embedded ? 0 : insets.top }]}>
        {!embedded && <View style={styles.header}><BackTitle title="Automations" style={[styles.title, { color: colors.gray[900] }]} /></View>}
        <EmptyHero icon="flash-off" title="Automations are switched off" message="Turn them on under Profile, Features, then come back." />
      </View>
    );
  }

  const profiles = data?.profiles || [];
  const fabLabel = tab === 'tasks' ? 'New task' : 'New profile';

  return (
    <View style={[styles.container, { paddingTop: embedded ? 0 : insets.top }]}>
      {!embedded && (
        <View style={styles.header}>
          <BackTitle title="Automations" style={[styles.title, { color: colors.gray[900] }]} />
          <Text style={[styles.subtitle, { color: colors.gray[500] }]}>Let TaskHub do things for you, when something happens</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), loadRuns()]); setRefreshing(false); }} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => <Chip key={t.key} icon={t.icon} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />)}
          <Chip icon="sparkles" label="Ready-made" onPress={() => setRecipes(true)} />
          <Chip icon="download-outline" label="Import" onPress={importProfile} />
        </ScrollView>

        {!data && !error && <SkeletonList count={3} type="notification" />}
        {!!error && <EmptyHero icon="alert-circle" title="Could not load" message={error} />}

        {data && tab === 'profiles' && (
          <>
            {profiles.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                catalog={catalog}
                onToggle={(v) => toggle(p, v)}
                onEdit={() => setProfileSheet({ profile: p })}
                onMenu={() => setMenu({ kind: 'profile', item: p })}
                onRun={() => runNow(`/automation/profiles/${p.id}/run`, p.name)}
              />
            ))}
            {!profiles.length && (
              <EmptyHero
                icon="flash"
                title="Make TaskHub work for you"
                message="A profile says when (at 8:30 on weekdays, when a to-do is finished, when you are near the office) and which task should run. Start with a ready-made one, or build your own."
                action={<Chip icon="sparkles" label="Browse ready-made" active onPress={() => setRecipes(true)} />}
              />
            )}
            {profiles.length > 0 && data.limits && <Text style={[styles.foot, { color: colors.gray[500] }]}>{profiles.length} of {data.limits.profiles} profiles</Text>}
          </>
        )}

        {data && tab === 'tasks' && (
          <>
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} onEdit={() => openTask(t.id)} onRun={() => runNow(`/automation/tasks/${t.id}/run`, t.name)} onMenu={() => setMenu({ kind: 'task', item: t })} />
            ))}
            {!tasks.length && (
              <EmptyHero icon="list" title="No tasks yet" message="A task is the list of things to do: add a to-do, send a notification, wait, repeat. Profiles run tasks, and tasks can run other tasks." />
            )}
          </>
        )}

        {data && tab === 'vars' && <VariablesTab vars={data.vars} onChanged={load} />}

        {tab === 'activity' && (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {runs && runs.length > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Chip small icon="trash-outline" label="Clear" onPress={async () => { await api.delete('/automation/runs').catch(() => {}); setRuns([]); }} />
              </View>
            )}
            {(runs || []).map((r) => <RunRow key={r.id} run={r} onPress={() => setRunId(r.id)} />)}
            {runs && !runs.length && <EmptyHero icon="time" title="Nothing has run yet" message="Every run is listed here with what each step did, so you can see why something did or did not happen." />}
          </View>
        )}
      </ScrollView>

      {(tab === 'profiles' || tab === 'tasks') && (
        <AnimatedPressable onPress={() => (tab === 'tasks' ? setTaskSheet({ task: null }) : setProfileSheet({ profile: null }))} haptic="light" {...glass('accent')} style={[styles.fab, { bottom: 24 + insets.bottom }]}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.fabText}>{fabLabel}</Text>
        </AnimatedPressable>
      )}

      <ProfileSheet
        visible={!!profileSheet}
        onClose={() => setProfileSheet(null)}
        profile={profileSheet?.profile}
        tasks={tasks}
        globals={globals}
        onSaved={() => load()}
        onTasksChanged={() => load()}
      />
      <TaskEditorSheet visible={!!taskSheet} onClose={() => setTaskSheet(null)} task={taskSheet?.task} tasks={tasks} globals={globals} onSaved={() => load()} />
      <RecipesSheet visible={recipes} onClose={() => setRecipes(false)} onAdded={() => { setTab('profiles'); load(); }} />
      <RunLogSheet visible={!!runId} onClose={() => setRunId(null)} runId={runId} />
      <MoreMenu visible={!!menu} onClose={() => setMenu(null)} title={menu?.item?.name} items={menuItems} onItemPress={onMenuItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, marginTop: 2 },
  tabs: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.xl, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMid: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.md, fontWeight: '800' },
  sentence: { fontSize: fontSize.sm, lineHeight: 19 },
  meta: { fontSize: fontSize.xs },
  iconBtn: { padding: 2 },
  foot: { textAlign: 'center', fontSize: fontSize.xs, marginTop: spacing.lg },
  input: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, fontSize: fontSize.base, outlineStyle: 'none' },
  fab: {
    position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 999,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
});
