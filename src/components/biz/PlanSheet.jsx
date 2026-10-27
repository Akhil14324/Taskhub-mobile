import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, fontSize } from '../../theme/theme';
import BottomSheet from '../BottomSheet';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import PersonSheet from './PersonSheet';
import { POINT_STEPS, TYPE_LABEL, TYPE_ICON } from './ui';
import useWorkspace from '../../hooks/useWorkspace';
import { useSprintList } from '../../hooks/useSprints';
import { showToast } from '../../utils/events';

/** "Feature · 5 pts · Sprint 14 · Onboarding" for a business task, or null when nothing is planned yet. */
export function planSummary(todo) {
  const parts = [];
  if (todo.item_type && todo.item_type !== 'task') parts.push(TYPE_LABEL[todo.item_type]);
  if (todo.story_points !== null && todo.story_points !== undefined) parts.push(`${todo.story_points} pt${todo.story_points === 1 ? '' : 's'}`);
  if (todo.sprint_name) parts.push(todo.sprint_name);
  if (todo.epic_name) parts.push(todo.epic_name);
  if (todo.release_name) parts.push(todo.release_name);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Plan business tasks. With one task (`ids` of one) the sheet shows what it has now; with several, nothing is
 * selected and only what you touch is changed.
 */
export default function PlanSheet({ visible, onClose, businessId, ids, current, onDone }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { fetchTodos } = useTodos();
  const { data: workspace } = useWorkspace(visible ? businessId : null);
  const { data: sprintData } = useSprintList(visible ? businessId : null);
  const single = ids.length === 1 && !!current;
  const [patch, setPatch] = useState({});
  const [assignee, setAssignee] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setPatch({}); setAssignee(null); setPicking(false); } }, [visible]);

  const value = (key) => (key in patch ? patch[key] : (single ? current[key] ?? null : undefined));
  const set = (key, v) => setPatch((p) => ({ ...p, [key]: v }));
  const sprints = (sprintData?.sprints || []).filter((s) => s.status !== 'completed');
  const epics = (workspace?.epics || []).filter((e) => e.status === 'open' || e.id === value('epic_id'));
  const releases = (workspace?.releases || []).filter((r) => r.stage !== 'released' || r.id === value('release_id'));
  const changed = Object.keys(patch).length > 0 || !!assignee;

  const save = async () => {
    setBusy(true);
    try {
      if (Object.keys(patch).length) {
        if (single) await api.put(`/workspace/items/${ids[0]}`, patch);
        else await api.post('/workspace/items/bulk', { ids, patch });
      }
      if (assignee) await api.post('/workspace/reassign', { ids, user_id: assignee.id });
      await fetchTodos();
      showToast({ message: single ? 'Plan saved' : `${ids.length} tasks updated`, icon: 'speedometer' });
      onDone?.();
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the plan', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={680}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{single ? 'Plan this task' : `Plan ${ids.length} tasks`}</Text>
        {!single && <Text style={styles.hint}>Only what you pick is changed.</Text>}

        <Text style={styles.label}>Kind of work</Text>
        <View style={styles.row}>
          {Object.keys(TYPE_LABEL).map((k) => (
            <Chip key={k} small icon={TYPE_ICON[k]} label={TYPE_LABEL[k]} active={value('item_type') === k} onPress={() => set('item_type', k)} />
          ))}
        </View>

        <Text style={styles.label}>Points (how big it is)</Text>
        <View style={styles.row}>
          {POINT_STEPS.map((p) => (
            <Chip key={String(p)} small label={p === null ? 'None' : String(p)} active={value('story_points') === p && (single || 'story_points' in patch)} onPress={() => set('story_points', p)} />
          ))}
        </View>

        <Text style={styles.label}>Sprint</Text>
        <View style={styles.row}>
          <Chip small label="Backlog" active={value('sprint_id') === null && (single || 'sprint_id' in patch)} onPress={() => set('sprint_id', null)} />
          {sprints.map((s) => <Chip key={s.id} small icon={s.status === 'active' ? 'play' : 'calendar-outline'} label={s.name} active={value('sprint_id') === s.id} onPress={() => set('sprint_id', s.id)} />)}
        </View>

        <Text style={styles.label}>Epic</Text>
        <View style={styles.row}>
          <Chip small label="No epic" active={value('epic_id') === null && (single || 'epic_id' in patch)} onPress={() => set('epic_id', null)} />
          {epics.map((e) => <Chip key={e.id} small icon="layers-outline" label={e.name} active={value('epic_id') === e.id} onPress={() => set('epic_id', e.id)} />)}
        </View>
        {!epics.length && <Text style={styles.hint}>No epics yet. Make one in the Epics tab.</Text>}

        <Text style={styles.label}>Release</Text>
        <View style={styles.row}>
          <Chip small label="No release" active={value('release_id') === null && (single || 'release_id' in patch)} onPress={() => set('release_id', null)} />
          {releases.map((r) => <Chip key={r.id} small icon="rocket-outline" label={r.name} active={value('release_id') === r.id} onPress={() => set('release_id', r.id)} />)}
        </View>
        {!releases.length && <Text style={styles.hint}>No releases yet. Plan one in the Releases tab.</Text>}

        {!single && (
          <>
            <Text style={styles.label}>Give to</Text>
            <View style={styles.row}>
              <Chip small icon="person-outline" label={assignee ? assignee.name : 'Leave with the same people'} active={!!assignee} onPress={() => setPicking(true)} />
              {!!assignee && <Chip small icon="close" label="Clear" onPress={() => setAssignee(null)} />}
            </View>
          </>
        )}

        <PrimaryButton onPress={save} loading={busy} disabled={!changed} style={{ marginTop: spacing.lg }}>Save</PrimaryButton>
      </ScrollView>
      <PersonSheet visible={picking} onClose={() => setPicking(false)} businessId={businessId} title="Give these tasks to" onPick={setAssignee} />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 4 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: 11, color: colors.gray[500] },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginTop: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
});
