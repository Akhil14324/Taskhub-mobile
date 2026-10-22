import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import WorkflowSheet from '../components/todos/WorkflowSheet';
import useIsDesktop from '../hooks/useBreakpoint';
import { formatDue } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

const EVERY = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };

/** Work that starts itself: each workflow creates its to-do and steps on schedule. */
export default function WorkflowsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const [list, setList] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editor, setEditor] = useState(null); // { initial } | {}

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api.get('/workflows', { __skipOops: true }),
        api.get('/workflows/suggestions', { __skipOops: true }),
      ]);
      setList(a.data.workflows || []);
      setIdeas(b.data.suggestions || []);
    } catch { /* keep what is shown */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const patch = async (w, body) => { await api.put(`/workflows/${w.id}`, body); load(); };
  const runNow = async (w) => {
    try {
      const res = await api.post(`/workflows/${w.id}/run`);
      showToast({ message: 'Started', tone: 'success', actionLabel: 'Open', onAction: () => res.data.todo_id && navigation.navigate('Main', { screen: 'Todos', params: { highlightId: res.data.todo_id } }) });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not start it', tone: 'error' });
    }
  };
  const remove = async (w) => {
    if (!(await confirmDialog({ title: `Delete "${w.name}"?`, message: 'To-dos it already made stay.', confirmLabel: 'Delete', destructive: true }))) return;
    await api.delete(`/workflows/${w.id}`);
    load();
  };

  return (
    <View style={{ flex: 1, paddingTop: desktop ? spacing.lg : insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 + insets.bottom }}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <BackTitle title="Workflows" />
        <Text style={styles.sub}>Work you repeat, set up once. Each round starts by itself with its steps ready.</Text>

        {ideas.length > 0 && (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={styles.label}>We noticed you repeat these</Text>
            {ideas.map((s, i) => (
              <View key={i} {...glass('card')} style={styles.card}>
                <View style={styles.head}>
                  <Ionicons name="sparkles" size={17} color={colors.brand[600]} />
                  <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
                </View>
                <Text style={styles.meta}>{EVERY[s.recurrence]} · done {s.occurrences} times · {s.steps.length} steps</Text>
                <AnimatedPressable style={styles.primary} onPress={() => setEditor({ initial: s })}>
                  <Text style={styles.primaryText}>Make it automatic</Text>
                </AnimatedPressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.label}>Your workflows</Text>
        {list.length === 0 && <Text style={styles.empty}>None yet. Make one from a suggestion above, from a to-do's menu, or start fresh.</Text>}
        {list.map((w) => (
          <View key={w.id} {...glass('card')} style={[styles.card, w.paused && { opacity: 0.6 }]}>
            <View style={styles.head}>
              <Ionicons name="repeat" size={17} color={colors.brand[600]} />
              <Text style={styles.name} numberOfLines={1}>{w.name}</Text>
              {w.paused && <Text style={styles.tag}>Paused</Text>}
            </View>
            <Text style={styles.meta}>{EVERY[w.recurrence]} · next {formatDue(w.next_run_date)}{w.business_name ? ` · ${w.business_name}` : ''}{w.sequential ? ' · one step at a time' : ''}</Text>
            {w.steps.map((s, i) => (
              <Text key={i} style={styles.step} numberOfLines={1}>{i + 1}. {s.title}{s.assignee_name ? ` (${s.assignee_name.split(' ')[0]})` : ''}</Text>
            ))}
            <View style={styles.btns}>
              <AnimatedPressable style={styles.small} onPress={() => runNow(w)}><Text style={styles.smallText}>Start now</Text></AnimatedPressable>
              <AnimatedPressable style={styles.small} onPress={() => patch(w, { paused: !w.paused })}><Text style={styles.smallText}>{w.paused ? 'Resume' : 'Pause'}</Text></AnimatedPressable>
              <AnimatedPressable style={styles.small} onPress={() => patch(w, { sequential: !w.sequential })}><Text style={styles.smallText}>{w.sequential ? 'All steps at once' : 'One at a time'}</Text></AnimatedPressable>
              <AnimatedPressable style={styles.small} onPress={() => remove(w)}><Ionicons name="trash-outline" size={15} color={colors.red[600]} /></AnimatedPressable>
            </View>
          </View>
        ))}

        <AnimatedPressable style={styles.add} onPress={() => setEditor({})}>
          <Ionicons name="add" size={19} color={colors.brand[600]} />
          <Text style={styles.addText}>New workflow</Text>
        </AnimatedPressable>
      </ScrollView>
      <WorkflowSheet visible={!!editor} initial={editor?.initial || null} onClose={() => setEditor(null)} onSaved={load} />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  sub: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm },
  empty: { fontSize: fontSize.base, color: colors.gray[500], marginBottom: spacing.lg },
  card: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.gray[900] },
  tag: { fontSize: 11, fontWeight: '700', color: colors.gray[600], backgroundColor: colors.gray[100], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  meta: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 4, marginBottom: 6 },
  step: { fontSize: fontSize.sm, color: colors.gray[700], paddingVertical: 1 },
  primary: { backgroundColor: colors.brand[600], borderRadius: 999, paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  small: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.gray[100], flexDirection: 'row', alignItems: 'center' },
  smallText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[800] },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.md },
  addText: { color: colors.brand[600], fontWeight: '700', fontSize: fontSize.base },
});
