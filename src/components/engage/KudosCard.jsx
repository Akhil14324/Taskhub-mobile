import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Avatar } from '../kit';
import { timeAgo } from '../../utils/dates';
import { KUDOS_REASONS } from './KudosSheet';
import { glass } from '../../theme/glass';

/** One thank-you: who, to whom, for what. `compact` drops the recipient (when it is always you). */
export default function KudosCard({ k, compact = false, onPressTodo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reason = KUDOS_REASONS[k.reason] || KUDOS_REASONS.great_work;
  return (
    <View {...glass('card')} style={styles.card}>
      <Avatar name={k.from_name} uri={k.from_picture} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.line}>
          <Text style={styles.bold}>{k.from_name}</Text>
          {k.from_leadership ? <Text style={styles.lead}>  leadership</Text> : null}
          {compact ? ' thanked you' : <Text> thanked <Text style={styles.bold}>{k.to_name}</Text></Text>}
        </Text>
        <View style={styles.reasonRow}>
          <Ionicons name={reason.icon} size={12} color={colors.brand[600]} />
          <Text style={styles.reason}>{reason.label}</Text>
          <Text style={styles.time}>{timeAgo(k.created_at)}</Text>
        </View>
        {!!k.message && <Text style={styles.message}>{k.message}</Text>}
        {!!k.todo_title && (
          <AnimatedPressable onPress={() => k.todo_id && onPressTodo?.(k.todo_id)}>
            <Text style={styles.todo} numberOfLines={1}>For: {k.todo_title}</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  line: { fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 19 },
  bold: { fontWeight: '800', color: colors.gray[900] },
  lead: { fontSize: 10, fontWeight: '800', color: colors.brand[700], textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  reason: { fontSize: 12, fontWeight: '700', color: colors.brand[600], flex: 1 },
  time: { fontSize: 11, color: colors.gray[400] },
  message: { fontSize: fontSize.sm, color: colors.gray[800], marginTop: 5, lineHeight: 19 },
  todo: { fontSize: 11, color: colors.gray[500], marginTop: 4, fontWeight: '600' },
});
