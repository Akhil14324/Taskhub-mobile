import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import useMeetingRecorder from '../hooks/useMeetingRecorder';
import ConsentOverlay, { CONSENT_TEXT } from '../components/meetings/ConsentOverlay';
import MeetingAsk from '../components/meetings/MeetingAsk';
import DraftReviewSheet from '../components/drafts/DraftReviewSheet';
import { showToast, confirmDialog } from '../utils/events';
import { timeAgo, formatDue } from '../utils/dates';

const clock = (s) => {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
};

const lengthOf = (ms) => {
  const min = Math.round(Number(ms || 0) / 60000);
  if (min < 1) return '';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

const defaultTitle = () => `Meeting, ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

/**
 * Meetings: one person records the whole meeting (one to three hours is fine). What is said appears on screen
 * about every twenty seconds and the whole transcript is saved. When the recording stops, the summary, the
 * decisions and every task that was given are worked out; each task is one click away from the person it is
 * for. Afterwards the meeting can be asked questions. Only the person who recorded it sees it; no sound is kept.
 */
export default function MeetingNotesScreen({ embedded = false }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    try {
      const res = await api.get('/meeting-notes', { __skipOops: true });
      setList(res.data.meetings || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your meetings');
    }
  }, []);
  useFocusEffect(useCallback(() => { loadList(); }, [loadList]));

  // One press: the meeting exists and is open, ready to record. It can be named any time.
  const create = async () => {
    try {
      const res = await api.post('/meeting-notes', { title: defaultTitle() });
      setOpenId(res.data.meeting.id);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not start the meeting', tone: 'error' });
    }
  };

  const remove = async (id) => {
    const ok = await confirmDialog({ title: 'Delete this meeting?', message: 'Its transcript, summary and questions are removed. Tasks already given stay.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/meeting-notes/${id}`);
      setOpenId(null);
      loadList();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete it', tone: 'error' });
    }
  };

  if (openId) {
    return <MeetingView id={openId} embedded={embedded} onBack={() => { setOpenId(null); loadList(); }} onDelete={() => remove(openId)} />;
  }

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: embedded ? spacing.lg : insets.top + spacing.md, paddingBottom: insets.bottom + 120 }]}>
      <View style={styles.column}>
        {!embedded && <BackTitle title="Meetings" style={styles.title} />}
        <View style={styles.listHead}>
          <Text style={styles.lead}>Record a meeting. You get the transcript, a summary, and every task ready to give to the person it is for.</Text>
          <AnimatedPressable style={styles.primary} onPress={create}>
            <Ionicons name="mic" size={18} color="#fff" />
            <Text style={styles.primaryText}>New meeting</Text>
          </AnimatedPressable>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {list === null && !error && <ActivityIndicator color={colors.brand[600]} style={{ marginTop: spacing.xl }} />}
        {list && list.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="mic-outline" size={26} color={colors.gray[400]} />
            <Text style={styles.emptyTitle}>No meetings yet</Text>
            <Text style={styles.hint}>Press New meeting when the next one starts.</Text>
          </View>
        )}
        {(list || []).map((m) => (
          <AnimatedPressable key={m.id} {...glass('card')} style={styles.row} onPress={() => setOpenId(m.id)}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {[m.owner_name ? `Recorded by ${m.owner_name}` : null, timeAgo(m.created_at), lengthOf(m.duration_ms), Number(m.chars) ? null : 'Nothing recorded yet'].filter(Boolean).join('  ·  ')}
              </Text>
              {!!m.summary && <Text style={styles.rowSummary} numberOfLines={2}>{m.summary}</Text>}
            </View>
            {m.drafts > 0 && m.mine !== false && (
              <View style={styles.badge}><Text style={styles.badgeText}>{m.drafts} to give</Text></View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        ))}
      </View>
    </ScrollView>
  );
}

const TABS = [['summary', 'Summary'], ['tasks', 'Tasks'], ['transcript', 'Transcript'], ['ask', 'Ask AI']];

function MeetingView({ id, embedded, onBack, onDelete }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const canShareTab = width >= 900;
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [pieces, setPieces] = useState(0);
  const [result, setResult] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [given, setGiven] = useState(0);
  const [tab, setTab] = useState('summary');
  const [withTab, setWithTab] = useState(false);
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState('');
  const recordedHere = useRef(false);
  const liveBox = useRef(null);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await api.get('/drafts', { params: { meeting_id: id }, __skipOops: true });
      setDrafts(res.data.drafts || []);
    } catch { setDrafts((d) => d || []); }
  }, [id]);

  useEffect(() => {
    let live = true;
    api.get(`/meeting-notes/${id}`, { __skipOops: true }).then((res) => {
      if (!live) return;
      const m = res.data.meeting;
      setNote(m);
      setTitle(m.title);
      setTranscript(m.transcript || '');
      setPieces(m.pieces || 0);
      setResult(m.extracted || null);
    }).catch(() => showToast({ message: 'Could not open this meeting', tone: 'error' }));
    loadDrafts();
    return () => { live = false; };
  }, [id, loadDrafts]);

  const recorder = useMeetingRecorder({
    send: async (blob, { pieceNo, durationMs } = {}) => {
      const form = new FormData();
      form.append('file', blob, `part.${(blob.type || '').includes('mp4') ? 'mp4' : 'webm'}`);
      // Numbered: the server keeps each piece once, so a retry after a dropped connection never doubles the text.
      if (pieceNo !== undefined) form.append('piece_no', String(pieceNo));
      if (durationMs) form.append('duration_ms', String(durationMs));
      const res = await api.post(`/meeting-notes/${id}/audio`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000, __skipOops: true });
      setPieces(res.data.pieces || 0);
      if (res.data.text) setTranscript((t) => (t ? `${t}\n${res.data.text}` : res.data.text));
    },
    onError: (err) => showToast({ message: err.response?.data?.error || 'A part of the recording could not be read yet. It is kept and tried again.', tone: 'error' }),
  });

  const busyHere = recorder.recording || recorder.queued > 0;
  const hasText = transcript.trim().length > 40;

  // The live transcript follows the newest words.
  useEffect(() => {
    if (recorder.recording) liveBox.current?.scrollToEnd?.({ animated: true });
  }, [transcript, recorder.recording]);

  // Summary, decisions and tasks, read from the whole transcript (two readings side by side).
  const readMeeting = useCallback(async () => {
    setReading(true);
    const [sum, tasks] = await Promise.allSettled([
      api.post(`/meeting-notes/${id}/extract`, { create: false }, { timeout: 300000, __skipOops: true }),
      api.post(`/meeting-notes/${id}/drafts`, {}, { timeout: 300000, __skipOops: true }),
    ]);
    if (sum.status === 'fulfilled') setResult(sum.value.data);
    if (tasks.status === 'fulfilled') setDrafts(tasks.value.data.drafts || []);
    const failed = [sum, tasks].find((r) => r.status === 'rejected');
    if (failed) showToast({ message: failed.reason?.response?.data?.error || 'The meeting could not be read fully. Press Read again.', tone: 'error' });
    else if (tasks.value.data.drafts?.length) setTab('tasks');
    setReading(false);
  }, [id]);

  // When a recording made here has stopped and its last part is written down, read the meeting by itself.
  useEffect(() => {
    if (recordedHere.current && !busyHere && hasText && !reading) {
      recordedHere.current = false;
      readMeeting();
    }
  }, [busyHere, hasText, reading, readMeeting]);

  // Every recording starts with the consent notice, on screen and spoken, for 3 seconds.
  const startRecording = () => {
    try {
      const say = new window.SpeechSynthesisUtterance(CONSENT_TEXT);
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(say);
    } catch { /* this browser cannot speak: the notice is still on screen */ }
    setConsent(true);
  };
  const beginAfterConsent = async () => {
    setConsent(false);
    const ok = await recorder.start({ withTab: canShareTab && withTab, firstPiece: pieces });
    if (!ok) showToast({ message: 'The microphone could not be used. Allow it in the browser and try again.', tone: 'error' });
    else recordedHere.current = true;
  };

  const saveTitle = async () => {
    const next = title.trim() || 'Meeting';
    if (next === note?.title) return;
    try {
      await api.patch(`/meeting-notes/${id}`, { title: next });
      setNote((n) => ({ ...n, title: next }));
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not rename it', tone: 'error' });
    }
  };

  const sendPaste = async () => {
    try {
      await api.post(`/meeting-notes/${id}/transcript`, { text: paste, replace: false });
      setTranscript((t) => (t ? `${t}\n${paste.trim()}` : paste.trim()));
      setPaste('');
      setPasting(false);
      recordedHere.current = true; // read it like a recording that just ended
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the transcript', tone: 'error' });
    }
  };

  // One click gives a task to its person. A task whose person is not known yet opens the review instead.
  const give = async (ids) => {
    try {
      const res = await api.post('/drafts/confirm', { ids }, { timeout: 120000 });
      const made = res.data.created?.length || 0;
      const failed = res.data.failed || [];
      if (made) {
        setGiven((n) => n + made);
        showToast({ message: made === 1 ? 'Task given' : `${made} tasks given`, tone: 'success', icon: 'checkmark-circle' });
      }
      if (failed.length) showToast({ message: failed.length === 1 ? failed[0].error : `${failed.length} tasks need a person first`, tone: 'error' });
      await loadDrafts();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not give the task', tone: 'error' });
    }
  };
  const drop = async (draftId) => {
    setDrafts((d) => (d || []).filter((x) => x.id !== draftId));
    try { await api.post('/drafts/drop', { ids: [draftId] }, { __skipOops: true }); } catch { loadDrafts(); }
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      showToast({ message: 'Transcript copied', tone: 'success' });
    } catch {
      showToast({ message: 'Could not copy. Select the text and copy it by hand.', tone: 'error' });
    }
  };

  // Someone else's meeting (only the super admin can open one): everything can be read and asked about, nothing changed.
  const own = note ? note.mine !== false : true;
  const list = drafts || [];
  const readyToGive = list.filter((d) => !(d.confidence === 'unsure' && !d.assignee_id));
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: embedded ? spacing.md : insets.top + spacing.md, paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.topRow}>
          <AnimatedPressable onPress={onBack} hitSlop={10} accessibilityLabel="Back to meetings" style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.gray[700]} />
          </AnimatedPressable>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            editable={own}
            placeholder="Name this meeting"
            placeholderTextColor={colors.gray[400]}
            style={styles.titleInput}
          />
          {own && (
            <AnimatedPressable onPress={onDelete} hitSlop={10} accessibilityLabel="Delete this meeting" style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={19} color={colors.gray[500]} />
            </AnimatedPressable>
          )}
        </View>

        {!own && (
          <View {...glass('card')} style={[styles.panel, styles.waitRow]}>
            <Ionicons name="eye-outline" size={18} color={colors.gray[600]} />
            <Text style={styles.waitText}>Recorded by {note.owner_name || 'someone else'}. You can read it and ask about it. Your questions are not saved with it.</Text>
          </View>
        )}

        {/* The recorder. */}
        {own && <View {...glass('card')} style={styles.panel}>
          {recorder.recording ? (
            <>
              <View style={styles.recRow}>
                <View style={styles.recDot} />
                <Text style={styles.clock}>{clock(recorder.elapsed)}</Text>
                <View style={{ flex: 1 }} />
                <AnimatedPressable style={styles.stop} onPress={recorder.stop}>
                  <Ionicons name="stop" size={16} color="#fff" />
                  <Text style={styles.primaryText}>Stop</Text>
                </AnimatedPressable>
              </View>
              <ScrollView ref={liveBox} style={styles.live} contentContainerStyle={{ padding: spacing.md }}>
                <Text style={styles.liveText}>
                  {transcript || 'Listening. What is said appears here about every twenty seconds.'}
                </Text>
              </ScrollView>
              <Text style={styles.hint}>
                {recorder.queued ? 'Writing down the last part. ' : ''}Keep this page open until you stop. The screen stays awake
                {recorder.resumed ? `; the microphone was restarted ${recorder.resumed} time${recorder.resumed === 1 ? '' : 's'}` : ''}.
              </Text>
            </>
          ) : recorder.queued > 0 ? (
            <View style={styles.waitRow}>
              <ActivityIndicator color={colors.brand[600]} />
              <Text style={styles.waitText}>Writing down the last part of the recording. Please wait.</Text>
            </View>
          ) : (
            <>
              <View style={styles.recRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.panelTitle}>{hasText ? 'Recorded' : 'Ready to record'}</Text>
                  <Text style={styles.hint}>
                    {hasText
                      ? `${words.toLocaleString('en-IN')} words saved. You can add to it.`
                      : 'English, Telugu or both mixed. Everyone hears a short notice before it starts.'}
                  </Text>
                </View>
                {recorder.canRecord && (
                  <AnimatedPressable style={hasText ? styles.secondary : styles.primary} onPress={startRecording}>
                    <Ionicons name="mic" size={18} color={hasText ? colors.gray[800] : '#fff'} />
                    <Text style={hasText ? styles.secondaryText : styles.primaryText}>{hasText ? 'Keep recording' : 'Start recording'}</Text>
                  </AnimatedPressable>
                )}
              </View>
              {!recorder.canRecord && <Text style={styles.hint}>This browser cannot record. Paste the transcript instead.</Text>}
              <View style={styles.optionRow}>
                {recorder.canShare && canShareTab && (
                  <AnimatedPressable style={styles.check} onPress={() => setWithTab((v) => !v)}>
                    <Ionicons name={withTab ? 'checkbox' : 'square-outline'} size={19} color={withTab ? colors.brand[600] : colors.gray[400]} />
                    <Text style={styles.checkText}>Also record a call playing in a browser tab</Text>
                  </AnimatedPressable>
                )}
                <AnimatedPressable onPress={() => setPasting((v) => !v)} style={styles.check}>
                  <Ionicons name="clipboard-outline" size={17} color={colors.gray[600]} />
                  <Text style={styles.checkText}>Paste a transcript</Text>
                </AnimatedPressable>
              </View>
              {pasting && (
                <View style={{ gap: spacing.sm }}>
                  <TextInput
                    value={paste}
                    onChangeText={setPaste}
                    multiline
                    autoFocus
                    placeholder="Paste the transcript or notes from any other tool"
                    placeholderTextColor={colors.gray[400]}
                    {...glass('inset')}
                    style={styles.paste}
                  />
                  <AnimatedPressable style={[styles.primary, { alignSelf: 'flex-start' }, !paste.trim() && { opacity: 0.45 }]} disabled={!paste.trim()} onPress={sendPaste}>
                    <Text style={styles.primaryText}>Add it</Text>
                  </AnimatedPressable>
                </View>
              )}
            </>
          )}
        </View>}

        {reading && (
          <View {...glass('card')} style={[styles.panel, styles.waitRow]}>
            <ActivityIndicator color={colors.brand[600]} />
            <Text style={styles.waitText}>Reading the whole meeting: the summary, what was decided, and every task. A long meeting takes a minute or two.</Text>
          </View>
        )}

        {hasText && !recorder.recording && (
          <>
            <View style={styles.tabs}>
              {TABS.map(([k, label]) => (
                <AnimatedPressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
                  <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}{k === 'tasks' && list.length ? `  ${list.length}` : ''}</Text>
                </AnimatedPressable>
              ))}
            </View>

            {tab === 'summary' && (
              <View style={{ gap: spacing.md }}>
                {result ? (
                  <>
                    {!!result.summary && <Text selectable style={styles.summary}>{result.summary}</Text>}
                    {(result.decisions || []).length > 0 && (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.label}>Decided</Text>
                        {result.decisions.map((d, i) => (
                          <View key={i} style={styles.decision}>
                            <Ionicons name="checkmark" size={16} color={colors.green[600]} style={{ marginTop: 2 }} />
                            <Text selectable style={styles.decisionText}>{d}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : !reading && (
                  <Text style={styles.hint}>The meeting has not been read yet.</Text>
                )}
                {own && !reading && !busyHere && (
                  <AnimatedPressable style={[styles.secondary, { alignSelf: 'flex-start' }]} onPress={readMeeting}>
                    <Ionicons name="refresh" size={16} color={colors.gray[800]} />
                    <Text style={styles.secondaryText}>{result ? 'Read again' : 'Read the meeting'}</Text>
                  </AnimatedPressable>
                )}
              </View>
            )}

            {tab === 'tasks' && (
              <View style={{ gap: spacing.sm }}>
                {list.length > 0 && !own && <Text style={styles.hint}>Waiting to be given by {note.owner_name || 'the person who recorded it'}.</Text>}
                {list.length > 0 && own && (
                  <View style={styles.taskHead}>
                    <Text style={[styles.hint, { flex: 1 }]}>Nothing reaches anyone until you give it.{given ? ` ${given} given so far.` : ''}</Text>
                    <AnimatedPressable style={styles.secondary} onPress={() => setReviewing(true)}>
                      <Text style={styles.secondaryText}>Edit</Text>
                    </AnimatedPressable>
                    {readyToGive.length > 1 && (
                      <AnimatedPressable style={styles.primary} onPress={() => give(readyToGive.map((d) => d.id))}>
                        <Text style={styles.primaryText}>Give all {readyToGive.length}</Text>
                      </AnimatedPressable>
                    )}
                  </View>
                )}
                {list.map((d) => {
                  const unsure = d.confidence === 'unsure' && !d.assignee_id;
                  const who = d.assignee_name || (unsure ? `"${d.assignee_said || 'someone'}"` : 'Me');
                  return (
                    <View key={d.id} {...glass('card')} style={styles.task}>
                      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, gap: 5 }}>
                        <Text style={styles.taskTitle}>{d.title}</Text>
                        <View style={styles.taskMeta}>
                          <View style={[styles.who, unsure && { backgroundColor: colors.red[50] }]}>
                            <Ionicons name={unsure ? 'help-circle-outline' : 'person-outline'} size={12} color={unsure ? colors.red[600] : colors.gray[600]} />
                            <Text style={[styles.whoText, unsure && { color: colors.red[600] }]}>{who}</Text>
                          </View>
                          {!!d.due_date && <Text style={styles.metaText}>{formatDue(d.due_date)}</Text>}
                          {!!d.business_name && <Text style={styles.metaText} numberOfLines={1}>{d.business_name}</Text>}
                        </View>
                        {!!d.quote && <Text style={styles.quote} numberOfLines={2}>"{d.quote}"</Text>}
                      </View>
                      {own && <View style={styles.taskActions}>
                        {unsure ? (
                          <AnimatedPressable style={styles.secondary} onPress={() => setReviewing(true)}>
                            <Text style={styles.secondaryText}>Pick a person</Text>
                          </AnimatedPressable>
                        ) : (
                          <AnimatedPressable style={styles.primary} onPress={() => give([d.id])}>
                            <Text style={styles.primaryText}>{d.assignee_id ? 'Give' : 'Add'}</Text>
                          </AnimatedPressable>
                        )}
                        <AnimatedPressable onPress={() => drop(d.id)} hitSlop={8} accessibilityLabel="Leave this task out" style={styles.iconBtn}>
                          <Ionicons name="close" size={18} color={colors.gray[500]} />
                        </AnimatedPressable>
                      </View>}
                    </View>
                  );
                })}
                {drafts && !list.length && !reading && (
                  <Text style={styles.hint}>
                    {given ? 'Every task from this meeting has been given.' : result ? 'No tasks are waiting from this meeting.' : 'Tasks appear here once the meeting has been read.'}
                  </Text>
                )}
              </View>
            )}

            {tab === 'transcript' && (
              <View style={{ gap: spacing.sm }}>
                <View style={styles.taskHead}>
                  <Text style={[styles.hint, { flex: 1 }]}>{words.toLocaleString('en-IN')} words, saved with this meeting.</Text>
                  <AnimatedPressable style={styles.secondary} onPress={copyTranscript}>
                    <Ionicons name="copy-outline" size={15} color={colors.gray[800]} />
                    <Text style={styles.secondaryText}>Copy</Text>
                  </AnimatedPressable>
                </View>
                <Text selectable style={styles.transcript}>{transcript}</Text>
              </View>
            )}

            {tab === 'ask' && <MeetingAsk meetingId={id} initialChat={note?.chat} ready={hasText && !busyHere} kept={own} />}
          </>
        )}
      </View>

      <ConsentOverlay visible={consent} onDone={beginAfterConsent} onCancel={() => { try { window.speechSynthesis?.cancel(); } catch { /* nothing to stop */ } setConsent(false); }} />
      <DraftReviewSheet open={reviewing} meetingId={id} onClose={() => { setReviewing(false); loadDrafts(); }} onConfirmed={loadDrafts} />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  page: { paddingHorizontal: spacing.lg },
  column: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.gray[900] },
  listHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  lead: { flex: 1, minWidth: 220, fontSize: fontSize.base, color: colors.gray[600], lineHeight: 20 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: spacing.xxxl },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.gray[800] },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  titleInput: { flex: 1, minWidth: 0, fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[900], paddingVertical: 4, letterSpacing: -0.3, outlineStyle: 'none' },
  panel: { padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md },
  panelTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.gray[900] },
  recRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red[500] },
  clock: { fontSize: 30, fontWeight: '700', color: colors.gray[900], fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.red[600], borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: spacing.lg },
  live: { maxHeight: 280, minHeight: 120, borderRadius: radius.lg, backgroundColor: colors.gray[50], borderWidth: 1, borderColor: colors.gray[200] },
  liveText: { fontSize: fontSize.base, lineHeight: 22, color: colors.gray[800] },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waitText: { flex: 1, fontSize: fontSize.base, color: colors.gray[700], lineHeight: 20 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  checkText: { fontSize: fontSize.sm, color: colors.gray[700] },
  label: { fontSize: 12, fontWeight: '600', color: colors.gray[500], letterSpacing: 0.4, textTransform: 'uppercase' },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 18 },
  error: { fontSize: fontSize.sm, color: colors.red[600] },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: spacing.lg },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: fontSize.base },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: spacing.lg },
  secondaryText: { fontWeight: '600', color: colors.gray[800], fontSize: fontSize.base },
  paste: { minHeight: 120, maxHeight: 240, borderRadius: radius.lg, padding: spacing.md, fontSize: fontSize.base, color: colors.gray[900], textAlignVertical: 'top', outlineStyle: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl },
  rowTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.gray[900] },
  rowSub: { fontSize: fontSize.sm, color: colors.gray[500] },
  rowSummary: { fontSize: fontSize.sm, color: colors.gray[700], lineHeight: 18 },
  badge: { backgroundColor: colors.brand[50], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.brand[700] },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  tab: { flexShrink: 1, paddingHorizontal: spacing.sm + 2, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabOn: { borderBottomColor: colors.brand[600] },
  tabText: { fontSize: fontSize.base, color: colors.gray[600] },
  tabTextOn: { color: colors.gray[900], fontWeight: '600' },
  summary: { fontSize: fontSize.md, color: colors.gray[900], lineHeight: 24 },
  decision: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  decisionText: { flex: 1, fontSize: fontSize.base, color: colors.gray[800], lineHeight: 20 },
  taskHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  task: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md, padding: spacing.md, borderRadius: radius.xl },
  taskTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900], lineHeight: 20 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  taskActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gray[100], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  whoText: { fontSize: 12, fontWeight: '600', color: colors.gray[700] },
  metaText: { fontSize: 12, color: colors.gray[500] },
  quote: { fontSize: 12, color: colors.gray[500], fontStyle: 'italic', lineHeight: 17 },
  transcript: { fontSize: fontSize.base, lineHeight: 23, color: colors.gray[800] },
});
