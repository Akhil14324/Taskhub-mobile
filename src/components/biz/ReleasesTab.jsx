import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { PrimaryButton } from '../Button';
import { SkeletonList } from '../Skeleton';
import { Chip, EmptyHero } from '../kit';
import WorkItemSheet, { RELEASE_STAGES } from './WorkItemSheet';
import { Card, Meter } from './ui';
import useWorkspace from '../../hooks/useWorkspace';
import { formatDue, daysFromToday } from '../../utils/dates';
import { showToast } from '../../utils/events';

/** Releases: what the business ships, which stage each is in, and how much of it is finished. */
export default function ReleasesTab({ business, onShowTasks }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, apply } = useWorkspace(business.id);
  const [editing, setEditing] = useState(null);
  const canManage = !!business.can_manage;
  const releases = data?.releases || [];

  const moveTo = async (release, stage) => {
    try {
      const res = await api.put(`/workspace/releases/${release.id}`, { stage });
      apply(res.data);
      if (stage === 'released') showToast({ message: `${release.name} is released`, icon: 'rocket' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change the stage', icon: 'alert-circle' });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.bar}>
        <View style={{ flex: 1 }} />
        {canManage && <Chip small icon="add" label="New release" active onPress={() => setEditing('new')} />}
      </View>

      {!data && <SkeletonList count={2} type="notification" />}
      {data && !releases.length && (
        <>
          <EmptyHero icon="rocket" title="No releases yet" message="A release is something you ship. Add tasks to it and move it from planning to building, testing and released." />
          {canManage && <View style={{ alignItems: 'center' }}><PrimaryButton onPress={() => setEditing('new')}>Plan a release</PrimaryButton></View>}
        </>
      )}

      {releases.map((r) => {
        const percent = r.task_count ? Math.round((r.done_count / r.task_count) * 100) : 0;
        const stageIdx = RELEASE_STAGES.findIndex((s) => s.key === r.stage);
        const next = RELEASE_STAGES[stageIdx + 1];
        const left = r.release_on && r.stage !== 'released' ? daysFromToday(r.release_on) : null;
        return (
          <Card key={r.id}>
            <Text style={styles.title}>{r.name}</Text>
            <Text style={styles.hint}>
              {[
                r.owner_name && `Owner ${r.owner_name}`,
                r.stage === 'released' ? `Released ${formatDue(String(r.released_at).slice(0, 10))}` : r.release_on && `Due ${formatDue(r.release_on)}${left !== null ? (left < 0 ? ` (${-left} days late)` : left === 0 ? ' (today)' : ` (in ${left} days)`) : ''}`,
              ].filter(Boolean).join(' · ') || 'No owner or date'}
            </Text>
            {!!r.notes && <Text style={styles.text}>{r.notes}</Text>}
            <View style={styles.steps}>
              {RELEASE_STAGES.map((s, i) => (
                <View key={s.key} style={styles.step}>
                  <View style={[styles.stepBar, i <= stageIdx && { backgroundColor: colors.brand[500] }]} />
                  <Text style={[styles.hint, i === stageIdx && { color: colors.brand[700], fontWeight: '800' }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <Meter percent={percent} />
            <Text style={styles.hint}>
              {r.done_count} of {r.task_count} tasks done{r.total_points > 0 ? ` · ${r.done_points} of ${r.total_points} points` : ''}
            </Text>
            <View style={styles.row}>
              <Chip small icon="list-outline" label="Show its tasks" onPress={() => onShowTasks(r)} />
              {canManage && !!next && <Chip small icon="arrow-forward" label={`Move to ${next.label.toLowerCase()}`} active onPress={() => moveTo(r, next.key)} />}
              {canManage && <Chip small icon="create-outline" label="Edit" onPress={() => setEditing(r)} />}
            </View>
          </Card>
        );
      })}

      <WorkItemSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        kind="release"
        businessId={business.id}
        value={editing && editing !== 'new' ? editing : null}
        onSaved={apply}
      />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  hint: { fontSize: 11, color: colors.gray[500] },
  text: { fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  steps: { flexDirection: 'row', gap: 4, marginVertical: 2 },
  step: { flex: 1, gap: 3 },
  stepBar: { height: 5, borderRadius: 3, backgroundColor: colors.gray[200] },
});
