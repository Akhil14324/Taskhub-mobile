import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import api from '../../api/client';

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The daily report is mandatory and counts as attendance, so today's state is always on Home: due until it is
 * posted, then a quiet confirmation. Hidden on weekends, when no report is due.
 */
export default function DailyReportCard({ refreshKey = 0 }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const [today, setToday] = useState(null);

  const load = useCallback(() => {
    api.get('/standup/today', { __skipOops: true }).then((r) => setToday(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useFocusEffect(load);

  if (!today || today.weekend) return null;

  const open = () => navigation.navigate('Progress', { tab: 'standup' });
  const posted = today.posted;

  if (posted) {
    return (
      <AnimatedPressable onPress={open} {...glass('card')} style={[styles.card, styles.done]}>
        <Ionicons name="checkmark-circle" size={20} color={colors.brand[600]} />
        <Text style={styles.doneText}>Daily report posted at {timeOf(posted.updated_at || posted.created_at)}. You are marked present.</Text>
      </AnimatedPressable>
    );
  }

  return (
    <View {...glass('accent')} style={[styles.card, styles.due]}>
      <View style={styles.icon}>
        <Ionicons name="document-text" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dueTitle}>Daily report due</Text>
        <Text style={styles.dueText}>Required every working day. It is drafted from what you finished, so it takes one tap.</Text>
      </View>
      <AnimatedPressable onPress={open} style={styles.btn}>
        <Text style={styles.btnText}>Post it</Text>
      </AnimatedPressable>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md },
  done: { backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200] },
  doneText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[800], fontWeight: '600' },
  due: { backgroundColor: colors.brand[600] },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  dueTitle: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
  dueText: { color: '#fff', opacity: 0.92, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  btn: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  btnText: { color: colors.brand[600], fontWeight: '800', fontSize: fontSize.sm },
});
