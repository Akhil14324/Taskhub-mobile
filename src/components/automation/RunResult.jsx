import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';

const STATUS = {
  ok: { icon: 'checkmark-circle', text: 'Finished' },
  error: { icon: 'alert-circle', text: 'Stopped by an error' },
  stopped: { icon: 'stop-circle', text: 'Stopped' },
  limit: { icon: 'speedometer', text: 'Stopped, it ran too long' },
};

/** What a run did, step by step. `actions` (optional) names each step; otherwise the log's own type is used. */
export default function RunResult({ run, catalog = null }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const s = STATUS[run.status] || STATUS.ok;
  const failed = run.status !== 'ok' && run.status !== 'stopped';
  const log = Array.isArray(run.log) ? run.log : [];
  const ms = run.duration_ms ?? run.durationMs ?? 0;
  const labelOf = (entry) => {
    const type = entry.t;
    return catalog?.actionByType?.[type]?.label || type;
  };
  return (
    <View style={styles.box} {...glass('inset')}>
      <View style={styles.head}>
        <Ionicons name={s.icon} size={20} color={failed ? colors.red[600] : colors.brand[600]} />
        <Text style={[styles.status, failed && { color: colors.red[600] }]}>{s.text}</Text>
        <Text style={styles.meta}>{run.steps} step{run.steps === 1 ? '' : 's'} · {ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}</Text>
      </View>
      {!!run.error && <Text style={styles.error}>{run.error}</Text>}
      {log.map((e, k) => (
        <View key={k} style={styles.line}>
          <Text style={styles.idx}>{e.i + 1}</Text>
          <Text style={styles.what} numberOfLines={2}>
            <Text style={{ fontWeight: '700', color: colors.gray[800] }}>{labelOf(e)}</Text>
            {e.n ? `  ${e.n}` : ''}
          </Text>
        </View>
      ))}
      {!log.length && !run.error && <Text style={styles.meta}>Nothing was done.</Text>}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  box: { borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, gap: 5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  status: { flex: 1, fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] },
  meta: { fontSize: fontSize.xs, color: colors.gray[500] },
  error: { fontSize: fontSize.sm, color: colors.red[600], fontWeight: '600', lineHeight: 18 },
  line: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  idx: { width: 20, textAlign: 'center', fontSize: 11, fontWeight: '800', color: colors.gray[400], marginTop: 1 },
  what: { flex: 1, fontSize: fontSize.sm, color: colors.gray[600], lineHeight: 18 },
});
