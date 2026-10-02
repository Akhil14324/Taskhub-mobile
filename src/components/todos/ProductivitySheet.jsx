import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { ProgressRing } from '../kit';
import { WEEKDAYS_SHORT, parseYmd } from '../../utils/dates';

/** Daily goal, streak and the last 7 days — Todoist's productivity view. */
export default function ProductivitySheet({ visible, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { insights, setDailyGoal } = useTodos();
  const goal = insights?.goal || 5;
  const today = insights?.today_count || 0;
  const percent = Math.min(100, Math.round((today / goal) * 100));
  const week = insights?.week || [];
  const weekMax = Math.max(goal, 1, ...week.map((d) => d.count));
  const total = week.reduce((s, d) => s + d.count, 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={560}>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Productivity</Text>
        <View style={styles.hero}>
          <ProgressRing percent={percent} size={96} stroke={9} color="#dc2626">
            <Text style={styles.ringNumber}>{today}</Text>
            <Text style={styles.ringOf}>of {goal}</Text>
          </ProgressRing>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.heroTitle}>{today >= goal ? 'Daily goal reached' : `${goal - today} to go today`}</Text>
            <Text style={styles.heroSub}>{insights?.streak ? `${insights.streak}-day streak` : 'Finish something today to start a streak'}</Text>
            <Text style={styles.heroSub}>{total} completed in the last 7 days</Text>
          </View>
        </View>

        <View style={styles.bars}>
          {week.map((d) => {
            const height = Math.max(4, Math.round((d.count / weekMax) * 70));
            const isToday = d.day === insights?.today;
            return (
              <View key={d.day} style={styles.barCol}>
                <Text style={styles.barCount}>{d.count || ''}</Text>
                <View style={[styles.bar, { height, backgroundColor: isToday ? '#dc2626' : colors.gray[300], opacity: d.count >= goal ? 1 : 0.85 }]} />
                <Text style={[styles.barLabel, isToday && { color: colors.gray[900], fontWeight: '700' }]}>{WEEKDAYS_SHORT[parseYmd(d.day).getDay()][0]}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.goalLabel}>DAILY GOAL</Text>
        <View style={styles.stepper}>
          <AnimatedPressable style={styles.stepBtn} onPress={() => goal > 1 && setDailyGoal(goal - 1)} haptic="light">
            <Ionicons name="remove" size={22} color={colors.gray[700]} />
          </AnimatedPressable>
          <Text style={styles.goalValue}>{goal} <Text style={styles.goalUnit}>to-dos a day</Text></Text>
          <AnimatedPressable style={styles.stepBtn} onPress={() => goal < 50 && setDailyGoal(goal + 1)} haptic="light">
            <Ionicons name="add" size={22} color={colors.gray[700]} />
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  heading: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  ringNumber: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], lineHeight: 28 },
  ringOf: { fontSize: fontSize.xs, color: colors.gray[500] },
  heroTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gray[900] },
  heroSub: { fontSize: fontSize.sm, color: colors.gray[500] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110, marginTop: spacing.xl },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: 18, borderRadius: 6 },
  barCount: { fontSize: 11, color: colors.gray[500], fontWeight: '600', minHeight: 14 },
  barLabel: { fontSize: 11, color: colors.gray[400] },
  goalLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.gray[100], borderRadius: radius.lg, padding: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  goalValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  goalUnit: { fontSize: fontSize.sm, fontWeight: '500', color: colors.gray[500] },
});
