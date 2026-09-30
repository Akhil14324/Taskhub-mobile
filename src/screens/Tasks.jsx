import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useNotifications } from '../context/NotificationContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/BottomSheet';
import { SkeletonList } from '../components/Skeleton';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import TaskCard from '../components/tasks/TaskCard';
import TaskFormSheet from '../components/tasks/TaskFormSheet';
import { Chip, Fab, IconButton, EmptyHero, accent } from '../components/kit';
import { TASK_FILTERS } from '../utils/taskMeta';
import { showToast } from '../utils/events';

const VIEWS = [
  { key: 'mine', label: 'My tasks', icon: 'person' },
  { key: 'delegated', label: 'I assigned', icon: 'arrow-redo' },
  { key: 'all', label: 'All', icon: 'grid' },
];

export default function Tasks() {
  const { user } = useAuth();
  const { subscribe } = useChat();
  const { approvalCount } = useNotifications();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const [view, setView] = useState(user?.is_leader ? 'all' : 'mine');
  const [statusFilter, setStatusFilter] = useState('open');
  const [businessId, setBusinessId] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [bizPickerOpen, setBizPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const requestId = useRef(0);

  // Deep links: Tasks tab opened with a business filter or "new task" preset.
  useEffect(() => {
    const bid = Number(route.params?.business_id);
    if (bid) {
      setBusinessId(bid);
      setView('all');
      navigation.setParams({ business_id: undefined });
    }
    if (route.params?.create) {
      setFormOpen(route.params.create === true ? true : route.params.create);
      navigation.setParams({ create: undefined });
    }
  }, [route.params?.business_id, route.params?.create, navigation]);

  const fetchTasks = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const params = { view, limit: 200 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (businessId) params.business_id = businessId;
      if (query.trim()) params.q = query.trim();
      const [res, sum] = await Promise.all([
        api.get('/tasks', { params, __skipOops: true }),
        api.get('/tasks/summary', { __skipOops: true }),
      ]);
      if (id !== requestId.current) return;
      setTasks(res.data.tasks || []);
      setSummary(sum.data);
    } catch (err) {
      if (id === requestId.current) showToast({ message: err.response?.data?.error || 'Could not load tasks', tone: 'error' });
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [view, statusFilter, businessId, query]);

  useEffect(() => {
    const t = setTimeout(fetchTasks, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchTasks, query]);

  useFocusEffect(useCallback(() => {
    fetchTasks();
  }, [fetchTasks]));

  useEffect(() => {
    api.get('/businesses/directory', { __skipOops: true }).then((res) => setBusinesses(res.data.businesses || [])).catch(() => {});
  }, []);

  // Live updates from other people.
  useEffect(() => {
    let timer;
    const off = subscribe('task:changed', () => {
      clearTimeout(timer);
      timer = setTimeout(fetchTasks, 500);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [subscribe, fetchTasks]);

  const toggleTask = useCallback(async (task) => {
    const next = task.status === 'completed' ? 'pending' : 'completed';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next === 'completed' ? 'completed' : 'pending' } : t)));
    try {
      const res = await api.put(`/tasks/${task.id}/status`, { status: next });
      const updated = res.data.task;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      if (updated.status === 'in_review') {
        showToast({ message: 'Sent for review ✅', tone: 'success', icon: 'shield-checkmark' });
      } else if (updated.status === 'completed') {
        showToast({
          message: 'Task completed 🎉',
          tone: 'success',
          actionLabel: 'Undo',
          onAction: async () => {
            const r = await api.put(`/tasks/${task.id}/status`, { status: 'pending' }).catch(() => null);
            if (r) setTasks((prev) => prev.map((t) => (t.id === task.id ? r.data.task : t)));
          },
        });
      }
      if (statusFilter === 'open' && updated.status === 'completed') {
        setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== task.id)), 700);
      }
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      showToast({ message: err.response?.data?.error || 'Could not update the task', tone: 'error' });
    }
  }, [statusFilter]);

  const openTask = useCallback((task) => navigation.navigate('TaskDetail', { taskId: task.id }), [navigation]);

  const selectedBiz = businesses.find((b) => b.id === businessId);
  const viewCounts = { mine: summary?.mine_open, delegated: summary?.delegated_open };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Tasks</Text>
          {summary && (
            <Text style={styles.subtitle}>
              {summary.mine_open} open for you
              {summary.overdue ? ` · ${summary.overdue} overdue` : ''}
              {summary.completed_week ? ` · ${summary.completed_week} done this week` : ''}
            </Text>
          )}
        </View>
        <IconButton icon={searchOpen ? 'close' : 'search'} onPress={() => { setSearchOpen((s) => !s); setQuery(''); }} />
        <IconButton icon="shield-checkmark-outline" badge={approvalCount} onPress={() => navigation.navigate('Approvals')} accessibilityLabel="Approvals" />
      </View>

      {searchOpen && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.gray[400]} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks"
            placeholderTextColor={colors.gray[400]}
            style={styles.searchInput}
          />
        </Animated.View>
      )}

      {/* View switcher */}
      <View style={styles.segment}>
        {VIEWS.map((v) => {
          const active = view === v.key;
          return (
            <AnimatedPressable key={v.key} style={[styles.segmentItem, active && styles.segmentActive]} onPress={() => setView(v.key)} haptic="light">
              <Ionicons name={v.icon} size={14} color={active ? colors.brand[600] : colors.gray[500]} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{v.label}</Text>
              {!!viewCounts[v.key] && <Text style={[styles.segmentCount, active && { color: colors.brand[600] }]}>{viewCounts[v.key]}</Text>}
            </AnimatedPressable>
          );
        })}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>
        <Chip
          icon="business"
          label={selectedBiz ? selectedBiz.name : 'All businesses'}
          color={selectedBiz ? accent(selectedBiz.color) : colors.gray[600]}
          active={!!selectedBiz}
          onPress={() => setBizPickerOpen(true)}
          onRemove={selectedBiz ? () => setBusinessId(null) : undefined}
        />
        {TASK_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.key === 'overdue' && summary?.overdue ? `Overdue ${summary.overdue}` : f.label}
            color={f.key === 'overdue' ? colors.red[600] : colors.brand[600]}
            active={statusFilter === f.key}
            onPress={() => setStatusFilter(f.key)}
          />
        ))}
      </ScrollView>

      {loading ? (
        <SkeletonList count={5} type="task" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.list, { paddingBottom: 140 + insets.bottom }]}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); }} />}
        >
          {tasks.map((task) => (
            <Animated.View key={task.id} layout={LinearTransition.springify().damping(18)} entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)}>
              <TaskCard task={task} currentUserId={user?.id} onPress={openTask} onToggle={toggleTask} />
            </Animated.View>
          ))}
          {tasks.length === 0 && (
            <EmptyHero
              icon={statusFilter === 'completed' ? 'trophy-outline' : view === 'delegated' ? 'arrow-redo-outline' : 'checkmark-done'}
              title={query ? 'No tasks match' : view === 'mine' ? 'Nothing on your plate' : view === 'delegated' ? 'You haven’t assigned anything' : 'No tasks here'}
              message={view === 'delegated'
                ? 'Tap “New task” to hand work to someone — in your business or any other.'
                : 'New tasks assigned to you will show up here instantly.'}
            />
          )}
        </ScrollView>
      )}

      <Fab icon="add" label="New task" color={colors.brand[600]} onPress={() => setFormOpen(true)} bottom={24 + insets.bottom} />

      <TaskFormSheet
        visible={!!formOpen}
        onClose={() => setFormOpen(false)}
        preset={typeof formOpen === 'object' ? formOpen : (businessId ? { business_id: businessId } : undefined)}
        onSaved={() => fetchTasks()}
      />

      <BottomSheet visible={bizPickerOpen} onClose={() => setBizPickerOpen(false)} maxHeight={520}>
        <Text style={styles.sheetTitle}>Filter by business</Text>
        <ScrollView style={{ flexShrink: 1 }}>
          <AnimatedPressable style={styles.bizRow} onPress={() => { setBusinessId(null); setBizPickerOpen(false); }} haptic="light">
            <Ionicons name="grid-outline" size={18} color={colors.gray[500]} />
            <Text style={styles.bizName}>All businesses</Text>
            {!businessId && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
          </AnimatedPressable>
          {businesses.map((b) => (
            <AnimatedPressable key={b.id} style={styles.bizRow} onPress={() => { setBusinessId(b.id); setBizPickerOpen(false); }} haptic="light">
              <View style={[styles.bizDot, { backgroundColor: accent(b.color) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bizName}>{b.name}</Text>
                {!!b.heads?.length && <Text style={styles.bizHeads}>Head: {b.heads.map((h) => h.name).join(', ')}</Text>}
              </View>
              {businessId === b.id && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
            </AnimatedPressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.gray[100],
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  segmentActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[500] },
  segmentTextActive: { color: colors.gray[900] },
  segmentCount: { fontSize: 11, fontWeight: '700', color: colors.gray[400] },
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.lg },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  bizDot: { width: 12, height: 12, borderRadius: 6 },
  bizName: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  bizHeads: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
});
