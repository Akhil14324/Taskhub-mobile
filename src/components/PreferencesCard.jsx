import { useMemo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { Card } from './UI';

const CHOICES = [
  { key: 'viewMode', icon: 'leaf-outline', label: 'How much to show', hint: 'Simple hides labels, estimates, filters, calendar and timeline. Full shows everything.', fallback: 'full',
    options: [['simple', 'Simple'], ['full', 'Full']] },
  { key: 'theme', icon: 'contrast-outline', label: 'Appearance', hint: 'Light, dark, or follow your device', fallback: 'light',
    options: [['system', 'Device'], ['light', 'Light'], ['dark', 'Dark']] },
  { key: 'textSize', icon: 'text-outline', label: 'Text size', hint: 'Make everything smaller or larger', fallback: 'normal',
    options: [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']] },
  { key: 'startPage', icon: 'home-outline', label: 'Open the app on', hint: 'The first page you see', fallback: 'home',
    options: [['home', 'Home'], ['todos', 'To-do'], ['chat', 'Chat']] },
  { key: 'defaultView', icon: 'checkbox-outline', label: 'To-do opens on', hint: 'The list you land on in To-do', fallback: 'today',
    options: [['today', 'Today'], ['upcoming', 'Upcoming'], ['inbox', 'Inbox']] },
];

/**
 * Settings that change the app for this account only (stored on the account, so they follow you to
 * another device). Nobody else's app changes.
 */
export default function PreferencesCard() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updatePreferences } = useAuth();
  const prefs = user?.preferences || {};

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="options-outline" size={18} color={colors.gray[400]} />
        <Text style={styles.title}>My settings</Text>
      </View>
      <Text style={styles.note}>These only change TaskHub for you.</Text>

      {CHOICES.map((c) => (
        <View key={c.key} style={styles.row}>
          <View style={styles.rowHead}>
            <Ionicons name={c.icon} size={18} color={colors.gray[500]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{c.label}</Text>
              <Text style={styles.hint}>{c.hint}</Text>
            </View>
          </View>
          <View style={styles.segment}>
            {c.options.map(([value, text]) => {
              const active = (prefs[c.key] || c.fallback) === value;
              return (
                <AnimatedPressable
                  key={value}
                  onPress={() => updatePreferences({ [c.key]: value })}
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

      <View style={[styles.row, styles.switchRow]}>
        <Ionicons name="flash-off-outline" size={18} color={colors.gray[500]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Reduce motion</Text>
          <Text style={styles.hint}>Turn off animations</Text>
        </View>
        <Switch
          value={!!prefs.reduceMotion}
          onValueChange={(v) => updatePreferences({ reduceMotion: v })}
          trackColor={{ true: colors.brand[600], false: colors.gray[300] }}
        />
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
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500] },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  segActive: { backgroundColor: colors.brand[600] },
  segText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
});
