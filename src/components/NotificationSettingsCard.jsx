import { useMemo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { Card } from './UI';
import { notifSettingsOf } from '../utils/notificationMeta';

const SWITCHES = [
  { key: 'reminders', icon: 'alarm-outline', label: 'Task reminders', hint: 'Reminders before and at the time a task is due' },
  { key: 'assignments', icon: 'person-add-outline', label: 'Assignments', hint: 'When someone gives you a task or shares one with you' },
  { key: 'deadlines', icon: 'alert-circle-outline', label: 'Deadline and overdue alerts', hint: 'Deadline day and tasks that have gone overdue' },
  { key: 'daily', icon: 'sunny-outline', label: 'Daily summaries', hint: 'Your day summary and the weekly recap' },
  { key: 'ai', icon: 'sparkles-outline', label: 'AI recommendations', hint: 'Suggestions based on your own tasks' },
];

const LEADS = [[1440, '1 day before'], [180, '3 hours before'], [30, '30 min before']];
const START_HOURS = [20, 21, 22, 23];
const END_HOURS = [6, 7, 8, 9];
const hourLabel = (h) => `${h}:00`;

/**
 * Per-person notification settings, stored on the account as `preferences.notifications` (the server applies
 * them when it creates a notification, so they hold on every device). Mentions, approvals and chat are always
 * delivered; quiet hours and "in-app only" keep a notification silent but still list it here.
 */
export default function NotificationSettingsCard() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updatePreferences } = useAuth();
  const s = notifSettingsOf(user?.preferences);
  const save = (patch) => updatePreferences({ notifications: { ...s, ...patch } });

  const segment = (options, value, onPick) => (
    <View style={styles.segment}>
      {options.map(([v, text]) => {
        const active = value === v;
        return (
          <AnimatedPressable key={String(v)} onPress={() => onPick(v)} haptic="light" style={[styles.segItem, active && styles.segActive]}>
            <Text style={[styles.segText, active && { color: '#fff' }]}>{text}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="notifications-outline" size={18} color={colors.gray[400]} />
        <Text style={styles.title}>Notification settings</Text>
      </View>
      <Text style={styles.note}>Only for you. Mentions, approvals and chat messages always come through.</Text>

      {SWITCHES.map((sw) => (
        <View key={sw.key} style={[styles.row, styles.switchRow]}>
          <Ionicons name={sw.icon} size={18} color={colors.gray[500]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{sw.label}</Text>
            <Text style={styles.hint}>{sw.hint}</Text>
          </View>
          <Switch value={s[sw.key] !== false} onValueChange={(v) => save({ [sw.key]: v })} trackColor={{ true: colors.brand[600], false: colors.gray[300] }} />
        </View>
      ))}

      {s.reminders !== false && (
        <View style={styles.row}>
          <View style={styles.rowHead}>
            <Ionicons name="time-outline" size={18} color={colors.gray[500]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Remind me</Text>
              <Text style={styles.hint}>How long before a task is due. You are always reminded when it is due</Text>
            </View>
          </View>
          <View style={styles.segment}>
            {LEADS.map(([m, text]) => {
              const on = (s.leads || []).includes(m);
              return (
                <AnimatedPressable key={m} onPress={() => save({ leads: on ? s.leads.filter((x) => x !== m) : [...(s.leads || []), m] })} haptic="light" style={[styles.segItem, on && styles.segActive]}>
                  <Text style={[styles.segText, on && { color: '#fff' }]}>{text}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={[styles.row, styles.switchRow]}>
        <Ionicons name="moon-outline" size={18} color={colors.gray[500]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Quiet hours</Text>
          <Text style={styles.hint}>No pop-ups, sounds or phone alerts. Notifications still wait in your list</Text>
        </View>
        <Switch value={s.quietEnabled === true} onValueChange={(v) => save({ quietEnabled: v })} trackColor={{ true: colors.brand[600], false: colors.gray[300] }} />
      </View>
      {s.quietEnabled && (
        <View style={styles.quiet}>
          <Text style={styles.hint}>From</Text>
          {segment(START_HOURS.map((h) => [h, hourLabel(h)]), s.quietStart, (v) => save({ quietStart: v }))}
          <Text style={[styles.hint, { marginTop: spacing.sm }]}>Until</Text>
          {segment(END_HOURS.map((h) => [h, hourLabel(h)]), s.quietEnd, (v) => save({ quietEnd: v }))}
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.rowHead}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.gray[500]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>How to deliver</Text>
            <Text style={styles.hint}>Phone and browser alerts, or only inside TaskHub</Text>
          </View>
        </View>
        {segment([['all', 'App and device'], ['in_app', 'In the app only']], s.delivery, (v) => save({ delivery: v }))}
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
  quiet: { paddingBottom: spacing.md, gap: spacing.xs },
  label: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500] },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.lg, backgroundColor: colors.gray[100] },
  segActive: { backgroundColor: colors.brand[600] },
  segText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
});
