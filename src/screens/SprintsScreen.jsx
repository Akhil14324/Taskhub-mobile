import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Chip, EmptyHero, ProgressRing } from '../components/kit';
import SprintSheet from '../components/sprints/SprintSheet';
import { formatDue } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', in_review: 'In review', on_hold: 'On hold', done: 'Done' };
const COLUMN_ORDER = ['todo', 'in_progress', 'blocked', 'in_review', 'on_hold', 'done'];
const SPRINT_STATUS = { planned: 'Planned', active: 'Active', completed: 'Completed' };
// Points are tapped through this scale; null means not estimated yet.
const POINT_STEPS = [null, 1, 2, 3, 5, 8, 13, 21];

const nextPoints = (current) => {
  const i = POINT_STEPS.indexOf(current ?? null);
  return POINT_STEPS[(i + 1) % POINT_STEPS.length];
};
const pointsLabel = (p) => (p === null || p === undefined ? 'Estimate' : `${p} pt${p === 1 ? '' : 's'}`);

/** Remaining points against the ideal line, one bar per day. */
function Burndown({ days }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const top = Math.max(1, ...days.map((d) => Math.max(d.ideal, d.remaining ?? 0)));
  const height = 96;
  return (
    <View style={styles.burnCard}>
      <View style={[styles.burnRow, { height }]}>
        {days.map((d) => {
          const remainingH = d.remaining === null ? 0 : Math.round((d.remaining / top) * height);
          const idealH = Math.round((d.ideal / top) * height);
          return (
            <View key={d.date} style={styles.burnCol}>
              <View style={[styles.burnIdeal, { bottom: idealH }]} />
              <View style={[styles.burnBar, { height: remainingH, opacity: d.remaining === null ? 0 : 1 }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.burnLegend}>
        <Text style={styles.hint}>{formatDue(days[0].date)}</Text>
        <Text style={styles.hint}>Bars: points left · line: ideal pace</Text>
        <Text style={styles.hint}>{formatDue(days[days.length - 1].date)}</Text>
      </View>
    </View>
  );
}

function TaskRow({ task, canManage, onPoints, onRemove, onAdd }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.taskRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          {[STATUS_LABEL[task.is_done ? 'done' : task.status], task.assignee_name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {canManage && onPoints ? (
        <Chip small label={pointsLabel(task.story_points)} active={task.story_points !== null && task.story_points !== undefined} onPress={() => onPoints(task)} />
      ) : (
        <Text style={styles.hint}>{task.story_points === null || task.story_points === undefined ? '' : pointsLabel(task.story_points)}</Text>
      )}
      {onRemove && (
        <AnimatedPressable onPress={() => onRemove(task)} hitSlop={8} accessibilityLabel="Take back to backlog">
          <Ionicons name="remove-circle-outline" size={20} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
      {onAdd && (
        <AnimatedPressable onPress={() => onAdd(task)} hitSlop={8} accessibilityLabel="Add to sprint">
          <Ionicons name="add-circle" size={22} color={colors.brand[600]} />
        </AnimatedPressable>
      )}
    </View>
  );
}

export default function SprintsScreen({ embedded = false }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [businessId, setBusinessId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(null); // 'new' | 'edit' | null

  const load = useCallback(async (bizId) => {
    try {
      const res = await api.get('/sprints', { params: bizId ? { business_id: bizId } : undefined, __skipOops: true });
      const data = res.data;
      setList(data);
      setError(null);
      setBusinessId(data.business?.id ?? null);
      const pick = data.sprints.find((s) => s.status === 'active') || data.sprints.find((s) => s.status === 'planned') || data.sprints[0] || null;
      setSelectedId((prev) => (data.sprints.some((s) => s.id === prev) ? prev : pick?.id ?? null));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load sprints');
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) return setDetail(null);
    try {
      const res = await api.get(`/sprints/${id}`, { __skipOops: true });
      setDetail(res.data);
    } catch (err) {
      setDetail(null);
      showToast({ message: err.response?.data?.error || 'Could not open the sprint', icon: 'alert-circle' });
    }
  }, []);

  useFocusEffect(useCallback(() => { load(businessId); }, [load, businessId]));
  useFocusEffect(useCallback(() => { loadDetail(selectedId); }, [loadDetail, selectedId]));

  const refresh = async () => {
    await load(businessId);
    await loadDetail(selectedId);
  };

  /** Runs a change and shows the fresh sprint. */
  const change = async (request, message) => {
    try {
      const res = await request();
      if (res.data?.sprint) setDetail(res.data);
      if (message) showToast({ message, icon: 'flag' });
      await load(businessId);
      if (!res.data?.sprint && selectedId) await loadDetail(selectedId);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not update', icon: 'alert-circle' });
    }
  };

  const sprint = detail?.sprint || null;
  const canManage = !!detail?.can_manage;
  const columns = useMemo(() => {
    if (!detail) return [];
    const groups = Object.fromEntries(COLUMN_ORDER.map((k) => [k, []]));
    for (const t of detail.tasks) groups[t.is_done ? 'done' : (t.status in groups ? t.status : 'todo')].push(t);
    return COLUMN_ORDER.map((k) => ({ key: k, label: STATUS_LABEL[k], tasks: groups[k] })).filter((c) => c.tasks.length);
  }, [detail]);

  const start = () => change(() => api.post(`/sprints/${sprint.id}/start`), 'Sprint started');
  const complete = async () => {
    const ok = await confirmDialog({
      title: `Complete ${sprint.name}?`,
      message: 'Unfinished tasks go back to the backlog. Finished points are kept for velocity.',
      confirmLabel: 'Complete',
    });
    if (ok) change(() => api.post(`/sprints/${sprint.id}/complete`), 'Sprint completed');
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: `Delete ${sprint.name}?`, message: 'Its tasks go back to the backlog.', confirmLabel: 'Delete', destructive: true });
    if (ok) {
      try {
        await api.delete(`/sprints/${sprint.id}`);
        setSelectedId(null);
        setDetail(null);
        await load(businessId);
      } catch (err) {
        showToast({ message: err.response?.data?.error || 'Could not delete', icon: 'alert-circle' });
      }
    }
  };

  const percent = sprint && sprint.total_points > 0
    ? Math.round((sprint.done_points / sprint.total_points) * 100)
    : sprint && sprint.task_count > 0 ? Math.round((sprint.done_count / sprint.task_count) * 100) : 0;

  const businesses = list?.businesses || [];
  const velocity = list?.velocity;

  return (
    <View style={[styles.container, { paddingTop: embedded ? 0 : insets.top }]}>
      {!embedded && (
        <View style={styles.header}>
          <BackTitle title="Sprints" style={styles.title} />
          <Text style={styles.subtitle}>Plan a business's work in time-boxed sprints</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} />}
      >
        {!list && !error && <SkeletonList count={3} type="notification" />}
        {!!error && <EmptyHero icon="alert-circle" title="Could not load" message={error} />}

        {list && !businesses.length && (
          <EmptyHero icon="speedometer" title="No business yet" message="Sprints are planned for a business. Join one to see its sprints." />
        )}

        {businesses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {businesses.map((b) => (
              <Chip key={b.id} small icon="business" label={b.name} active={businessId === b.id} onPress={() => { setBusinessId(b.id); setSelectedId(null); load(b.id); }} />
            ))}
          </ScrollView>
        )}

        {list && businesses.length > 0 && (
          <>
            {list.sprints.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {list.sprints.map((s) => (
                  <Chip key={s.id} small icon={s.status === 'active' ? 'play' : s.status === 'completed' ? 'checkmark-done' : 'calendar'} label={`${s.name} · ${SPRINT_STATUS[s.status]}`} active={selectedId === s.id} onPress={() => setSelectedId(s.id)} />
                ))}
              </ScrollView>
            )}

            {sprint ? (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <ProgressRing percent={percent} size={52} stroke={6}>
                    <Text style={styles.ringText}>{percent}%</Text>
                  </ProgressRing>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{sprint.name}</Text>
                    <Text style={styles.hint}>
                      {SPRINT_STATUS[sprint.status]} · {formatDue(sprint.starts_on)} to {formatDue(sprint.ends_on)}
                    </Text>
                    <Text style={styles.hint}>
                      {sprint.done_count} of {sprint.task_count} tasks · {sprint.done_points} of {sprint.total_points} points
                    </Text>
                  </View>
                </View>
                {!!sprint.goal && <Text style={styles.goal}>{sprint.goal}</Text>}

                {canManage && (
                  <View style={styles.actions}>
                    {sprint.status === 'planned' && <Chip small icon="play" label="Start sprint" active onPress={start} />}
                    {sprint.status === 'active' && <Chip small icon="checkmark-done" label="Complete sprint" active onPress={complete} />}
                    <Chip small icon="create" label="Edit" onPress={() => setSheet('edit')} />
                    {sprint.status !== 'active' && <Chip small icon="trash" label="Delete" onPress={remove} />}
                  </View>
                )}

                {detail.burndown && detail.burndown.length > 0 && <Burndown days={detail.burndown} />}
              </View>
            ) : (
              list.sprints.length === 0 && (
                <EmptyHero icon="speedometer" title="No sprint yet" message="Plan a sprint, pick the work for it from the backlog and start it." />
              )
            )}

            {detail && (
              <>
                <Text style={styles.section}>Sprint board</Text>
                {!detail.tasks.length && <Text style={styles.empty}>No tasks in this sprint yet. Add some from the backlog below.</Text>}
                {columns.map((c) => (
                  <View key={c.key} style={styles.column}>
                    <Text style={styles.columnHead}>{c.label} · {c.tasks.length}</Text>
                    {c.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        canManage={canManage && sprint.status !== 'completed'}
                        onPoints={(task) => change(() => api.put(`/sprints/tasks/${task.id}/points`, { story_points: nextPoints(task.story_points) }))}
                        onRemove={canManage && sprint.status !== 'completed' ? (task) => change(() => api.delete(`/sprints/${sprint.id}/tasks/${task.id}`)) : undefined}
                      />
                    ))}
                  </View>
                ))}

                {sprint.status !== 'completed' && (
                  <>
                    <Text style={styles.section}>Backlog</Text>
                    {!detail.backlog.length && <Text style={styles.empty}>Nothing waiting. Business tasks that are not in a sprint appear here.</Text>}
                    {detail.backlog.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        canManage={canManage}
                        onPoints={(task) => change(() => api.put(`/sprints/tasks/${task.id}/points`, { story_points: nextPoints(task.story_points) }))}
                        onAdd={canManage ? (task) => change(() => api.post(`/sprints/${sprint.id}/tasks`, { todo_ids: [task.id] })) : undefined}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {list.sprints.length > 0 && (
              <>
                <Text style={styles.section}>Velocity</Text>
                <Text style={styles.empty}>
                  {velocity?.average === null || velocity?.average === undefined
                    ? 'No completed sprint yet. Velocity appears once one is completed.'
                    : `About ${velocity.average} points per sprint, over your last ${Math.min(3, velocity.completed.length)} completed sprint${velocity.completed.length === 1 ? '' : 's'}.`}
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>

      {canManage && list && (
        <AnimatedPressable onPress={() => setSheet('new')} haptic="light" style={[styles.fab, { bottom: 24 + insets.bottom }]}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.fabText}>New sprint</Text>
        </AnimatedPressable>
      )}

      <SprintSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        businessId={businessId}
        sprint={sheet === 'edit' ? sprint : null}
        onSaved={(data) => {
          setDetail(data);
          setSelectedId(data.sprint.id);
          load(businessId);
        }}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  ringText: { fontSize: 12, fontWeight: '800', color: colors.gray[900] },
  goal: { fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { fontSize: 11, color: colors.gray[500] },
  burnCard: { gap: 4, marginTop: spacing.sm },
  burnRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  burnCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  burnBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.brand[500] },
  burnIdeal: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.gray[400] },
  burnLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500], marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.xs },
  column: { marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: 4 },
  columnHead: { fontSize: fontSize.xs, fontWeight: '800', color: colors.brand[700] },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], marginHorizontal: spacing.lg, marginTop: 4 },
  taskTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  empty: { fontSize: fontSize.sm, color: colors.gray[500], marginHorizontal: spacing.lg, lineHeight: 20 },
  fab: {
    position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 999, backgroundColor: colors.brand[600], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
});
