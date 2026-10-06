import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { useChat } from '../../context/ChatContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { timeAgo } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import { glass } from '../../theme/glass';

const WORKING = ['queued', 'running'];

/**
 * "Run with Claude" for a to-do that mentions @claude. Nothing starts by itself: a person presses the
 * button, Claude changes the code on a branch and opens a pull request, and it only reaches main when
 * the same person (the developer) presses Approve. All permissions come from
 * GET /api/claude/todo/:id. Renders nothing for to-dos that do not mention @claude and have no run.
 */
export default function ClaudePanel({ todo }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { subscribe } = useChat();
  const [info, setInfo] = useState(null);
  const [repo, setRepo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/claude/todo/${todo.id}`, { __skipOops: true });
      setInfo(data);
      setRepo((current) => current || data.repos?.[0]?.key || null);
    } catch {
      // not available (older server, or no access): show nothing
    }
  }, [todo.id]);

  // Re-read when the to-do's text changes (so typing @claude shows the button), and on server events.
  useEffect(() => { load(); }, [load, todo.title, todo.notes, todo.comment_count]);
  useEffect(() => subscribe('todo:changed', (e) => { if (Number(e?.todoId) === Number(todo.id)) load(); }), [subscribe, todo.id, load]);

  const run = info?.runs?.[0] || null;
  const working = !!run && WORKING.includes(run.status);

  // Safety net while Claude works, in case a live event is missed.
  useEffect(() => {
    if (!working) return undefined;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [working, load]);

  // Everyone but the developer gets { enabled: false }: no card, no button, nothing.
  if (!info || info.enabled === false || (!info.mentioned && !run)) return null;

  const act = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      if (message) showToast({ message, tone: 'success' });
      await load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Something went wrong', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const label = info.repos.find((r) => r.key === repo)?.label || 'the project';
    const ok = await confirmDialog({
      title: 'Run Claude on this task?',
      message: `Claude will work on the ${label.toLowerCase()} in the background and open a pull request. Nothing changes on main until you approve it.`,
      confirmLabel: 'Run Claude',
    });
    if (ok) await act(() => api.post(`/claude/todo/${todo.id}/run`, { repo }), 'Claude is on it');
  };

  const approve = async () => {
    const ok = await confirmDialog({
      title: 'Merge into main?',
      message: 'This merges the change into main, and the live site and server redeploy with it.',
      confirmLabel: 'Approve & merge',
    });
    if (ok) await act(() => api.post(`/claude/runs/${run.id}/approve`), 'Merged into main');
  };

  const reject = async () => {
    const ok = await confirmDialog({
      title: 'Reject this change?',
      message: 'The pull request is closed and Claude\'s branch is deleted. Nothing is merged.',
      confirmLabel: 'Reject',
      destructive: true,
    });
    if (ok) await act(() => api.post(`/claude/runs/${run.id}/reject`), 'Rejected');
  };

  const openPr = () => {
    if (run?.pr_url && typeof window !== 'undefined') window.open(run.pr_url, '_blank', 'noopener');
  };

  const first = (name) => (name || 'Someone').split(' ')[0];
  const repoName = run ? (info.repos.find((r) => r.key === run.repo_key)?.label || run.repo_key) : '';

  // What is shown for the latest run.
  let head = null;
  if (run) {
    const map = {
      queued: { icon: 'hourglass-outline', title: 'Claude is starting', sub: `${repoName} · started ${timeAgo(run.created_at)} by ${first(run.triggered_by_name)}` },
      running: { icon: 'sparkles', title: 'Claude is working', sub: `${repoName} · this can take several minutes. You can leave this page.` },
      pr_ready: { icon: 'git-pull-request-outline', title: 'Ready for your approval', sub: `${repoName} · nothing is on main yet.` },
      merged: { icon: 'checkmark-done-circle-outline', title: 'Merged into main', sub: `${repoName} · approved by ${first(run.decided_by_name)} ${run.decided_at ? timeAgo(run.decided_at) : ''}` },
      rejected: { icon: 'close-circle-outline', title: 'Rejected', sub: `${repoName} · closed by ${first(run.decided_by_name)}. Nothing was merged.` },
      no_changes: { icon: 'remove-circle-outline', title: 'Claude changed nothing', sub: repoName },
      failed: { icon: 'alert-circle-outline', title: 'Claude could not finish', sub: repoName },
    };
    head = map[run.status] || map.failed;
  }
  const canStart = info.can_run && info.configured;

  return (
    <View style={styles.wrap}>
      <View {...glass('inset')} style={styles.card}>
        {head && (
          <View style={styles.head}>
            {working
              ? <ActivityIndicator size="small" color={colors.brand[700]} />
              : <Ionicons name={head.icon} size={18} color={colors.brand[700]} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{head.title}</Text>
              <Text style={styles.sub}>{head.sub}</Text>
            </View>
          </View>
        )}

        {!!run?.summary && !working && <Text style={styles.summary} numberOfLines={8}>{run.summary}</Text>}

        {run?.status === 'pr_ready' && (
          <View style={styles.buttons}>
            <Btn label="View changes" icon="open-outline" onPress={openPr} disabled={busy} />
            {info.can_decide && <Btn label="Reject" icon="close" onPress={reject} disabled={busy} />}
            {info.can_decide && <Btn label="Approve & merge" icon="checkmark-done" solid onPress={approve} disabled={busy} />}
          </View>
        )}
        {run?.status === 'merged' && !!run.pr_url && (
          <View style={styles.buttons}><Btn label="View pull request" icon="open-outline" onPress={openPr} /></View>
        )}

        {!working && run?.status !== 'pr_ready' && info.mentioned && (
          <>
            {!head && (
              <View style={styles.head}>
                <Ionicons name="sparkles-outline" size={18} color={colors.brand[700]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Claude can work on this</Text>
                  <Text style={styles.sub}>
                    {!info.configured
                      ? 'Claude runs are not set up on the server yet.'
                      : info.can_run
                        ? 'It starts only when you press the button, and nothing reaches main without your approval.'
                        : 'Claude already has a change waiting on this task.'}
                  </Text>
                </View>
              </View>
            )}
            {canStart && info.repos.length > 1 && (
              <View style={styles.chips}>
                {info.repos.map((r) => (
                  <AnimatedPressable key={r.key} style={[styles.chip, repo === r.key && styles.chipOn]} onPress={() => setRepo(r.key)}>
                    <Text style={[styles.chipText, repo === r.key && styles.chipTextOn]}>{r.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            )}
            {canStart && (
              <View style={styles.buttons}>
                <Btn label={run ? 'Run again' : 'Run with Claude'} icon="sparkles" solid onPress={start} disabled={busy || !repo} />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function Btn({ label, icon, solid, onPress, disabled }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
        paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: solid ? colors.brand[600] : colors.gray[100],
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Ionicons name={icon} size={16} color={solid ? '#fff' : colors.gray[700]} />
      <Text style={{ fontWeight: '600', fontSize: fontSize.sm, color: solid ? '#fff' : colors.gray[800] }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  card: {
    backgroundColor: colors.brand[50], borderRadius: radius.lg, padding: spacing.md, gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brand[200],
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 1, flexShrink: 1 },
  summary: { fontSize: fontSize.sm, color: colors.gray[700] },
  buttons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  chipOn: { backgroundColor: colors.brand[100] },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[700] },
  chipTextOn: { color: colors.brand[700] },
});
