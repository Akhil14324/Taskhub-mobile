import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useChat } from '../context/ChatContext';
import useFeature from '../hooks/useFeature';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import { on as onEvent, emit } from '../utils/events';
import { playReminder } from '../utils/feedback';
import { todayYmd } from '../utils/dates';
import { setFocusActive, focusToday, addFocus } from '../utils/focus';

const CHOICES = [15, 25, 45, 60, 90];
const runKey = (userId) => `th.focus.run.${userId}`;

const readRun = (userId) => { try { return JSON.parse(localStorage.getItem(runKey(userId)) || 'null'); } catch { return null; } };
const writeRun = (userId, run) => {
  try {
    if (run) localStorage.setItem(runKey(userId), JSON.stringify(run));
    else localStorage.removeItem(runKey(userId));
  } catch { /* storage blocked */ }
};

/** Full screen and landscape where the browser allows it (Android Chrome). Elsewhere the screen is rotated in CSS. */
async function enterLandscape() {
  try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch { /* not allowed */ }
  try { await window.screen.orientation.lock('landscape'); } catch { /* iOS and desktop cannot lock */ }
}
function leaveLandscape() {
  try { window.screen.orientation.unlock(); } catch { /* ignore */ }
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
}

const mmss = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Focus mode: pick a length, and the screen goes full-screen in landscape with one big timer until it
 * ends. Banners and reminders hold back meanwhile (the bell on a task still breaks through). Leaving the
 * app is counted and shown at the end. The session survives a reload.
 */
export default function FocusMode() {
  const colors = useColors();
  const { user } = useAuth();
  const { todos, toggleTodo, fetchComments } = useTodos();
  const { subscribe } = useChat();
  const { on } = useFeature();
  const { width, height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = user?.id;

  const [stage, setStage] = useState(null); // null | 'setup' | 'run' | 'done'
  const [target, setTarget] = useState(null); // { id, title }
  const [minutes, setMinutes] = useState(25);
  const [endAt, setEndAt] = useState(0);
  const [left, setLeft] = useState(0);
  const [away, setAway] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [totals, setTotals] = useState({ minutes: 0, sessions: 0 });
  const [comments, setComments] = useState([]);
  const [seen, setSeen] = useState(0); // comments that were there when the session began
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => onEvent('focus:open', (p) => {
    if (!onRef.current('focus')) return;
    setTarget(p?.todo ? { id: p.todo.id, title: p.todo.title } : null);
    setConfirmEnd(false);
    setStage('setup');
  }), []);

  // A session that was running when the page reloaded carries on (or is over).
  useEffect(() => {
    if (!userId) return;
    const run = readRun(userId);
    if (!run) return;
    setTarget(run.todoId ? { id: run.todoId, title: run.title } : null);
    setMinutes(run.minutes);
    setEndAt(run.end);
    setAway(run.away || 0);
    setStage(run.end > Date.now() ? 'run' : 'done');
    if (run.end > Date.now()) setFocusActive(true);
    else {
      // It ended while the app was closed: count it once, then forget the run.
      setTotals(addFocus(userId, todayYmd(), run.minutes));
      writeRun(userId, null);
    }
  }, [userId]);

  // Comments on the task you are focusing on show up while you work: loaded at the start, refreshed when
  // the task changes anywhere and every 30 s.
  const targetId = target?.id;
  useEffect(() => {
    if (stage !== 'run' || !targetId) { setComments([]); return undefined; }
    let live = true;
    let first = true;
    const load = () => fetchComments(targetId).then((list) => {
      if (!live) return;
      setComments(list);
      if (first) { setSeen(list.length); first = false; }
    }).catch(() => {});
    load();
    const unsub = subscribe('todo:changed', load);
    const id = setInterval(load, 30000);
    return () => { live = false; clearInterval(id); unsub(); };
  }, [stage, targetId, fetchComments, subscribe]);

  const finish = useCallback((run) => {
    setFocusActive(false);
    writeRun(userId, null);
    setTotals(addFocus(userId, todayYmd(), run.minutes));
    playReminder();
    try { window.screen.orientation.unlock(); } catch { /* ignore */ }
    emit('buddy', { type: 'focus-done', minutes: run.minutes });
    setStage('done');
  }, [userId]);

  // The clock reads the end time, so a throttled background tab still finishes on time.
  useEffect(() => {
    if (stage !== 'run') return undefined;
    const tick = () => {
      const remaining = endAt - Date.now();
      setLeft(remaining);
      if (remaining <= 0) finish({ minutes });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [stage, endAt, minutes, finish]);

  // Leaving the tab or app during a session is counted.
  useEffect(() => {
    if (stage !== 'run') return undefined;
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      setAway((n) => {
        const next = n + 1;
        const run = readRun(userId);
        if (run) writeRun(userId, { ...run, away: next });
        return next;
      });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stage, userId]);

  const start = () => {
    const end = Date.now() + minutes * 60000;
    setEndAt(end);
    setLeft(minutes * 60000);
    setAway(0);
    setConfirmEnd(false);
    writeRun(userId, { end, minutes, todoId: target?.id || null, title: target?.title || null, away: 0 });
    setFocusActive(true);
    setStage('run');
    enterLandscape();
  };

  const endEarly = () => {
    setFocusActive(false);
    writeRun(userId, null);
    leaveLandscape();
    setStage(null);
  };

  const close = () => {
    leaveLandscape();
    setStage(null);
  };

  if (!stage || !userId) return null;

  const today = stage === 'done' ? totals : focusToday(userId, todayYmd());
  const todo = target ? todos.find((t) => t.id === target.id) : null;
  const portrait = height > width;

  if (stage === 'setup') {
    return (
      <View style={styles.setupWrap}>
        <Pressable style={styles.scrim} onPress={() => setStage(null)} accessibilityLabel="Close" />
        <View {...glass('sheet')} style={styles.setupCard}>
          <View style={styles.row}>
            <Ionicons name="timer-outline" size={26} color={colors.brand[600]} />
            <Text style={styles.setupTitle}>Focus</Text>
          </View>
          <Text style={styles.setupText}>{target ? target.title : 'No task chosen. Just focus.'}</Text>
          <View style={styles.choices}>
            {CHOICES.map((m) => (
              <Pressable key={m} onPress={() => setMinutes(m)} style={[styles.choice, minutes === m && styles.choiceOn]}>
                <Text style={[styles.choiceText, minutes === m && { color: '#fff' }]}>{m} min</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            The screen goes full screen in landscape until the timer ends, and banners wait. Today: {today.minutes} min in {today.sessions} session{today.sessions === 1 ? '' : 's'}.
          </Text>
          <View style={styles.row}>
            <Pressable onPress={() => setStage(null)} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Cancel</Text></Pressable>
            <Pressable onPress={start} style={[styles.btn, styles.solid]}><Text style={styles.solidText}>Start {minutes} min</Text></Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Run and done fill the screen. While it runs, a phone held upright is turned on its side in CSS when the
  // browser cannot lock landscape; the end screen is shown the way the phone is held, so its buttons have room.
  const rotate = portrait && stage === 'run';
  const box = rotate
    ? { position: 'absolute', top: 0, left: 0, width: height, height: width, transform: `translateX(${width}px) rotate(90deg)`, transformOrigin: 'top left' }
    : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
  // Narrow screens stack the end buttons, one full-width button per row.
  const narrow = (rotate ? height : width) < 560;
  const progress = stage === 'run' ? Math.min(1, Math.max(0, 1 - left / (minutes * 60000))) : 1;

  return (
    <View style={styles.full}>
      <View style={[box, styles.screen]}>
        {stage === 'run' ? (
          <>
            <Text style={styles.small}>{target ? 'Working on' : 'Focus'}</Text>
            {!!target && <Text style={styles.task} numberOfLines={2}>{target.title}</Text>}
            {!!todo?.notes && (
              <ScrollView style={styles.notesBox}><Text style={styles.notes}>{todo.notes}</Text></ScrollView>
            )}
            <Text style={styles.clock}>{mmss(left)}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
            {comments.length > 0 && (
              <View style={styles.commentsBox}>
                <Text style={styles.commentsHead}>
                  Comments{comments.length > seen ? ' · ' + (comments.length - seen) + ' new' : ''}
                </Text>
                <ScrollView>
                  {comments.slice(-4).map((c, i, arr) => (
                    <Text key={c.id} style={[styles.comment, comments.length - arr.length + i >= seen && styles.commentNew]} numberOfLines={3}>
                      <Text style={styles.commentWho}>{c.user_name || 'Someone'}: </Text>{c.body}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}
            <Text style={styles.small}>Stay on this one thing. {away > 0 ? `You have left the app ${away} time${away === 1 ? '' : 's'}.` : ''}</Text>
            <View style={styles.endRow}>
              {confirmEnd ? (
                <>
                  <Text style={[styles.small, styles.confirmText]}>End the session now?</Text>
                  <Pressable onPress={() => setConfirmEnd(false)} style={[styles.pill, styles.solidLight]}><Text style={styles.solidLightText}>Keep going</Text></Pressable>
                  <Pressable onPress={endEarly} style={[styles.pill, styles.ghostLight]}><Text style={styles.ghostLightText}>End</Text></Pressable>
                </>
              ) : (
                <Pressable onPress={() => setConfirmEnd(true)} hitSlop={10}><Text style={styles.endLink}>End early</Text></Pressable>
              )}
            </View>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={64} color="#fff" />
            <Text style={styles.doneTitle}>Session complete</Text>
            <Text style={styles.small}>{minutes} minutes{target ? ` on ${target.title}` : ''}</Text>
            <Text style={styles.small}>
              {away > 0 ? `You left the app ${away} time${away === 1 ? '' : 's'}.` : 'No interruptions.'} Today: {today.minutes} min in {today.sessions} session{today.sessions === 1 ? '' : 's'}.
            </Text>
            <View style={[styles.endRow, narrow && styles.endColumn]}>
              {!!todo && !todo.is_done && todo.permissions?.can_change_status !== false && (
                <Pressable onPress={async () => { await toggleTodo(todo); close(); }} style={[styles.pill, narrow && styles.pillWide, styles.solidLight]}><Text style={styles.solidLightText}>Mark task done</Text></Pressable>
              )}
              <Pressable onPress={() => { leaveLandscape(); setStage('setup'); }} style={[styles.pill, narrow && styles.pillWide, styles.ghostLight]}><Text style={styles.ghostLightText}>Another round</Text></Pressable>
              <Pressable onPress={close} style={[styles.pill, narrow && styles.pillWide, styles.ghostLight]}><Text style={styles.ghostLightText}>Close</Text></Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  setupWrap: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  setupCard: { width: '100%', maxWidth: 420, padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md },
  setupTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  setupText: { fontSize: fontSize.base, color: colors.gray[800], fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.gray[100] },
  choiceOn: { backgroundColor: colors.brand[600] },
  choiceText: { fontWeight: '700', color: colors.gray[800], fontSize: fontSize.sm },
  hint: { fontSize: fontSize.sm, color: colors.gray[600] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.md },
  ghost: { backgroundColor: colors.gray[100] },
  ghostText: { fontWeight: '600', color: colors.gray[800] },
  solid: { backgroundColor: colors.brand[600] },
  solidText: { fontWeight: '700', color: '#fff' },
  full: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, backgroundColor: '#140606' },
  screen: { backgroundColor: '#140606', alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  notesBox: { maxHeight: 90, maxWidth: 640, alignSelf: 'center' },
  notes: { color: 'rgba(255,255,255,0.75)', fontSize: fontSize.base, textAlign: 'center', lineHeight: 22 },
  commentsBox: { width: '70%', maxWidth: 640, maxHeight: 130, padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  commentsHead: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  comment: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm, marginBottom: 4 },
  commentNew: { color: '#fff', fontWeight: '600' },
  commentWho: { fontWeight: '800' },
  clock: { color: '#fff', fontSize: 96, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 2 },
  task: { color: '#fff', fontSize: fontSize.xxl, fontWeight: '700', textAlign: 'center', maxWidth: 640 },
  small: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.base, textAlign: 'center', maxWidth: 560 },
  doneTitle: { color: '#fff', fontSize: 40, fontWeight: '800' },
  track: { width: '70%', maxWidth: 640, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#ef4444' },
  endRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  endColumn: { flexDirection: 'column', alignItems: 'stretch', alignSelf: 'center', width: '100%', maxWidth: 320 },
  confirmText: { width: '100%' },
  endLink: { color: 'rgba(255,255,255,0.55)', fontSize: fontSize.sm, textDecorationLine: 'underline' },
  // Each end button keeps its natural width (never "flex: 1" here: overridden to 0 it left a 0% basis and the
  // three buttons collapsed onto each other).
  pill: {
    flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 150, minHeight: 48,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999,
  },
  pillWide: { minWidth: 0, width: '100%' },
  solidLight: { backgroundColor: '#fff' },
  solidLightText: { textAlign: 'center', whiteSpace: 'nowrap', color: '#991b1b', fontWeight: '800', fontSize: fontSize.base },
  ghostLight: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  ghostLightText: { textAlign: 'center', whiteSpace: 'nowrap', color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});
