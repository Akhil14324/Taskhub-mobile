import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { PrimaryButton } from '../Button';
import { SkeletonList } from '../Skeleton';
import { Chip, EmptyHero } from '../kit';
import SprintSheet from '../sprints/SprintSheet';
import PersonSheet from './PersonSheet';
import { Burndown } from './charts';
import { Card, Heading, Note, Meter, nextPoints, pointsLabel, TYPE_ICON, sprintTiming } from './ui';
import { useSprintList, useSprintDetail, defaultSprintId } from '../../hooks/useSprints';
import { formatDue } from '../../utils/dates';
import { STATUS } from '../../utils/timeline';
import { showToast, confirmDialog } from '../../utils/events';

const CAPACITY_TEXT = {
  over: 'That is more than your team usually finishes. Move something to the backlog, or hand work to someone with room.',
  ok: 'About what your team usually finishes.',
  under: 'There is room for more.',
  unknown: 'Finish a sprint and TaskHub will show what your team usually gets done.',
};

function TaskLine({ task, canPlan, onPoints, onRemove, onToggle, checked }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.line}>
      {onToggle && (
        <AnimatedPressable onPress={onToggle} hitSlop={6}>
          <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={19} color={checked ? colors.brand[600] : colors.gray[400]} />
        </AnimatedPressable>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.lineTitle, task.is_done && styles.done]} numberOfLines={2}>{task.title}</Text>
        <View style={styles.meta}>
          {task.item_type && task.item_type !== 'task' && <Ionicons name={TYPE_ICON[task.item_type]} size={11} color={colors.gray[500]} />}
          <Text style={styles.hint} numberOfLines={1}>
            {[task.is_done ? 'Done' : STATUS[task.status]?.label, task.assignee_name].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {canPlan ? (
        <Chip small label={pointsLabel(task.story_points)} active={task.story_points !== null && task.story_points !== undefined} onPress={onPoints} />
      ) : (
        task.story_points !== null && task.story_points !== undefined && <Text style={styles.hint}>{pointsLabel(task.story_points)}</Text>
      )}
      {onRemove && (
        <AnimatedPressable onPress={onRemove} hitSlop={8} accessibilityLabel="Take back to the backlog">
          <Ionicons name="remove-circle-outline" size={20} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </View>
  );
}

/** Plan a business's sprint: what is in it, whether it is too much, who carries what, and how it is going. */
export default function SprintTab({ business, onShowBoard }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { fetchTodos } = useTodos();
  const { data: list, reload: reloadList } = useSprintList(business.id);
  const [selectedId, setSelectedId] = useState(null);
  const { detail, setDetail, reload: reloadDetail } = useSprintDetail(selectedId);
  const [sheet, setSheet] = useState(null); // 'new' | 'edit' | null
  const [picked, setPicked] = useState(() => new Set());
  const [handFrom, setHandFrom] = useState(null);
  const [busy, setBusy] = useState(false);
  const canManage = !!business.can_manage;

  useEffect(() => {
    if (!list) return;
    setSelectedId((prev) => (list.sprints.some((s) => s.id === prev) ? prev : defaultSprintId(list.sprints)));
  }, [list]);
  useEffect(() => { setPicked(new Set()); }, [selectedId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([reloadList(), reloadDetail(), fetchTodos()]);
  }, [reloadList, reloadDetail, fetchTodos]);

  const change = async (request, message) => {
    setBusy(true);
    try {
      const res = await request();
      if (res.data?.sprint) setDetail(res.data);
      if (message) showToast({ message, icon: 'flag' });
      await refreshAll();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not update the sprint', icon: 'alert-circle' });
    } finally {
      setBusy(false);
    }
  };

  const sprint = detail?.sprint || null;
  const sprints = list?.sprints || [];
  const editable = canManage && sprint && sprint.status !== 'completed';
  const percent = sprint && sprint.total_points > 0
    ? Math.round((sprint.done_points / sprint.total_points) * 100)
    : sprint && sprint.task_count > 0 ? Math.round((sprint.done_count / sprint.task_count) * 100) : 0;

  const setPoints = (task) => change(() => api.put(`/workspace/items/${task.id}`, { story_points: nextPoints(task.story_points) }));
  const start = () => change(() => api.post(`/sprints/${sprint.id}/start`), 'Sprint started');
  const finish = async () => {
    const ok = await confirmDialog({ title: `Finish ${sprint.name}?`, message: 'Open tasks go back to the backlog. Finished points are kept.', confirmLabel: 'Finish' });
    if (ok) change(() => api.post(`/sprints/${sprint.id}/complete`), 'Sprint finished');
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: `Delete ${sprint.name}?`, message: 'Its tasks go back to the backlog.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/sprints/${sprint.id}`);
      setSelectedId(null);
      await Promise.all([reloadList(), fetchTodos()]);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete the sprint', icon: 'alert-circle' });
    }
  };
  const addPicked = () => {
    const ids = [...picked];
    if (!ids.length) return;
    change(async () => {
      const res = await api.post(`/sprints/${sprint.id}/tasks`, { todo_ids: ids });
      if (res.data.skipped) showToast({ message: `${res.data.skipped} could not be added`, icon: 'alert-circle' });
      return res;
    }, `${ids.length} added to ${sprint.name}`);
    setPicked(new Set());
  };
  const handOver = async (to) => {
    const from = handFrom;
    setHandFrom(null);
    if (!from || !to) return;
    const ok = await confirmDialog({
      title: `Hand ${from.name}'s work to ${to.name}?`,
      message: `All the open tasks ${from.name} has in ${business.name} move to ${to.name}. They are told, and work that was under way goes back to To do.`,
      confirmLabel: 'Hand over',
    });
    if (!ok) return;
    change(
      () => api.post('/workspace/reassign', { business_id: business.id, from_user_id: from.user_id, user_id: to.id }),
      `Work handed to ${to.name}`
    );
  };

  const capacity = detail?.capacity;
  const perPerson = capacity && capacity.people.length > 0 ? capacity.planned_points / capacity.people.length : 0;
  const peopleTop = Math.max(1, ...(capacity?.people || []).map((p) => p.points));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {sprints.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {sprints.map((s) => (
            <Chip key={s.id} small label={s.name} icon={s.status === 'active' ? 'play' : s.status === 'completed' ? 'checkmark-done' : 'calendar-outline'} active={selectedId === s.id} onPress={() => setSelectedId(s.id)} />
          ))}
          {canManage && <Chip small icon="add" label="New sprint" onPress={() => setSheet('new')} />}
        </ScrollView>
      )}

      {(!list || (selectedId && !detail)) && <SkeletonList count={3} type="notification" />}

      {list && !sprints.length && (
        <>
          <EmptyHero icon="speedometer" title="No sprint yet" message="A sprint is a few weeks of focused work. Pick the tasks, start it, and watch it burn down." />
          {canManage && <View style={{ alignItems: 'center' }}><PrimaryButton onPress={() => setSheet('new')}>Plan a sprint</PrimaryButton></View>}
        </>
      )}

      {sprint && (
        <>
          <Card>
            <Text style={styles.title}>{sprint.name}</Text>
            <Text style={styles.hint}>{formatDue(sprint.starts_on)} to {formatDue(sprint.ends_on)} · {sprintTiming(sprint)}</Text>
            {!!sprint.goal && <Text style={styles.goal}>{sprint.goal}</Text>}
            <Meter percent={percent} />
            <Text style={styles.hint}>
              {sprint.done_count} of {sprint.task_count} tasks done
              {sprint.total_points > 0 ? ` · ${sprint.done_points} of ${sprint.total_points} points` : ''}
            </Text>
            <View style={styles.row}>
              <Chip small icon="grid-outline" label="Open board" onPress={() => onShowBoard(sprint)} />
              {canManage && sprint.status === 'planned' && <Chip small icon="play" label="Start sprint" active onPress={start} />}
              {canManage && sprint.status === 'active' && <Chip small icon="checkmark-done" label="Finish sprint" active onPress={finish} />}
              {canManage && <Chip small icon="create-outline" label="Edit" onPress={() => setSheet('edit')} />}
              {canManage && sprint.status !== 'active' && <Chip small icon="trash-outline" label="Delete" onPress={remove} />}
            </View>
          </Card>

          {capacity && sprint.status !== 'completed' && (
            <>
              <Heading>Is it too much?</Heading>
              <Card>
                <View style={styles.capacityTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.big}>{capacity.planned_points} points planned</Text>
                    <Text style={styles.hint}>
                      {capacity.velocity_average === null ? 'No finished sprint yet' : `Your team usually finishes ${capacity.velocity_average}`}
                    </Text>
                  </View>
                  {capacity.level !== 'unknown' && (
                    <View style={[styles.levelTag, capacity.level === 'over' && styles.levelOver]}>
                      <Text style={[styles.levelText, capacity.level === 'over' && { color: colors.brand[700] }]}>
                        {capacity.level === 'over' ? 'Too much' : capacity.level === 'under' ? 'Room left' : 'About right'}
                      </Text>
                    </View>
                  )}
                </View>
                <Note>{CAPACITY_TEXT[capacity.level]}</Note>
                {capacity.people.map((p) => (
                  <View key={p.user_id || 'none'} style={{ gap: 3, marginTop: 4 }}>
                    <View style={styles.personRow}>
                      <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.hint}>{p.points} pts · {p.tasks} task{p.tasks === 1 ? '' : 's'}</Text>
                      {canManage && !!p.user_id && (
                        <AnimatedPressable onPress={() => setHandFrom(p)} hitSlop={8} accessibilityLabel={`Hand over ${p.name}'s work`}>
                          <Ionicons name="swap-horizontal" size={18} color={colors.brand[600]} />
                        </AnimatedPressable>
                      )}
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round((p.points / peopleTop) * 100)}%`, backgroundColor: capacity.people.length > 1 && p.points > perPerson * 1.4 ? colors.brand[700] : colors.brand[400] }]} />
                    </View>
                  </View>
                ))}
                {canManage && capacity.people.length > 1 && <Text style={styles.hint}>Tap the arrows to hand a person's open work to someone else.</Text>}
              </Card>
            </>
          )}

          {detail.burndown && detail.burndown.length > 0 && (
            <>
              <Heading>How it is going</Heading>
              <Card><Burndown days={detail.burndown} /></Card>
            </>
          )}

          <Heading>In this sprint</Heading>
          <Card>
            {!detail.tasks.length && <Note>Nothing yet. Pick tasks from the backlog below.</Note>}
            {detail.tasks.map((t) => (
              <TaskLine
                key={t.id}
                task={t}
                canPlan={canManage}
                onPoints={() => setPoints(t)}
                onRemove={editable ? () => change(() => api.delete(`/sprints/${sprint.id}/tasks/${t.id}`)) : undefined}
              />
            ))}
          </Card>

          {sprint.status !== 'completed' && (
            <>
              <Heading>Backlog</Heading>
              <Card>
                {!detail.backlog.length && <Note>Nothing waiting. Business tasks that are not in a sprint show up here.</Note>}
                {detail.backlog.map((t) => (
                  <TaskLine
                    key={t.id}
                    task={t}
                    canPlan={canManage}
                    onPoints={() => setPoints(t)}
                    checked={picked.has(t.id)}
                    onToggle={editable ? () => setPicked((prev) => { const next = new Set(prev); if (next.has(t.id)) next.delete(t.id); else next.add(t.id); return next; }) : undefined}
                  />
                ))}
                {editable && detail.backlog.length > 0 && (
                  <PrimaryButton onPress={addPicked} loading={busy} disabled={!picked.size} style={{ marginTop: spacing.sm }}>
                    {picked.size ? `Add ${picked.size} to ${sprint.name}` : 'Tick tasks to add them'}
                  </PrimaryButton>
                )}
              </Card>
            </>
          )}
        </>
      )}

      <SprintSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        businessId={business.id}
        sprint={sheet === 'edit' ? sprint : null}
        onSaved={(data) => { setSelectedId(data.sprint.id); setDetail(data); reloadList(); fetchTodos(); }}
      />
      <PersonSheet
        visible={!!handFrom}
        onClose={() => setHandFrom(null)}
        businessId={business.id}
        title={handFrom ? `Hand ${handFrom.name}'s work to` : ''}
        excludeIds={handFrom ? [handFrom.user_id] : []}
        onPick={handOver}
      />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  goal: { fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 19 },
  hint: { fontSize: 11, color: colors.gray[500] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
  capacityTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  big: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  levelTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  levelOver: { backgroundColor: colors.brand[100] },
  levelText: { fontSize: 11, fontWeight: '800', color: colors.gray[700] },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personName: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  track: { height: 7, borderRadius: 4, backgroundColor: colors.gray[200], overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  lineTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  done: { textDecorationLine: 'line-through', color: colors.gray[400] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
