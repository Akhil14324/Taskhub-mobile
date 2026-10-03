import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useColors, useTheme } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import { Chip, EmptyHero, ProgressRing } from '../components/kit';
import { HealthPill } from '../components/todos/TimeHealth';
import GoalSheet from '../components/goals/GoalSheet';
import KeyResultSheet from '../components/goals/KeyResultSheet';
import { healthColor } from '../utils/timeline';
import { formatDue } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

const PACE = {
  done: { label: 'Achieved', level: 'green' },
  on_track: { label: 'On track', level: 'green' },
  at_risk: { label: 'At risk', level: 'orange' },
  behind: { label: 'Behind', level: 'red' },
  upcoming: { label: 'Not started', level: 'none' },
};

const SCOPE_LABEL = (g) => (g.scope === 'company' ? 'Company' : g.scope === 'business' ? g.business_name : 'Personal');

const FILTERS = [
  { key: 'active', label: 'Active', icon: 'flag' },
  { key: 'achieved', label: 'Achieved', icon: 'trophy' },
  { key: 'company', label: 'Company', icon: 'globe' },
  { key: 'business', label: 'Business', icon: 'business' },
  { key: 'personal', label: 'Mine', icon: 'person' },
];

function KeyResultRow({ kr, onPress }) {
  const colors = useColors();
  const { theme } = useTheme();
  const detail = kr.kind === 'todos'
    ? `${kr.todos_done} of ${kr.todos_total} to-dos`
    : `${kr.current_value} of ${kr.target_value}${kr.unit ? ` ${kr.unit}` : ''}`;
  return (
    <AnimatedPressable onPress={onPress} style={{ gap: 5, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name={kr.kind === 'todos' ? 'checkbox-outline' : 'trending-up'} size={15} color={colors.gray[500]} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] }} numberOfLines={2}>{kr.title}</Text>
        <Text style={{ fontSize: fontSize.xs, fontWeight: '800', color: kr.progress >= 100 ? healthColor('green', theme) : colors.gray[600] }}>{kr.progress}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
        <View style={{ width: `${kr.progress}%`, height: 6, backgroundColor: kr.progress >= 100 ? healthColor('green', theme) : colors.brand[500] }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{detail}</Text>
    </AnimatedPressable>
  );
}

function GoalCard({ goal, onKeyResult, onStatus, onDelete }) {
  const colors = useColors();
  const pace = PACE[goal.pace] || PACE.on_track;
  return (
    <View style={{
      marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.white,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200], gap: spacing.sm,
    }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <ProgressRing percent={goal.progress} size={52} stroke={6}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gray[900] }}>{goal.progress}%</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] }} numberOfLines={2}>{goal.title}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }} numberOfLines={1}>
            {SCOPE_LABEL(goal)} · {goal.status === 'achieved' ? 'achieved' : goal.status === 'dropped' ? 'dropped' : goal.days_left ? `${goal.days_left} days left` : 'ends today'} · by {formatDue(goal.ends_on)}
          </Text>
        </View>
        {goal.status === 'active' && <HealthPill level={pace.level} label={pace.label} compact />}
      </View>
      {!!goal.description && <Text style={{ fontSize: fontSize.sm, color: colors.gray[600], lineHeight: 19 }}>{goal.description}</Text>}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200], paddingTop: spacing.xs }}>
        {goal.key_results.map((kr) => <KeyResultRow key={kr.id} kr={kr} onPress={() => onKeyResult(kr, goal)} />)}
        {!goal.key_results.length && <Text style={{ fontSize: fontSize.sm, color: colors.gray[500], paddingVertical: 6 }}>No key results yet.</Text>}
      </View>
      {goal.can_manage && (
        <View style={{ flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.xs }}>
          {goal.status === 'active' ? (
            <AnimatedPressable onPress={() => onStatus(goal, 'achieved')}><Text style={styles.action}>Mark achieved</Text></AnimatedPressable>
          ) : (
            <AnimatedPressable onPress={() => onStatus(goal, 'active')}><Text style={styles.action}>Reopen</Text></AnimatedPressable>
          )}
          {goal.status === 'active' && <AnimatedPressable onPress={() => onStatus(goal, 'dropped')}><Text style={[styles.action, { color: colors.gray[500] }]}>Drop</Text></AnimatedPressable>}
          <AnimatedPressable onPress={() => onDelete(goal)}><Text style={[styles.action, { color: colors.red[600] }]}>Delete</Text></AnimatedPressable>
        </View>
      )}
    </View>
  );
}

export default function GoalsScreen({ embedded = false }) {
  const colors = useColors();
  const pageStyles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('active');
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // { kr, goal }

  const load = useCallback(async () => {
    try {
      const res = await api.get('/goals', { __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load goals');
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const replaceGoal = (goal) => setData((d) => (d ? { ...d, goals: d.goals.some((g) => g.id === goal.id) ? d.goals.map((g) => (g.id === goal.id ? goal : g)) : [goal, ...d.goals] } : d));

  const setStatus = async (goal, status) => {
    try {
      const res = await api.put(`/goals/${goal.id}`, { status });
      replaceGoal(res.data.goal);
      if (status === 'achieved') showToast({ message: 'Goal achieved', icon: 'trophy' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not update', icon: 'alert-circle' });
    }
  };

  const remove = async (goal) => {
    const ok = await confirmDialog({ title: 'Delete this goal?', message: goal.title, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/goals/${goal.id}`);
      setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== goal.id) }));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete', icon: 'alert-circle' });
    }
  };

  const goals = useMemo(() => {
    if (!data) return [];
    return data.goals.filter((g) => {
      if (filter === 'active') return g.status === 'active';
      if (filter === 'achieved') return g.status === 'achieved';
      return g.status !== 'dropped' && g.scope === filter;
    });
  }, [data, filter]);

  return (
    <View style={[pageStyles.container, { paddingTop: embedded ? 0 : insets.top }]}>
      {!embedded && (
        <View style={pageStyles.header}>
          <BackTitle title="Goals" style={pageStyles.title} />
          <Text style={pageStyles.subtitle}>What the company, your business and you are aiming for</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pageStyles.filters}>
          {FILTERS.map((f) => <Chip key={f.key} icon={f.icon} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
        </ScrollView>
        {!data && !error && <SkeletonList count={3} type="notification" />}
        {!!error && <EmptyHero icon="alert-circle" title="Could not load" message={error} />}
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} onKeyResult={(kr, goal) => setEditing({ kr, goal })} onStatus={setStatus} onDelete={remove} />
        ))}
        {data && !goals.length && (
          <EmptyHero
            icon="flag"
            title={filter === 'achieved' ? 'Nothing achieved yet' : 'No goals here'}
            message="Set a goal with two or three measurable key results, and watch it fill up as work gets done."
          />
        )}
      </ScrollView>
      <AnimatedPressable onPress={() => setCreating(true)} haptic="light" style={[pageStyles.fab, { bottom: 24 + insets.bottom }]}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={pageStyles.fabText}>New goal</Text>
      </AnimatedPressable>

      <GoalSheet visible={creating} onClose={() => setCreating(false)} onSaved={replaceGoal} options={data} />
      <KeyResultSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        kr={editing?.kr}
        canManage={!!editing?.goal.can_manage}
        onChanged={replaceGoal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { fontSize: fontSize.sm, fontWeight: '800', color: '#dc2626' },
});

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fab: {
    position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 999, backgroundColor: colors.brand[600], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
});
