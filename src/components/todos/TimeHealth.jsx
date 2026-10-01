import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { Avatar } from '../kit';
import {
  HEALTH, healthColor, healthTint, formatSeconds, formatRatio, todoHealth, todoMetrics, describeEntry,
} from '../../utils/timeline';
import { timeAgo } from '../../utils/dates';

/** Current time in ms, refreshed every `interval` so colours and durations stay live. */
export function useNowTick(interval = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

/** Small coloured pill: dot + text, tinted by health level. */
export const HealthPill = memo(function HealthPill({ level, label, icon, compact }) {
  const { theme } = useTheme();
  const color = healthColor(level, theme);
  return (
    <View style={[pill.base, compact && pill.compact, { backgroundColor: healthTint(level, theme, 0.15) }]}>
      {icon ? (
        <Ionicons name={icon} size={compact ? 10 : 12} color={color} />
      ) : (
        <View style={[pill.dot, { backgroundColor: color }]} />
      )}
      <Text style={[pill.text, compact && pill.textCompact, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
});

const pill = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: 'flex-start' },
  compact: { paddingHorizontal: 6, paddingVertical: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700', maxWidth: 190 },
  textCompact: { fontSize: 10 },
});

/** The headline: how is this to-do doing, and why. */
export function HealthBanner({ todo, now, extra }) {
  const colors = useColors();
  const { theme } = useTheme();
  const health = useMemo(() => todoHealth(todo, now), [todo, now]);
  const m = useMemo(() => todoMetrics(todo, now), [todo, now]);
  if (health.level === 'none') return null;
  const color = healthColor(health.level, theme);
  const title = todo.is_done
    ? (health.level === 'green' ? 'Finished well' : health.level === 'orange' ? 'Finished, but slipped' : 'Finished late')
    : (health.level === 'green' ? 'On track' : health.level === 'orange' ? 'Needs attention' : 'Running late');
  return (
    <View style={[styles.banner, { backgroundColor: healthTint(health.level, theme, 0.12), borderColor: healthTint(health.level, theme, 0.45) }]}>
      <Ionicons name={HEALTH[health.level].icon} size={22} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        {health.reasons.length > 0 && (
          <Text style={[styles.bannerText, { color: colors.gray[600] }]}>{health.reasons.join(' · ')}</Text>
        )}
        {extra}
      </View>
      {!todo.is_done && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.bannerNumber, { color }]}>{formatSeconds(m.cycle_s)}</Text>
          <Text style={[styles.bannerCaption, { color: colors.gray[500] }]}>since assigned</Text>
        </View>
      )}
    </View>
  );
}

/** Numbers for one to-do: lead, response, cycle, blocked, active, estimate, reschedules. */
export function MetricsGrid({ todo, now, reschedules = 0 }) {
  const colors = useColors();
  const { theme } = useTheme();
  const m = useMemo(() => todoMetrics(todo, now), [todo, now]);
  const ratio = m.estimate_s ? m.active_s / m.estimate_s : null;
  const ratioLevel = ratio === null ? 'none' : ratio > 1 ? 'red' : ratio >= 0.8 ? 'orange' : 'green';
  const cells = [
    { label: 'Lead time', value: formatSeconds(m.lead_s), hint: 'created → ' + (todo.is_done ? 'done' : 'now') },
    { label: 'Response', value: formatSeconds(m.response_s), hint: 'assigned → started' },
    { label: 'Cycle', value: formatSeconds(m.cycle_s), hint: 'started → ' + (todo.is_done ? 'done' : 'now') },
    { label: 'Blocked', value: formatSeconds(m.blocked_s), hint: 'time stuck', level: m.blocked_s > 0 ? (m.blocked_s >= 86400 ? 'red' : 'orange') : 'none' },
    { label: 'Active', value: formatSeconds(m.active_s), hint: 'cycle − blocked' },
    {
      label: 'Estimate',
      value: m.estimate_s ? `${formatSeconds(m.active_s)} / ${formatSeconds(m.estimate_s)}` : '–',
      hint: ratio === null ? 'none set' : `${formatRatio(ratio)} used`,
      level: ratioLevel,
    },
  ];
  if (reschedules > 0) cells.push({ label: 'Moved', value: `${reschedules}×`, hint: 'due date changed', level: reschedules >= 3 ? 'red' : 'orange' });
  return (
    <View style={styles.grid}>
      {cells.map((c) => (
        <View key={c.label} style={[styles.cell, { backgroundColor: colors.gray[100] }]}>
          <Text style={[styles.cellLabel, { color: colors.gray[500] }]}>{c.label}</Text>
          <Text style={[styles.cellValue, { color: c.level && c.level !== 'none' ? healthColor(c.level, theme) : colors.gray[900] }]} numberOfLines={1}>{c.value}</Text>
          <Text style={[styles.cellHint, { color: colors.gray[400] }]} numberOfLines={1}>{c.hint}</Text>
        </View>
      ))}
    </View>
  );
}

const TONE = { good: 'green', bad: 'red', warn: 'orange' };

/**
 * The to-do's story, newest first, with the time since the previous step on every entry
 * ("+2h 10m"). Comments are shown in the comment thread, so only events and questions are here.
 */
export function TimelineEntries({ entries, limit = 8, userId, onShowAll, includeComments = false }) {
  const colors = useColors();
  const { theme } = useTheme();
  const rows = useMemo(() => {
    const ordered = (entries || []).filter((e) => e.type === 'event' || e.kind === 'question' || includeComments);
    const out = ordered.map((e, i) => ({
      ...e,
      gap: i > 0 ? Math.round((new Date(e.created_at) - new Date(ordered[i - 1].created_at)) / 1000) : null,
    }));
    return out.reverse();
  }, [entries, includeComments]);
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!rows.length) return <Text style={[styles.empty, { color: colors.gray[400] }]}>Nothing logged yet.</Text>;
  return (
    <View>
      {shown.map((e, i) => {
        const who = e.user_id === userId ? 'You' : (e.user_name || 'Someone');
        const d = describeEntry(e, who);
        const tone = TONE[d.tone];
        const color = tone ? healthColor(tone, theme) : d.tone === 'question' ? colors.brand[600] : colors.gray[500];
        return (
          <View key={`${e.type}-${e.id}`} style={styles.entry}>
            <View style={styles.rail}>
              <View style={[styles.node, { backgroundColor: tone ? healthTint(tone, theme, 0.18) : colors.gray[100], borderColor: color }]}>
                <Ionicons name={d.icon} size={13} color={color} />
              </View>
              {i < shown.length - 1 && <View style={[styles.line, { backgroundColor: colors.gray[200] }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: spacing.md }}>
              <Text style={[styles.entryTitle, { color: colors.gray[900] }]}>{d.title}</Text>
              {!!d.detail && <Text style={[styles.entryDetail, { color: colors.gray[600] }]}>{d.detail}</Text>}
              {d.progress !== null && d.progress !== undefined && (
                <View style={[styles.progressTrack, { backgroundColor: colors.gray[200] }]}>
                  <View style={[styles.progressFill, { width: `${d.progress}%`, backgroundColor: healthColor('green', theme) }]} />
                </View>
              )}
              <View style={styles.entryMeta}>
                <Text style={[styles.entryTime, { color: colors.gray[400] }]}>{timeAgo(e.created_at)}</Text>
                {e.gap !== null && e.gap >= 60 && (
                  <Text style={[styles.entryGap, { color: colors.gray[500], backgroundColor: colors.gray[100] }]}>+{formatSeconds(e.gap)} after previous</Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
      {limit && rows.length > limit && (
        <Text onPress={onShowAll} style={[styles.showAll, { color: colors.brand[600] }]}>Show all {rows.length} steps</Text>
      )}
    </View>
  );
}

/** A person's avatar + name line, used in the monitor lists. */
export function PersonLine({ person, size = 36, subtitle }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
      <Avatar name={person.name} uri={person.profile_picture} size={size} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }} numberOfLines={1}>{person.name}</Text>
        {!!subtitle && <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }} numberOfLines={1}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: spacing.sm, marginTop: spacing.sm },
  bannerTitle: { fontSize: fontSize.base, fontWeight: '800' },
  bannerText: { fontSize: fontSize.sm, marginTop: 1 },
  bannerNumber: { fontSize: fontSize.lg, fontWeight: '800' },
  bannerCaption: { fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm },
  cell: { width: '31%', flexGrow: 1, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cellLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  cellValue: { fontSize: fontSize.md, fontWeight: '800', marginTop: 2 },
  cellHint: { fontSize: 10, marginTop: 1 },
  empty: { fontSize: fontSize.sm, paddingHorizontal: spacing.sm },
  entry: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.sm },
  rail: { alignItems: 'center', width: 26 },
  node: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginTop: 2, borderRadius: 1 },
  entryTitle: { fontSize: fontSize.sm, fontWeight: '700', paddingTop: 3 },
  entryDetail: { fontSize: fontSize.sm, marginTop: 1, lineHeight: 18 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  entryTime: { fontSize: 11 },
  entryGap: { fontSize: 10, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full, overflow: 'hidden' },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 6, width: '60%', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  showAll: { fontSize: fontSize.sm, fontWeight: '700', paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, marginLeft: 38 },
});
