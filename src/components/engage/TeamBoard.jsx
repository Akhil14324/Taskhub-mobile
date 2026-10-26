import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import { Avatar } from '../kit';
import api from '../../api/client';

/**
 * Team graph for Home: each person's finished business work this week against what they still have open,
 * and whether today's daily report is in (attendance). Built from /standup/team.
 */
export default function TeamBoard({ refreshKey = 0 }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [board, setBoard] = useState(null);

  const load = useCallback(() => {
    api.get('/standup/team', { __skipOops: true }).then((r) => setBoard(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useFocusEffect(load);

  if (!board || board.weekend || !board.people.length) return null;

  const people = [...board.people].sort((a, b) => (b.pending + b.completed) - (a.pending + a.completed) || a.name.localeCompare(b.name));
  const max = Math.max(1, ...people.map((p) => p.completed + p.pending));

  return (
    <View {...glass('card')} style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Ionicons name="people-outline" size={16} color={colors.brand[600]} />
          <Text style={styles.title}>Team</Text>
        </View>
        <Text style={styles.attend}>{board.posted} of {board.total} reported today</Text>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.brand[600] }]} /><Text style={styles.legendText}>Completed this week</Text></View>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.gray[300] }]} /><Text style={styles.legendText}>Still pending</Text></View>
      </View>

      {people.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.who}>
            <Avatar name={p.name} uri={p.profile_picture} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{p.me ? `${p.name} (you)` : p.name}</Text>
              <View style={styles.attendRow}>
                <Ionicons name={p.posted ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={p.posted ? colors.brand[600] : colors.gray[400]} />
                <Text style={[styles.attendText, !p.posted && styles.attendMissing]}>{p.posted ? 'Reported' : 'Not reported yet'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.bars}>
            <View style={[styles.bar, { width: `${(p.completed / max) * 100}%`, backgroundColor: colors.brand[600] }]} />
            <View style={[styles.bar, { width: `${(p.pending / max) * 100}%`, backgroundColor: colors.gray[300] }]} />
          </View>
          <View style={styles.counts}>
            <Text style={styles.count}>{p.completed}<Text style={styles.countLabel}> done</Text></Text>
            <Text style={styles.count}>{p.pending}<Text style={styles.countLabel}> open</Text></Text>
            {p.overdue > 0 && <Text style={[styles.count, styles.overdue]}>{p.overdue}<Text style={styles.countLabel}> late</Text></Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  panel: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  attend: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  legend: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.gray[500], fontWeight: '600' },
  row: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200], gap: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[900] },
  attendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  attendText: { fontSize: 11, color: colors.gray[500], fontWeight: '600' },
  attendMissing: { color: colors.brand[600] },
  bars: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.gray[100] },
  bar: { height: '100%' },
  counts: { flexDirection: 'row', gap: spacing.md },
  count: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] },
  countLabel: { fontSize: 11, fontWeight: '600', color: colors.gray[500] },
  overdue: { color: colors.brand[600] },
});
