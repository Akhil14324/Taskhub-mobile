import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { SkeletonList } from '../Skeleton';
import { Chip } from '../kit';
import { Columns, FlowChart, HBars, Stat } from './charts';
import { Card, Heading, Note, minutesText, TYPE_LABEL } from './ui';

const RANGES = [14, 30, 60];
const shortWeek = (ymd) => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`;
const hoursText = (h) => (h === null || h === undefined ? 'None yet' : h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} days`);

/** Plain-words reports for one business: velocity, flow, how long work takes, workload, kinds of work, time. */
export default function ReportsTab({ business }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/workspace/reports', { params: { business_id: business.id, days }, __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the reports');
    }
  }, [business.id, days]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (error) return <View style={{ padding: spacing.lg }}><Note>{error}</Note></View>;
  if (!data) return <SkeletonList count={3} type="notification" />;

  const velocityRows = data.velocity.completed.slice(-6).map((s) => ({ key: s.id, label: s.name.slice(0, 8), value: s.points }));
  const weekRows = data.lead_cycle.weekly.map((w) => ({ key: w.week, label: shortWeek(w.week), value: w.done }));
  const cycleRows = data.lead_cycle.weekly.map((w) => ({ key: w.week, label: shortWeek(w.week), value: w.cycle_h }));
  const peopleRows = data.workload.map((p) => ({
    key: p.user_id || 'none',
    label: p.name,
    value: p.open_points || p.open_tasks,
    hot: p.overdue > 0,
    note: `${p.open_tasks} open${p.open_points ? ` · ${p.open_points} pts` : ''}${p.overdue ? ` · ${p.overdue} late` : ''}`,
  }));
  const typeRows = data.types.map((t) => ({ key: t.item_type, label: TYPE_LABEL[t.item_type] || t.item_type, value: t.open + t.done, note: `${t.done} done · ${t.open} open` }));
  const timeRows = data.time.map((t) => ({ key: t.user_id, label: t.name, value: t.approved + t.pending, note: `${minutesText(t.approved)} approved${t.pending ? ` · ${minutesText(t.pending)} waiting` : ''}` }));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.bar}>
        {RANGES.map((r) => <Chip key={r} small label={`${r} days`} active={days === r} onPress={() => setDays(r)} />)}
      </View>

      <Card>
        <View style={styles.tiles}>
          <Stat label="Usually finished per sprint" value={data.velocity.average === null ? '-' : `${data.velocity.average} pts`} hint={`${data.velocity.completed.length} sprint${data.velocity.completed.length === 1 ? '' : 's'}`} />
          <Stat label="Start to finish" value={hoursText(data.lead_cycle.cycle_h)} hint="from started to done" />
          <Stat label="Idea to finish" value={hoursText(data.lead_cycle.lead_h)} hint="from created to done" />
        </View>
      </Card>

      <Heading>Points finished per sprint</Heading>
      <Card>
        {velocityRows.length ? <Columns rows={velocityRows} /> : <Note>Finish a sprint and its points show up here, so you can plan the next one.</Note>}
      </Card>

      <Heading>Work by status, day by day</Heading>
      <Card>
        <FlowChart days={data.flow} />
        <Note>If the bands in the middle keep getting wider, work is piling up faster than it is finished.</Note>
      </Card>

      <Heading>Tasks finished each week</Heading>
      <Card><Columns rows={weekRows} /></Card>

      <Heading>Hours from started to done, per week</Heading>
      <Card>
        <Columns rows={cycleRows} unit="h" />
        <Note>A week with no finished work stays empty. {data.lead_cycle.done} task{data.lead_cycle.done === 1 ? '' : 's'} finished in the last 8 weeks.</Note>
      </Card>

      <Heading>Who has what</Heading>
      <Card>
        {peopleRows.length ? <HBars rows={peopleRows} /> : <Note>Nothing open.</Note>}
        <Note>A darker bar means that person has late work.</Note>
      </Card>

      <Heading>What kind of work</Heading>
      <Card>{typeRows.length ? <HBars rows={typeRows} /> : <Note>No tasks yet.</Note>}</Card>

      <Heading>Time logged, last {data.days} days</Heading>
      <Card>{timeRows.length ? <HBars rows={timeRows} /> : <Note>No time logged yet. Start a timer from any task.</Note>}</Card>
    </ScrollView>
  );
}

const createStyles = () => StyleSheet.create({
  bar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
