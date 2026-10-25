import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { Card } from './UI';
import { configureFeedback, previewMeow } from '../utils/feedback';
import { remindersOf, hourLabel } from '../utils/reminders';

const EVERY = { 30: '30 min', 60: '1 h', 90: '1.5 h', 120: '2 h', 180: '3 h' };
const MEOWS = { never: 'Never', rarely: 'Rarely', normal: 'Normal', often: 'Often' };
const VOLUMES = { soft: 'Soft', normal: 'Normal', loud: 'Loud' };

/**
 * How often the reminders come and when, and how often the cat meows. Stored on the account
 * (`preferences.reminders`), so the choice follows you to another device.
 */
export default function RemindersCard() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updatePreferences } = useAuth();
  const prefs = user?.preferences || {};
  const rem = remindersOf(prefs);

  const change = (patch) => {
    const reminders = { ...rem, ...patch };
    updatePreferences({ reminders });
    configureFeedback({ ...prefs, reminders });
  };

  const rows = [
    { key: 'waterGoal', title: 'Glasses a day', hint: 'Your daily water goal', options: [4, 6, 8, 10, 12].map((n) => [n, String(n)]) },
    { key: 'waterEvery', title: 'Ask for water every', hint: 'How long between water reminders', options: [30, 60, 90, 120].map((n) => [n, EVERY[n]]) },
    { key: 'waterFrom', title: 'Water reminders from', hint: 'The first reminder of the day', options: [7, 8, 9, 10].map((h) => [h, hourLabel(h)]) },
    { key: 'waterTo', title: 'Water reminders until', hint: 'No water reminders from this hour', options: [18, 20, 21, 22].map((h) => [h, hourLabel(h)]) },
    { key: 'stretchEvery', title: 'Stretch every', hint: 'How long between stretch breaks', options: [60, 90, 120, 180].map((n) => [n, EVERY[n]]) },
    { key: 'stretchFrom', title: 'Stretch breaks from', hint: 'The first break of the day', options: [8, 9, 10].map((h) => [h, hourLabel(h)]) },
    { key: 'stretchTo', title: 'Stretch breaks until', hint: 'No stretch breaks from this hour', options: [17, 18, 19, 20].map((h) => [h, hourLabel(h)]) },
    { key: 'catMeows', title: 'The cat meows', hint: 'How often it meows on its own, and cries when it is thirsty or stiff. Never silences it', options: Object.entries(MEOWS) },
    { key: 'catVolume', title: 'Cat voice volume', hint: 'How loud the cat is', options: Object.entries(VOLUMES) },
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="water-outline" size={18} color={colors.gray[400]} />
        <Text style={styles.title}>Reminders and cat</Text>
      </View>
      <Text style={styles.note}>How often TaskHub asks you to drink water and stretch, and how the cat sounds. Only for you.</Text>

      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.label}>{r.title}</Text>
          <Text style={styles.hint}>{r.hint}</Text>
          <View style={styles.segment}>
            {r.options.map(([value, text]) => {
              const active = rem[r.key] === value;
              return (
                <AnimatedPressable
                  key={String(value)}
                  onPress={() => change({ [r.key]: value })}
                  haptic="light"
                  style={[styles.segItem, active && styles.segActive]}
                >
                  <Text style={[styles.segText, active && { color: '#fff' }]}>{text}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>
      ))}

      <View style={styles.row}>
        <AnimatedPressable onPress={previewMeow} haptic="light" style={styles.previewBtn}>
          <Ionicons name="volume-medium-outline" size={16} color={colors.brand[700]} />
          <Text style={styles.previewText}>Play a meow</Text>
        </AnimatedPressable>
      </View>
    </Card>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  note: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2, marginBottom: spacing.sm },
  row: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  label: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.sm },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  segActive: { backgroundColor: colors.brand[600] },
  segText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  previewText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
});
