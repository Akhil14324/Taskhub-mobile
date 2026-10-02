import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import api from '../api/client';
import { useColors, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Avatar, Chip, EmptyHero, SectionHeader } from '../components/kit';
import { HealthPill } from '../components/todos/TimeHealth';
import { formatSeconds, healthColor, healthTint } from '../utils/timeline';
import { formatDue } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';
import { openNotificationTarget } from '../navigation/navigationRef';

const RANGES = [7, 30, 90];

const fmtMin = (m) => {
  if (m === null || m === undefined) return '–';
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
};

const STATE = {
  light: { label: 'Has room', level: 'none' },
  balanced: { label: 'Balanced', level: 'green' },
  heavy: { label: 'Heavy', level: 'orange' },
  overloaded: { label: 'Overloaded', level: 'red' },
};

const VERDICT = {
  fast: { label: 'Faster than estimated', level: 'green' },
  accurate: { label: 'Accurate', level: 'green' },
  slower: { label: 'Slower than estimated', level: 'orange' },
  much_slower: { label: 'Much slower than estimated', level: 'red' },
};

/** Eight small bars, oldest first: how much got finished each week. */
function Spark({ values, level = 'green', height = 34 }) {
  const { theme } = useTheme();
  const colors = useColors();
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, (v / max) * height),
            borderRadius: 3,
            backgroundColor: i === values.length - 1 ? healthColor(level, theme) : (v ? healthTint(level, theme, 0.45) : colors.gray[200]),
          }}
        />
      ))}
    </View>
  );
}

function Meter({ value, level, height = 8, marker }) {
  const { theme } = useTheme();
  const colors = useColors();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value))}%`, height, backgroundColor: healthColor(level, theme) }} />
      {marker !== undefined && <View style={{ position: 'absolute', left: `${marker}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.gray[500] }} />}
    </View>
  );
}

function Num({ label, value, level }) {
  const colors = useColors();
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: level ? healthColor(level, theme) : colors.gray[900] }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.gray[500], fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Change({ value }) {
  const colors = useColors();
  const { theme } = useTheme();
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={13} color={up ? healthColor('green', theme) : healthColor('red', theme)} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gray[600] }}>{Math.abs(value)}%</Text>
    </View>
  );
}

function Card({ children, style }) {
  const colors = useColors();
  return (
    <View style={[{
      marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.md,
    }, style]}
    >
      {children}
    </View>
  );
}

function useLoader(path, params, skip) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params);
  const load = useCallback(async () => {
    if (skip) return;
    try {
      const res = await api.get(path, { params, __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, skip]);
  useFocusEffect(useCallback(() => { setData(null); load(); }, [load]));
  return { data, error, load, setData };
}

function HealthTab({ days, loader }) {
  const colors = useColors();
  const { theme } = useTheme();
  const { data, error } = loader;
  if (error) return <EmptyHero icon="lock-closed" title="Not available" message={error} />;
  if (!data) return <SkeletonList count={3} type="notification" />;
  if (!data.businesses.length) return <EmptyHero icon="business" title="No businesses" message="There are no businesses in your scope yet." />;
  const t = data.totals;
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View style={{
            width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
            backgroundColor: healthTint(t.level, theme), borderWidth: 3, borderColor: healthColor(t.level, theme),
          }}
          >
            <Text style={{ fontSize: 26, fontWeight: '800', color: healthColor(t.level, theme) }}>{t.score}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] }}>
              {t.level === 'green' ? 'The business is healthy' : t.level === 'orange' ? 'A few things need a look' : 'Needs attention'}
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>
              Average health of {t.businesses} business{t.businesses === 1 ? '' : 'es'} and {t.people} people
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Num label="Open" value={t.open} />
          <Num label="Overdue" value={t.overdue} level={t.overdue ? 'red' : null} />
          <Num label="Stuck" value={t.blocked} level={t.blocked ? 'orange' : null} />
          <Num label="No owner" value={t.unassigned} level={t.unassigned ? 'orange' : null} />
        </View>
        <View style={{ gap: 6, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.gray[600], fontWeight: '700' }}>Finished each week</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.gray[900], fontWeight: '800' }}>{t.completed} in {days} days</Text>
              <Change value={t.completed_change} />
            </View>
          </View>
          <Spark values={t.weekly} />
          {t.on_time_rate !== null && (
            <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>{t.on_time_rate}% of finished work was on time</Text>
          )}
        </View>
      </Card>

      <SectionHeader title="By business" count={data.businesses.length} style={{ paddingHorizontal: spacing.lg }} />
      {data.businesses.map((b) => (
        <Card key={b.id} style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] }} numberOfLines={1}>{b.name}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>{b.people} people · {b.due_soon} due this week</Text>
            </View>
            <HealthPill level={b.level} label={`${b.score}`} compact />
          </View>
          <Meter value={b.score} level={b.level} />
          {b.reasons.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {b.reasons.map((r) => (
                <View key={r} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: healthTint(b.level === 'green' ? 'orange' : b.level, theme, 0.14) }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: healthColor(b.level === 'green' ? 'orange' : b.level, theme) }}>{r}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>Nothing is stuck or late.</Text>
          )}
          <View style={{ flexDirection: 'row' }}>
            <Num label="Open" value={b.open} />
            <Num label="Overdue" value={b.overdue} level={b.overdue ? 'red' : null} />
            <Num label="Done" value={b.completed} />
            <View style={{ flex: 1 }}>
              <Num label="On time" value={b.on_time_rate === null ? '–' : `${b.on_time_rate}%`} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Spark values={b.weekly} height={26} level={b.level === 'red' ? 'red' : 'green'} /></View>
            <View style={{ alignItems: 'flex-end' }}>
              <Change value={b.completed_change} />
              <Text style={{ fontSize: 10, color: colors.gray[400] }}>vs the {days} days before</Text>
              {b.avg_cycle_s !== null && <Text style={{ fontSize: 10, color: colors.gray[500] }}>avg {formatSeconds(b.avg_cycle_s)} to finish</Text>}
            </View>
          </View>
        </Card>
      ))}
    </>
  );
}

function WorkloadTab({ loader }) {
  const colors = useColors();
  const { data, error, load } = loader;
  const [moved, setMoved] = useState(new Set());
  if (error) return <EmptyHero icon="lock-closed" title="Not available" message={error} />;
  if (!data) return <SkeletonList count={4} type="notification" />;
  if (!data.people.length) return <EmptyHero icon="people" title="Nobody here" message="There is nobody below you in the hierarchy yet." />;

  const move = async (s) => {
    const ok = await confirmDialog({
      title: 'Reassign this to-do?',
      message: `"${s.title}" moves from ${s.from.name} to ${s.to.name}. They will be notified.`,
      confirmLabel: 'Reassign',
    });
    if (!ok) return;
    try {
      await api.post(`/todos/${s.todo_id}/assign`, { user_id: s.to.id });
      setMoved((prev) => new Set(prev).add(s.todo_id));
      showToast({ message: `Moved to ${s.to.name}`, icon: 'swap-horizontal' });
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not reassign', icon: 'alert-circle' });
    }
  };

  const suggestions = data.suggestions.filter((s) => !moved.has(s.todo_id));
  const capacityH = Math.round(data.capacity_min / 60);
  return (
    <>
      <Card>
        <Text style={{ fontSize: fontSize.sm, color: colors.gray[600], lineHeight: 19 }}>
          Load is the work that is overdue, due within a week or already started, against {capacityH} hours of focus time over five working days. A to-do without an estimate counts as an hour.
        </Text>
      </Card>

      {suggestions.length > 0 && (
        <>
          <SectionHeader title="Suggested moves" count={suggestions.length} style={{ paddingHorizontal: spacing.lg }} />
          {suggestions.map((s) => (
            <Card key={s.todo_id} style={{ marginTop: spacing.sm }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }} numberOfLines={2}>{s.title}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>
                {fmtMin(s.minutes)}{s.due_date ? ` · due ${formatDue(s.due_date)}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.gray[700] }}>
                  <Text style={{ fontWeight: '800' }}>{s.from.name}</Text> is stretched, <Text style={{ fontWeight: '800' }}>{s.to.name}</Text> has room
                </Text>
                <AnimatedPressable
                  onPress={() => move(s)}
                  haptic="light"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.brand[600] }}
                >
                  <Ionicons name="swap-horizontal" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.sm }}>Reassign</Text>
                </AnimatedPressable>
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionHeader title="Everyone" count={data.people.length} style={{ paddingHorizontal: spacing.lg }} />
      {data.people.map((p) => {
        const st = STATE[p.state];
        return (
          <Card key={p.id} style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={p.name} uri={p.profile_picture} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] }} numberOfLines={1}>{p.name}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }} numberOfLines={1}>
                  {[p.display_title, p.businesses?.[0]].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <HealthPill level={st.level} label={st.label} compact />
            </View>
            <Meter value={(p.ratio / 1.5) * 100} level={st.level} marker={(1 / 1.5) * 100} />
            <Text style={{ fontSize: fontSize.sm, color: colors.gray[500] }}>
              <Text style={{ fontWeight: '800', color: colors.gray[900] }}>{fmtMin(p.load_min)}</Text> of work · {p.open} open
              {p.overdue ? ` · ${p.overdue} overdue` : ''} · {p.due_week} due this week
            </Text>
          </Card>
        );
      })}
    </>
  );
}

function EstimatesTab({ loader, scope }) {
  const colors = useColors();
  const { data, error } = loader;
  if (error) return <EmptyHero icon="lock-closed" title="Not available" message={error} />;
  if (!data) return <SkeletonList count={3} type="notification" />;
  const o = data.overall;
  const v = o.verdict ? VERDICT[o.verdict] : null;
  if (!o.count) {
    return (
      <EmptyHero
        icon="hourglass"
        title="Not enough to compare yet"
        message={data.finished
          ? `${data.finished} to-dos were finished, but none had an estimate. Add one when you plan a to-do (for example "for 2h" in quick add) and it will show here.`
          : 'Finish some to-dos that have an estimate and this will show how close your guesses were.'}
      />
    );
  }
  return (
    <>
      <Card>
        <Text style={{ fontSize: fontSize.sm, color: colors.gray[500], fontWeight: '700' }}>{scope === 'team' ? 'Your team takes' : 'You take'}</Text>
        <Text style={{ fontSize: 34, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 }}>
          {o.ratio.toFixed(1)}x <Text style={{ fontSize: fontSize.md, fontWeight: '700', color: colors.gray[500] }}>the estimated time</Text>
        </Text>
        {v && <HealthPill level={v.level} label={v.label} />}
        <View style={{ flexDirection: 'row', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] }}>
          <Num label="Within 25% of estimate" value={`${o.within}%`} />
          <Num label="Compared" value={o.count} />
          <Num label="Finished" value={data.finished} />
        </View>
        {data.covered < data.finished && (
          <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>
            {data.finished - data.covered} finished to-dos had no estimate, so they are left out.
          </Text>
        )}
      </Card>

      {data.buckets.some((b) => b.count) && (
        <>
          <SectionHeader title="By size of task" style={{ paddingHorizontal: spacing.lg }} />
          <Card style={{ marginTop: spacing.sm }}>
            {data.buckets.filter((b) => b.count).map((b) => {
              const bv = VERDICT[b.verdict];
              return (
                <View key={b.key} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[800] }}>{b.label}</Text>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] }}>{b.ratio.toFixed(1)}x · {b.count}</Text>
                  </View>
                  <Meter value={(b.ratio / 2) * 100} level={bv.level} marker={50} />
                </View>
              );
            })}
          </Card>
        </>
      )}

      {scope === 'team' && data.people.length > 0 && (
        <>
          <SectionHeader title="By person" style={{ paddingHorizontal: spacing.lg }} />
          <Card style={{ marginTop: spacing.sm }}>
            {data.people.map((p) => {
              const pv = VERDICT[p.verdict];
              return (
                <View key={p.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[800] }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] }}>{p.ratio.toFixed(1)}x · {p.count}</Text>
                  </View>
                  <Meter value={(p.ratio / 2) * 100} level={pv.level} marker={50} />
                </View>
              );
            })}
          </Card>
        </>
      )}

      {data.misses.length > 0 && (
        <>
          <SectionHeader title="Biggest differences" style={{ paddingHorizontal: spacing.lg }} />
          {data.misses.map((m, i) => (
            <AnimatedPressable
              key={`${m.todo_id}-${i}`}
              disabled={!m.todo_id}
              onPress={() => m.todo_id && openNotificationTarget({ todoId: m.todo_id })}
              style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: 3 }}
            >
              <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }} numberOfLines={1}>{m.title}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>
                Estimated {fmtMin(m.estimate_min)}, took {fmtMin(m.actual_min)} ({m.ratio.toFixed(1)}x){m.person ? ` · ${m.person}` : ''}
              </Text>
            </AnimatedPressable>
          ))}
        </>
      )}
    </>
  );
}

export default function InsightsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { user } = useAuth();
  const lead = !!user?.can_monitor;
  const [tab, setTab] = useState(route.params?.tab || (lead ? 'health' : 'estimates'));
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState(lead ? 'team' : 'me');
  const [refreshing, setRefreshing] = useState(false);

  const health = useLoader('/insights/health', { days }, !lead || tab !== 'health');
  const workload = useLoader('/insights/workload', {}, !lead || tab !== 'workload');
  const estimates = useLoader('/insights/estimates', { days, scope }, tab !== 'estimates');
  const active = tab === 'health' ? health : tab === 'workload' ? workload : estimates;

  const tabs = [
    ...(lead ? [{ key: 'health', label: 'Business health', icon: 'pulse' }, { key: 'workload', label: 'Workload', icon: 'barbell' }] : []),
    { key: 'estimates', label: 'Estimates', icon: 'hourglass' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Insights" style={styles.title} />
        <Text style={styles.subtitle}>
          {tab === 'health' ? 'How each business is doing, and where it is slipping'
            : tab === 'workload' ? 'Who is stretched and who has room'
              : 'How close your time guesses are to what really happened'}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await active.load(); setRefreshing(false); }} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {tabs.map((t) => <Chip key={t.key} icon={t.icon} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />)}
        </ScrollView>
        {tab !== 'workload' && (
          <View style={styles.row}>
            {RANGES.map((r) => <Chip key={r} small label={`Last ${r} days`} active={days === r} onPress={() => setDays(r)} />)}
            {tab === 'estimates' && lead && (
              <>
                <View style={{ width: spacing.md }} />
                <Chip small label="Team" active={scope === 'team'} onPress={() => setScope('team')} />
                <Chip small label="Just me" active={scope === 'me'} onPress={() => setScope('me')} />
              </>
            )}
          </View>
        )}
        {tab === 'health' && <HealthTab days={days} loader={health} />}
        {tab === 'workload' && <WorkloadTab loader={workload} />}
        {tab === 'estimates' && <EstimatesTab loader={estimates} scope={scope} />}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
