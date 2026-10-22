import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import { formatDuration } from '../../utils/todoMeta';
import api from '../../api/client';

/**
 * Today's plan, built by the server: what is due or late first, laid out in time blocks that fit the working
 * day (lunch left free), each with the reason it is there. It rebuilds when the to-dos change.
 */
export default function DayPlan({ onOpen }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { todos } = useTodos();
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      api.get('/plan', { __skipOops: true }).then((r) => { if (live) setData(r.data); }).catch(() => {});
    }, 500);
    return () => { live = false; clearTimeout(id); };
  }, [todos]);

  if (!data) return null;
  return (
    <View {...glass('card')} style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="time-outline" size={17} color={colors.brand[600]} />
        <Text style={styles.title}>Your plan for today</Text>
      </View>
      <Text style={styles.note}>{data.note}</Text>
      {data.plan.map((p) => (
        <AnimatedPressable key={p.id} style={styles.row} onPress={() => onOpen?.(p.id)}>
          <Text style={styles.time}>{p.start}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{p.title}</Text>
            <Text style={styles.why} numberOfLines={1}>{p.why} · {formatDuration(p.minutes)}{p.business_name ? ` · ${p.business_name}` : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.gray[300]} />
        </AnimatedPressable>
      ))}
      {data.overflow.length > 0 && (
        <View style={styles.over}>
          <Text style={styles.overTitle}>Will not fit today</Text>
          {data.overflow.slice(0, 4).map((p) => (
            <AnimatedPressable key={p.id} onPress={() => onOpen?.(p.id)}>
              <Text style={styles.overRow} numberOfLines={1}>{p.title} · {formatDuration(p.minutes)}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  note: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  time: { width: 46, fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
  rowTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  why: { fontSize: 12, color: colors.gray[500], marginTop: 1 },
  over: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  overTitle: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  overRow: { fontSize: fontSize.sm, color: colors.gray[600], paddingVertical: 3 },
});
