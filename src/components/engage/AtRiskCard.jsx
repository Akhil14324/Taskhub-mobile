import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import { formatDue } from '../../utils/dates';
import api from '../../api/client';

/** Early warning: to-dos in the next week that look likely to miss their date, and why. Hidden when all is well. */
export default function AtRiskCard({ onOpen }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { todos } = useTodos();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      api.get('/plan/risk', { __skipOops: true }).then((r) => { if (live) setItems(r.data.items || []); }).catch(() => {});
    }, 700);
    return () => { live = false; clearTimeout(id); };
  }, [todos]);

  if (!items.length) return null;
  return (
    <View {...glass('card')} style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="warning-outline" size={17} color={colors.brand[600]} />
        <Text style={styles.title}>May miss their date</Text>
      </View>
      {items.slice(0, 4).map((r) => (
        <AnimatedPressable key={r.id} style={styles.row} onPress={() => onOpen?.(r.id)}>
          <View style={[styles.dot, r.level === 'high' && { backgroundColor: colors.brand[600] }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
            <Text style={styles.why} numberOfLines={2}>{formatDue(r.due)}{r.assignee_name ? ` · ${r.assignee_name.split(' ')[0]}` : ''} · {r.reasons[0]}</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.gray[300]} />
        </AnimatedPressable>
      ))}
      {items.length > 4 && <Text style={styles.more}>{items.length - 4} more</Text>}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand[300] },
  rowTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  why: { fontSize: 12, color: colors.gray[500], marginTop: 1 },
  more: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 4 },
});
