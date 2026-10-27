import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { PrimaryButton } from '../Button';
import { SkeletonList } from '../Skeleton';
import { Chip, EmptyHero } from '../kit';
import WorkItemSheet from './WorkItemSheet';
import { Card, Meter, Note } from './ui';
import useWorkspace from '../../hooks/useWorkspace';
import { formatDue } from '../../utils/dates';

/** Epics: the big goals of a business, with how far the tasks under each have got. */
export default function EpicsTab({ business, onShowTasks }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, apply } = useWorkspace(business.id);
  const [show, setShow] = useState('open');
  const [editing, setEditing] = useState(null); // an epic, 'new', or null
  const canManage = !!business.can_manage;
  const epics = (data?.epics || []).filter((e) => e.status === show);
  const total = data?.epics?.length || 0;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.bar}>
        <Chip small label="Open" active={show === 'open'} onPress={() => setShow('open')} />
        <Chip small label="Done" active={show === 'done'} onPress={() => setShow('done')} />
        <View style={{ flex: 1 }} />
        {canManage && <Chip small icon="add" label="New epic" active onPress={() => setEditing('new')} />}
      </View>

      {!data && <SkeletonList count={2} type="notification" />}
      {data && !total && (
        <>
          <EmptyHero icon="layers" title="No epics yet" message="An epic is a big goal made of many tasks, like Onboarding or Billing. Group tasks under it to see how far the whole goal has got." />
          {canManage && <View style={{ alignItems: 'center' }}><PrimaryButton onPress={() => setEditing('new')}>Create an epic</PrimaryButton></View>}
        </>
      )}
      {data && total > 0 && !epics.length && <View style={{ marginTop: spacing.md }}><Note> </Note><Text style={styles.empty}>No {show} epics.</Text></View>}

      {epics.map((e) => {
        const percent = e.task_count ? Math.round((e.done_count / e.task_count) * 100) : 0;
        return (
          <Card key={e.id}>
            <Text style={styles.title}>{e.name}</Text>
            <Text style={styles.hint}>
              {[e.owner_name && `Owner ${e.owner_name}`, e.due_on && `Due ${formatDue(e.due_on)}`].filter(Boolean).join(' · ') || 'No owner or date'}
            </Text>
            {!!e.description && <Text style={styles.text}>{e.description}</Text>}
            <Meter percent={percent} />
            <Text style={styles.hint}>
              {e.done_count} of {e.task_count} tasks done{e.total_points > 0 ? ` · ${e.done_points} of ${e.total_points} points` : ''}
            </Text>
            <View style={styles.row}>
              <Chip small icon="list-outline" label="Show its tasks" onPress={() => onShowTasks(e)} />
              {canManage && <Chip small icon="create-outline" label="Edit" onPress={() => setEditing(e)} />}
            </View>
          </Card>
        );
      })}

      <WorkItemSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        kind="epic"
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
  empty: { textAlign: 'center', fontSize: fontSize.sm, color: colors.gray[500] },
});
