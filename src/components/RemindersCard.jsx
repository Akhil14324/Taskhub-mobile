import { useMemo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useFeature from '../hooks/useFeature';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { Card } from './UI';
import { configureFeedback, previewMeow } from '../utils/feedback';
import { remindersOf, hourLabel } from '../utils/reminders';

const EVERY = { 30: '30 min', 60: '1 h', 90: '1.5 h', 120: '2 h', 180: '3 h' };
const MEOWS = { never: 'Never', rarely: 'Rarely', normal: 'Normal', often: 'Often' };
const VOLUMES = { soft: 'Soft', normal: 'Normal', loud: 'Loud' };

/**
 * Water, stretch and cat voice: each has an on/off switch and its own timing. Stored on the account
 * (`preferences.reminders`, and the water and stretch switches in `preferences.features`), so the
 * choices follow you to another device.
 */
export default function RemindersCard() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updatePreferences } = useAuth();
  const { on, setFeature } = useFeature();
  const prefs = user?.preferences || {};
  const rem = remindersOf(prefs);

  const change = (patch) => {
    const reminders = { ...rem, ...patch };
    updatePreferences({ reminders });
    configureFeedback({ ...prefs, reminders });
  };
  // The cat's voice is off when it never meows; switching it back on restores "normal".
  const voiceOn = rem.catMeows !== 'never';

  const sections = [
    {
      key: 'water',
      icon: 'water-outline',
      title: 'Water reminder',
      hint: 'A nudge to drink water, with a drop on screen',
      on: on('water'),
      toggle: (v) => setFeature('water', v),
      rows: [
        { key: 'waterGoal', title: 'Glasses a day', hint: 'Your daily water goal', options: [4, 6, 8, 10, 12].map((n) => [n, String(n)]) },
        { key: 'waterEvery', title: 'Ask every', hint: 'How long between reminders', options: [30, 60, 90, 120].map((n) => [n, EVERY[n]]) },
        { key: 'waterFrom', title: 'From', hint: 'The first reminder of the day', options: [7, 8, 9, 10].map((h) => [h, hourLabel(h)]) },
        { key: 'waterTo', title: 'Until', hint: 'No reminders from this hour', options: [18, 20, 21, 22].map((h) => [h, hourLabel(h)]) },
      ],
    },
    {
      key: 'stretch',
      icon: 'body-outline',
      title: 'Stretch breaks',
      hint: 'A one-minute guided stretch',
      on: on('stretch'),
      toggle: (v) => setFeature('stretch', v),
      rows: [
        { key: 'stretchEvery', title: 'Every', hint: 'How long between breaks', options: [60, 90, 120, 180].map((n) => [n, EVERY[n]]) },
        { key: 'stretchFrom', title: 'From', hint: 'The first break of the day', options: [8, 9, 10].map((h) => [h, hourLabel(h)]) },
        { key: 'stretchTo', title: 'Until', hint: 'No breaks from this hour', options: [17, 18, 19, 20].map((h) => [h, hourLabel(h)]) },
      ],
    },
    {
      key: 'voice',
      icon: 'paw-outline',
      title: 'Cat voice',
      hint: 'The cat meows and purrs. Its look and the other cat features stay as they are',
      on: voiceOn,
      toggle: (v) => change({ catMeows: v ? 'normal' : 'never' }),
      rows: [
        { key: 'catMeows', title: 'How often it meows', hint: 'On its own, and when it is thirsty or stiff', options: Object.entries(MEOWS) },
        { key: 'catVolume', title: 'Volume', hint: 'How loud the cat is', options: Object.entries(VOLUMES) },
      ],
    },
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="water-outline" size={18} color={colors.gray[400]} />
        <Text style={styles.title}>Reminders and cat</Text>
      </View>
      <Text style={styles.note}>Turn each one on or off, and choose how often. Only for you.</Text>

      {sections.map((s) => (
        <View key={s.key} style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name={s.icon} size={18} color={colors.gray[500]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{s.title}</Text>
              <Text style={styles.hint}>{s.hint}</Text>
            </View>
            <Switch
              value={s.on}
              onValueChange={s.toggle}
              trackColor={{ true: colors.brand[600], false: colors.gray[300] }}
              thumbColor="#fff"
              activeThumbColor="#fff"
            />
          </View>

          {/* Options of a switched-off section stay visible but cannot be changed. */}
          <View style={!s.on && styles.dimmed} pointerEvents={s.on ? 'auto' : 'none'}>
            {s.rows.map((r) => (
              <View key={r.key} style={styles.row}>
                <Text style={styles.sub}>{r.title}</Text>
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
            {s.key === 'voice' && (
              <View style={styles.row}>
                <AnimatedPressable onPress={previewMeow} haptic="light" style={styles.previewBtn}>
                  <Ionicons name="volume-medium-outline" size={16} color={colors.brand[700]} />
                  <Text style={styles.previewText}>Play a meow</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>
        </View>
      ))}
    </Card>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  note: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2, marginBottom: spacing.sm },
  section: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dimmed: { opacity: 0.45 },
  row: { paddingTop: spacing.md },
  label: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.sm },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  segActive: { backgroundColor: colors.brand[600] },
  segText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  previewText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[700] },
});
