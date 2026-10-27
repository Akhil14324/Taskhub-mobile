import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { PrimaryButton } from '../Button';
import { Chip } from '../kit';
import SprintSheet from '../sprints/SprintSheet';
import { formatDue, parseYmd, todayYmd } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';

const POINT_STEPS = [null, 1, 2, 3, 5, 8, 13, 21];
const nextPoints = (current) => POINT_STEPS[(POINT_STEPS.indexOf(current ?? null) + 1) % POINT_STEPS.length];
const pointsLabel = (p) => (p === null || p === undefined ? 'Points?' : `${p} pt${p === 1 ? '' : 's'}`);

/** Whole days from one 'YYYY-MM-DD' to another (no timezone shifts). */
function dayDiff(from, to) {
  const a = parseYmd(from);
  const b = parseYmd(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/**
 * The sprint for one business, shown above its To-do list. Plain words: the current sprint, how far it has got,
 * Start / Finish, and a way to pick backlog work for it. `filter` narrows the list below to this sprint or the backlog.
 */
export default function SprintPanel({ business, filter, onFilter }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { fetchTodos } = useTodos();
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [sheet, setSheet] = useState(null); // 'new' | 'edit' | null
  const [pick, setPick] = useState(null); // Set of backlog task ids while choosing work for the sprint
  const [busy, setBusy] = useState(false);
  const bizId = business.id;
  const canManage = !!business.can_manage;

  const loadList = useCallback(async () => {
    try {
      const res = await api.get('/sprints', { params: { business_id: bizId }, __skipOops: true });
      setList(res.data);
      setSelectedId((prev) => {
        if (res.data.sprints.some((s) => s.id === prev)) return prev;
        const pickNow = res.data.sprints.find((s) => s.status === 'active') || res.data.sprints.find((s) => s.status === 'planned');
        return pickNow ? pickNow.id : null;
      });
    } catch {
      setList({ sprints: [] });
    }
  }, [bizId]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return setDetail(null);
    try {
      const res = await api.get(`/sprints/${id}`, { __skipOops: true });
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => { setList(null); setDetail(null); setSelectedId(null); loadList(); }, [loadList]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  /** Runs a change to the sprint, then refreshes this panel and the to-do list. */
  const change = async (request, message) => {
    setBusy(true);
    try {
      const res = await request();
      if (res.data?.sprint) setDetail(res.data);
      if (message) showToast({ message, icon: 'flag' });
      await loadList();
      await loadDetail(selectedId);
      await fetchTodos();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not update the sprint', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const sprint = detail?.sprint || null;
  const sprints = list?.sprints || [];
  const percent = sprint && sprint.total_points > 0
    ? Math.round((sprint.done_points / sprint.total_points) * 100)
    : sprint && sprint.task_count > 0 ? Math.round((sprint.done_count / sprint.task_count) * 100) : 0;
  const daysLeft = sprint ? dayDiff(todayYmd(), sprint.ends_on) : 0;

  const start = () => change(() => api.post(`/sprints/${sprint.id}/start`), 'Sprint started');
  const finish = async () => {
    const ok = await confirmDialog({
      title: `Finish ${sprint.name}?`,
      message: 'Open tasks go back to the backlog. Finished points are kept.',
      confirmLabel: 'Finish',
    });
    if (ok) change(() => api.post(`/sprints/${sprint.id}/complete`), 'Sprint finished');
  };
  const addPicked = () => {
    const ids = [...(pick || [])];
    if (!ids.length) return;
    change(async () => {
      const res = await api.post(`/sprints/${sprint.id}/tasks`, { todo_ids: ids });
      if (res.data.skipped) showToast({ message: `${res.data.skipped} could not be added`, icon: 'alert-circle' });
      return res;
    }, `${ids.length} added to ${sprint.name}`);
    setPick(null);
  };
  const bumpPoints = (task) => api.put(`/sprints/tasks/${task.id}/points`, { story_points: nextPoints(task.story_points) })
    .then(() => change(() => api.get(`/sprints/${sprint.id}`)));

  // Nothing planned yet: just offer to plan one.
  if (list && !sprints.length) {
    return (
      <View style={styles.bar}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>No sprint yet</Text>
          <Text style={styles.hint}>Plan a sprint to pick the work for the next few weeks.</Text>
        </View>
        {canManage && <Chip small icon="add" label="Plan a sprint" active onPress={() => setSheet('new')} />}
        <SprintSheet visible={sheet !== null} onClose={() => setSheet(null)} businessId={bizId} sprint={null}
          onSaved={(data) => { setSelectedId(data.sprint.id); setDetail(data); loadList(); fetchTodos(); }} />
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      {sprints.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {sprints.map((s) => (
            <Chip key={s.id} small label={`${s.name} · ${s.status === 'active' ? 'Running' : s.status === 'planned' ? 'Planned' : 'Finished'}`} active={selectedId === s.id} onPress={() => setSelectedId(s.id)} />
          ))}
        </ScrollView>
      )}

      {sprint && (
        <>
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={1}>{sprint.name}</Text>
              <Text style={styles.hint}>
                {sprint.status === 'planned' ? `Starts ${formatDue(sprint.starts_on)}` : sprint.status === 'active' ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Finished'}
                {' · '}{sprint.done_count} of {sprint.task_count} done
                {sprint.total_points > 0 ? ` · ${sprint.done_points} of ${sprint.total_points} points` : ''}
              </Text>
            </View>
            <View style={styles.meter}><View style={[styles.meterFill, { width: `${percent}%` }]} /></View>
            <Text style={styles.percent}>{percent}%</Text>
          </View>
          {!!sprint.goal && <Text style={styles.goal}>{sprint.goal}</Text>}

          <View style={styles.row}>
            <Chip small label="All work" active={!filter} onPress={() => onFilter(null)} />
            <Chip small label="This sprint" active={filter?.kind === 'sprint' && filter.key === sprint.id} onPress={() => onFilter({ kind: 'sprint', key: sprint.id })} />
            <Chip small label="Backlog" active={filter?.kind === 'sprint' && filter.key === 'backlog'} onPress={() => onFilter({ kind: 'sprint', key: 'backlog' })} />
            {canManage && sprint.status === 'planned' && <Chip small icon="play" label="Start sprint" active onPress={start} />}
            {canManage && sprint.status === 'active' && <Chip small icon="checkmark-done" label="Finish sprint" active onPress={finish} />}
            {canManage && sprint.status !== 'completed' && <Chip small icon="add" label="Add from backlog" onPress={() => setPick(new Set())} />}
            {canManage && <Chip small icon="create-outline" label="Edit sprint" onPress={() => setSheet('edit')} />}
            {canManage && <Chip small icon="add-circle-outline" label="New sprint" onPress={() => setSheet('new')} />}
          </View>

        </>
      )}

      <SprintSheet visible={sheet !== null} onClose={() => setSheet(null)} businessId={bizId} sprint={sheet === 'edit' ? sprint : null}
        onSaved={(data) => { setSelectedId(data.sprint.id); setDetail(data); loadList(); fetchTodos(); }} />

      <BottomSheet visible={!!pick} onClose={() => setPick(null)} maxHeight={560}>
        <View style={styles.pickWrap}>
          <Text style={styles.title}>Add from backlog</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {(detail?.backlog || []).map((t) => {
              const on = pick?.has(t.id);
              return (
                <View key={t.id} style={styles.pickRow}>
                  <AnimatedPressable
                    onPress={() => setPick((prev) => { const next = new Set(prev); if (next.has(t.id)) next.delete(t.id); else next.add(t.id); return next; })}
                    style={styles.pickMain}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? colors.brand[600] : colors.gray[400]} />
                    <Text style={styles.pickTitle} numberOfLines={1}>{t.title}</Text>
                  </AnimatedPressable>
                  <Chip small label={pointsLabel(t.story_points)} onPress={() => bumpPoints(t)} />
                </View>
              );
            })}
            {!(detail?.backlog || []).length && <Text style={styles.hint}>The backlog is empty.</Text>}
          </ScrollView>
          <PrimaryButton onPress={addPicked} loading={busy} disabled={!pick?.size}>{`Add ${pick?.size || 0} to sprint`}</PrimaryButton>
        </View>
      </BottomSheet>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  bar: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, gap: spacing.sm, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: 11, color: colors.gray[500] },
  goal: { fontSize: fontSize.sm, color: colors.gray[700] },
  meter: { width: 80, height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' },
  meterFill: { height: 6, backgroundColor: colors.brand[500] },
  percent: { fontSize: fontSize.xs, fontWeight: '800', color: colors.gray[700], minWidth: 34, textAlign: 'right' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  pickWrap: { padding: spacing.lg, gap: spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 8 },
  pickMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pickTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
});
