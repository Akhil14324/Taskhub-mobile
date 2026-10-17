import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import RunResult from './RunResult';
import { useCatalog } from './meta';

/** One run in full: what started it, and what each step did. */
export default function RunLogSheet({ visible, onClose, runId }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { catalog } = useCatalog();
  const [run, setRun] = useState(null);

  useEffect(() => {
    if (!visible || !runId) return;
    setRun(null);
    api.get(`/automation/runs/${runId}`, { __skipOops: true }).then((r) => setRun(r.data.run)).catch(() => setRun(false));
  }, [visible, runId]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640}>
      <ScrollView contentContainerStyle={styles.wrap}>
        {run === false && <Text style={styles.sub}>That run is no longer kept.</Text>}
        {!!run && (
          <>
            <Text style={styles.title}>{run.profile_name || run.task_name || 'Run'}</Text>
            <Text style={styles.sub}>
              {run.task_name ? `Task: ${run.task_name} · ` : ''}started by {run.trigger} · {new Date(run.started_at).toLocaleString()}
            </Text>
            <RunResult run={run} catalog={catalog} />
          </>
        )}
        {run === null && <Text style={styles.sub}>Loading...</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

export function RunRow({ run, onPress }) {
  const colors = useColors();
  const failed = run.status === 'error' || run.status === 'limit';
  return (
    <AnimatedPressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 }}>
      <Ionicons name={failed ? 'alert-circle' : 'checkmark-circle'} size={20} color={failed ? colors.red[600] : colors.brand[500]} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] }} numberOfLines={1}>{run.profile_name || run.task_name || 'Run'}</Text>
        <Text style={{ fontSize: fontSize.xs, color: failed ? colors.red[600] : colors.gray[500] }} numberOfLines={1}>
          {failed && run.error ? run.error : `by ${run.trigger} · ${run.steps} step${run.steps === 1 ? '' : 's'}`}
        </Text>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>{ago(run.started_at)}</Text>
    </AnimatedPressable>
  );
}

export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
});
