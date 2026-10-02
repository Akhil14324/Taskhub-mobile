import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import BlockerSheet from './BlockerSheet';
import { HealthBanner, MetricsGrid, TimelineEntries, useNowTick } from './TimeHealth';
import { Avatar, Chip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { STATUS, BLOCKER_KINDS, formatSeconds, healthColor } from '../../utils/timeline';
import { timeAgo } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

/**
 * Status, accountable person, blockers, "post an update", the numbers and the full history of one
 * to-do. Lives in the to-do detail sheet.
 */
export default function TodoTimeline({ todo }) {
  const colors = useColors();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { fetchTimeline, setTodoStatus, toggleTodo, resolveBlocker, postUpdate } = useTodos();
  const now = useNowTick();
  const [data, setData] = useState({ entries: [], blockers: [], metrics: { reschedules: 0 } });
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [progress, setProgress] = useState(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchTimeline(todo.id));
    } catch {
      // keep what we had
    }
  }, [fetchTimeline, todo.id]);

  // Reload whenever something about the to-do changes (status, owner, blockers, comments, edits).
  useEffect(() => { load(); }, [load, todo.updated_at, todo.status, todo.assignee_id, todo.open_blocker_count, todo.comment_count]);

  const openBlockers = data.blockers.filter((b) => !b.resolved_at);
  const closedBlockers = data.blockers.filter((b) => b.resolved_at);

  const pickStatus = async (key) => {
    try {
      if (key === 'done') {
        if (!todo.is_done) await toggleTodo(todo);
      } else if (todo.is_done) {
        await toggleTodo(todo); // reopen
      } else if (key === 'blocked') {
        if (todo.status !== 'blocked') setBlockerOpen(true);
      } else if (todo.status === 'blocked') {
        showToast({ message: 'Clear the blockers below first', icon: 'hand-left' });
      } else if (todo.status !== key) {
        await setTodoStatus(todo, key);
      }
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not change the status', tone: 'error' });
    }
  };

  const clearBlocker = async (blocker) => {
    const ok = await confirmDialog({
      title: 'Clear this blocker?',
      message: 'The to-do goes back to work and the blocked-time clock stops.',
      confirmLabel: 'Clear',
    });
    if (!ok) return;
    try {
      await resolveBlocker(blocker.id);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not clear it', tone: 'error' });
    }
  };

  const post = async () => {
    const note = updateText.trim();
    if (!note || posting) return;
    setPosting(true);
    try {
      await postUpdate(todo.id, note, progress);
      setUpdateText('');
      setProgress(null);
      load();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not post the update', tone: 'error' });
    } finally {
      setPosting(false);
    }
  };

  const activeStatus = todo.is_done ? 'done' : todo.status;
  const assigneeIsMe = todo.assignee_id === user?.id;
  const perms = todo.permissions || {};
  const canWork = perms.can_change_status !== false && todo.review_state !== 'proposed' && todo.review_state !== 'rejected';
  const statusKeys = ['todo', 'in_progress', 'blocked', 'on_hold', 'done'];

  return (
    <View>
      <Text style={styles.label}>Status & time</Text>
      <View style={styles.statusRow}>
        {statusKeys.map((key) => (
          <Chip
            key={key}
            icon={STATUS[key].icon}
            label={STATUS[key].label}
            color={key === 'blocked' ? healthColor('red', theme) : key === 'in_progress' ? colors.brand[700] : key === 'done' ? colors.brand[800] : colors.gray[600]}
            active={activeStatus === key}
            onPress={canWork || (key === 'on_hold' && perms.can_hold) ? () => pickStatus(key) : undefined}
          />
        ))}
        {activeStatus === 'in_review' && (
          <Chip icon={STATUS.in_review.icon} label={STATUS.in_review.label} color={colors.brand[700]} active />
        )}
      </View>

      <HealthBanner todo={todo} now={now} />

      {/* Who is accountable */}
      <AnimatedPressable style={styles.assignee} onPress={() => (perms.can_assign !== false ? setAssignOpen(true) : null)} haptic="light">
        <Avatar name={todo.assignee_name || todo.created_by_name || '?'} size={30} />
        <View style={{ flex: 1 }}>
          <Text style={styles.assigneeLabel}>Accountable</Text>
          <Text style={styles.assigneeName}>{assigneeIsMe ? 'You' : todo.assignee_name || (todo.business_id ? 'Open to the business' : 'Nobody')}</Text>
        </View>
        {!!todo.assigned_at && <Text style={styles.assignedAgo}>since {timeAgo(todo.assigned_at)}</Text>}
        {perms.can_assign !== false && <Ionicons name="swap-horizontal" size={18} color={colors.gray[400]} />}
      </AnimatedPressable>

      {/* Open blockers */}
      {openBlockers.map((b) => {
        const meta = BLOCKER_KINDS[b.kind];
        const level = b.kind === 'dead_stop' ? 'red' : 'orange';
        const since = Math.round((now - new Date(b.raised_at).getTime()) / 1000);
        return (
          <View key={b.id} style={[styles.blocker, { borderColor: healthColor(level, theme) }]}>
            <Ionicons name={meta.icon} size={22} color={healthColor(level, theme)} />
            <View style={{ flex: 1 }}>
              <Text style={styles.blockerTitle}>{meta.label}{[b.blocked_by_todo_title, b.blocked_by_user_name].filter(Boolean).map((v, i) => `${i ? ' · ' : ': '}${v}`).join('')}</Text>
              {!!b.note && <Text style={styles.blockerNote}>{b.note}</Text>}
              {Array.isArray(b.mentions) && b.mentions.length > 0 && (
                <Text style={styles.blockerNote}>Tagged: {b.mentions.map((m) => `@${m.label}`).join(', ')}</Text>
              )}
              <Text style={[styles.blockerTime, { color: healthColor(level, theme) }]}>Blocked for {formatSeconds(since)} · raised by {b.raised_by === user?.id ? 'you' : b.raised_by_name}</Text>
            </View>
            <AnimatedPressable onPress={() => clearBlocker(b)} haptic="medium" style={styles.clearBtn}>
              <Text style={styles.clearText}>Clear</Text>
            </AnimatedPressable>
          </View>
        );
      })}
      {!todo.is_done && todo.status !== 'blocked' && canWork && (
        <AnimatedPressable style={styles.addBlocker} onPress={() => setBlockerOpen(true)} haptic="light">
          <Ionicons name="hand-left-outline" size={17} color={colors.brand[600]} />
          <Text style={styles.addBlockerText}>Raise a blocker — dependency, decision, issue or dead stop</Text>
        </AnimatedPressable>
      )}

      {/* Post an update */}
      {!todo.is_done && canWork && (
        <View style={styles.updateBox}>
          <TextInput
            value={updateText}
            onChangeText={setUpdateText}
            placeholder="Post an update — what changed? (starts the work if not started)"
            placeholderTextColor={colors.gray[400]}
            style={styles.updateInput}
            multiline
          />
          {(updateText.trim().length > 0) && (
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Progress</Text>
              {PROGRESS_STEPS.map((p) => (
                <Chip key={p} small label={`${p}%`} active={progress === p} onPress={() => setProgress(progress === p ? null : p)} />
              ))}
            </View>
          )}
          <AnimatedPressable onPress={post} disabled={!updateText.trim() || posting} haptic="light" style={[styles.postBtn, { opacity: updateText.trim() && !posting ? 1 : 0.4 }]}>
            <Ionicons name="paper-plane" size={15} color="#fff" />
            <Text style={styles.postText}>Post update</Text>
          </AnimatedPressable>
        </View>
      )}

      <Text style={styles.label}>Numbers</Text>
      <MetricsGrid todo={todo} now={now} reschedules={data.metrics?.reschedules || 0} />

      <Text style={styles.label}>History</Text>
      <TimelineEntries entries={data.entries} userId={user?.id} limit={showAll ? 0 : 8} onShowAll={() => setShowAll(true)} />
      {closedBlockers.length > 0 && (
        <Text style={styles.closedNote}>{closedBlockers.length} blocker{closedBlockers.length === 1 ? '' : 's'} cleared so far</Text>
      )}

      <BlockerSheet visible={blockerOpen} todo={todo} onClose={() => setBlockerOpen(false)} />
      <AssignSheet visible={assignOpen} todo={todo} onClose={() => setAssignOpen(false)} />
    </View>
  );
}

/** Pick who is accountable: people already on the to-do first, then anyone in the directory. */
export function AssignSheet({ visible, todo, onClose }) {
  const colors = useColors();
  const { assignTodoTo, fetchAssignees } = useTodos();
  const { people } = useDirectory();
  const [query, setQuery] = useState('');
  const [bizPeople, setBizPeople] = useState([]);
  useEffect(() => { if (visible) setQuery(''); }, [visible]);
  // Business work can only be given to people who belong to that business (or leadership).
  useEffect(() => {
    if (!visible || !todo.business_id) return;
    fetchAssignees(todo.business_id).then(setBizPeople).catch(() => setBizPeople([]));
  }, [visible, todo.business_id, fetchAssignees]);

  const memberIds = new Set((todo.members || []).map((m) => m.id));
  const q = query.trim();
  const pool = todo.business_id ? bizPeople : people;
  const list = q || todo.business_id
    ? filterPeople(pool, q, { limit: 12 })
    : (todo.members || []);

  const pick = async (person) => {
    onClose();
    try {
      await assignTodoTo(todo.id, person.id);
      showToast({ message: `${person.name.split(' ')[0]} is now accountable`, tone: 'success', icon: 'person-add' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not assign', tone: 'error' });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={560} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm }}>
        <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] }}>Who is accountable?</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2, marginBottom: spacing.md }}>
          They are added to the to-do, and their response clock starts now.
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={todo.business_id ? 'Search people in this business' : 'Search anyone in the organisation'}
          placeholderTextColor={colors.gray[400]}
          style={{ backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' }}
        />
        {list.map((p) => (
          <AnimatedPressable key={p.id} onPress={() => pick(p)} haptic="light" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 }}>
            <Avatar name={p.name} uri={p.profile_picture} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] }}>{p.name}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.gray[500] }}>@{p.username}{memberIds.has(p.id) ? ' · on this to-do' : ''}</Text>
            </View>
            {todo.assignee_id === p.id && <Ionicons name="checkmark-circle" size={22} color={colors.brand[600]} />}
          </AnimatedPressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm },
  assignee: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  assigneeLabel: { fontSize: 10, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.4 },
  assigneeName: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  assignedAgo: { fontSize: fontSize.xs, color: colors.gray[400] },
  blocker: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: spacing.sm, marginTop: spacing.sm },
  blockerTitle: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[900] },
  blockerNote: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 2, lineHeight: 18 },
  blockerTime: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  clearText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.gray[800] },
  addBlocker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, marginTop: spacing.xs },
  addBlockerText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  updateBox: { marginHorizontal: spacing.sm, marginTop: spacing.md, backgroundColor: colors.gray[100], borderRadius: radius.lg, padding: spacing.sm },
  updateInput: { minHeight: 44, maxHeight: 110, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  progressRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  progressLabel: { fontSize: 11, fontWeight: '700', color: colors.gray[500], marginRight: 4 },
  postBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.brand[600] },
  postText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  closedNote: { fontSize: fontSize.xs, color: colors.gray[400], paddingHorizontal: spacing.sm, marginLeft: 38 },
});
