import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import AnimatedPressable from '../components/AnimatedPressable';
import BackTitle from '../components/BackTitle';
import BottomSheet from '../components/BottomSheet';
import useMeetingRecorder from '../hooks/useMeetingRecorder';
import ConsentOverlay from '../components/meetings/ConsentOverlay';
import DraftReviewSheet from '../components/drafts/DraftReviewSheet';
import useBrowserTranscript from '../hooks/useBrowserTranscript';
import { showToast, confirmDialog } from '../utils/events';
import { timeAgo } from '../utils/dates';

const clock = (s) => {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
};

/**
 * Meetings that are not attached to a to-do. Record the whole meeting (it is sent and turned into text in 5
 * minute pieces, so an hour or more works), or paste a transcript. "Make to-dos" reads the whole meeting and
 * creates each task for the person it is for. Only the person who recorded it can see it; no audio is kept.
 */
export default function MeetingNotesScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
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

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.post('/meeting-notes', { title: newTitle.trim() || undefined });
      setNewOpen(false);
      setNewTitle('');
      setOpenId(res.data.meeting.id);
      loadList();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not start the meeting', tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirmDialog({ title: 'Delete this meeting?', message: 'Its text and notes will be removed. To-dos already made stay.', confirmLabel: 'Delete', destructive: true });
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
    return <MeetingNoteView id={openId} onBack={() => { setOpenId(null); loadList(); }} onDelete={() => remove(openId)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 120 }]}>
        <BackTitle title="Meetings" style={styles.title} />
        <Text style={styles.lead}>Record a whole meeting. The text is kept and to-dos are made from it, each given to the person it is for.</Text>

        <AnimatedPressable style={styles.primary} onPress={() => setNewOpen(true)}>
          <Ionicons name="mic" size={20} color="#fff" />
          <Text style={styles.primaryText}>New meeting</Text>
        </AnimatedPressable>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {list === null && !error && <ActivityIndicator color={colors.brand[600]} style={{ marginTop: spacing.xl }} />}
        {list && list.length === 0 && <Text style={styles.hint}>No meetings yet.</Text>}
        {(list || []).map((m) => (
          <AnimatedPressable key={m.id} {...glass('card')} style={styles.row} onPress={() => setOpenId(m.id)}>
            <View style={styles.rowIcon}><Ionicons name="document-text-outline" size={20} color={colors.brand[600]} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {timeAgo(m.created_at)} · {m.pieces} piece{m.pieces === 1 ? '' : 's'} · {Number(m.chars || 0).toLocaleString()} characters
                {m.has_notes ? ' · notes ready' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        ))}
      </ScrollView>

      <BottomSheet visible={newOpen} onClose={() => setNewOpen(false)} maxHeight={320} avoidKeyboard>
        <View style={{ paddingHorizontal: spacing.sm }}>
          <Text style={styles.sheetTitle}>New meeting</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="What is it about? (optional)"
            placeholderTextColor={colors.gray[400]}
            onSubmitEditing={create}
            {...glass('inset')}
            style={styles.input}
          />
          <AnimatedPressable style={[styles.primary, creating && { opacity: 0.5 }]} disabled={creating} onPress={create}>
            <Ionicons name="mic" size={18} color="#fff" />
            <Text style={styles.primaryText}>{creating ? 'Starting...' : 'Continue'}</Text>
          </AnimatedPressable>
        </View>
      </BottomSheet>
    </View>
  );
}

/** One meeting: the recorder, a paste box, and the summary and to-dos. */
function MeetingNoteView({ id, onBack, onDelete }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [chars, setChars] = useState(0);
  const [pieces, setPieces] = useState(0);
  const [result, setResult] = useState(null);
  const [withTab, setWithTab] = useState(true);
  const [consent, setConsent] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('paid');
  const [lang, setLang] = useState('en-IN');

  useEffect(() => {
    let live = true;
    api.get(`/meeting-notes/${id}`, { __skipOops: true }).then((res) => {
      if (!live) return;
      const m = res.data.meeting;
      setNote(m);
      setTitle(m.title);
      setChars(m.transcript ? m.transcript.length : 0);
      setPieces(m.pieces || 0);
      setResult(m.extracted || null);
    }).catch(() => showToast({ message: 'Could not open this meeting', tone: 'error' }));
    return () => { live = false; };
  }, [id]);

  const recorder = useMeetingRecorder({
    send: async (blob, { pieceNo, durationMs } = {}) => {
      const form = new FormData();
      form.append('file', blob, `part.${(blob.type || '').includes('mp4') ? 'mp4' : 'webm'}`);
      // Numbered: the server keeps each piece once, so a retry after a dropped connection never doubles the text.
      if (pieceNo !== undefined) form.append('piece_no', String(pieceNo));
      if (durationMs) form.append('duration_ms', String(durationMs));
      const res = await api.post(`/meeting-notes/${id}/audio`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      setChars(res.data.chars || 0);
      setPieces(res.data.pieces || 0);
    },
    onError: (err) => showToast({ message: err.response?.data?.error || 'A piece of the recording could not be read. The rest is kept.', tone: 'error' }),
  });

  const free = useBrowserTranscript({ id, lang, onSaved: setChars });

  // Every recording starts with the consent notice on screen for 3 seconds (company context, decision 4).
  const startRecording = () => setConsent(true);
  const beginAfterConsent = async () => {
    setConsent(false);
    const ok = await recorder.start({ withTab, firstPiece: pieces });
    if (!ok) showToast({ message: 'The microphone could not be used. Allow it in the browser and try again.', tone: 'error' });
  };

  // Every task said in the meeting becomes a draft; nothing is anyone's work until it is reviewed and assigned.
  const findTasks = async () => {
    setDrafting(true);
    try {
      const res = await api.post(`/meeting-notes/${id}/drafts`, {}, { timeout: 300000 });
      const n = res.data.drafts?.length || 0;
      if (n) setReviewing(true);
      else showToast({ message: 'No tasks were found in what was said', icon: 'information-circle' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not read the meeting', tone: 'error' });
    } finally {
      setDrafting(false);
    }
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
    setBusy(true);
    try {
      const res = await api.post(`/meeting-notes/${id}/transcript`, { text: paste, replace: false });
      setChars(res.data.chars || 0);
      setPaste('');
      showToast({ message: 'Transcript saved', tone: 'success' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the transcript', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // An hour of speech can take a minute or two to read in parts, so the wait is longer than usual.
  const make = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/meeting-notes/${id}/extract`, { create: false }, { timeout: 240000 });
      setResult(res.data);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not make the to-dos', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const busyHere = recorder.recording || recorder.queued > 0 || free.listening;
  const ready = !busyHere && chars > 40 && !busy && !drafting;

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 120 }]}>
      <View style={styles.topRow}>
        <AnimatedPressable onPress={onBack} hitSlop={10} style={{ marginLeft: -6, padding: 4 }}>
          <Ionicons name="chevron-back" size={26} color={colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Meetings</Text>
        <AnimatedPressable onPress={onDelete} hitSlop={10} accessibilityLabel="Delete this meeting">
          <Ionicons name="trash-outline" size={20} color={colors.gray[500]} />
        </AnimatedPressable>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        placeholder="Meeting"
        placeholderTextColor={colors.gray[400]}
        style={styles.titleInput}
      />

      <View style={styles.modes}>
        {[['paid', 'Best quality'], ['free', 'Free']].map(([k, label]) => (
          <AnimatedPressable
            key={k}
            style={[styles.mode, mode === k && styles.modeOn]}
            disabled={busyHere}
            onPress={() => setMode(k)}
          >
            <Text style={[styles.modeText, mode === k && styles.modeTextOn]}>{label}</Text>
          </AnimatedPressable>
        ))}
      </View>

      {mode === 'paid' ? (
        <View {...glass('card')} style={styles.panel}>
          <Text style={styles.clock}>{clock(recorder.elapsed)}</Text>
          <Text style={styles.status}>
            {recorder.recording
              ? `Recording. ${pieces} piece${pieces === 1 ? '' : 's'} sent${recorder.queued ? `, ${recorder.queued} turning into text` : ''}.`
              : recorder.queued
                ? `Turning ${recorder.queued} piece${recorder.queued === 1 ? '' : 's'} into text...`
                : chars
                  ? `${Number(chars).toLocaleString()} characters so far, from ${pieces} piece${pieces === 1 ? '' : 's'}.`
                  : 'Not recorded yet.'}
          </Text>
          <Text style={styles.hint}>Paid: OpenAI turns the recording into text a minute at a time. English, Telugu and both mixed are understood. Before it starts, the screen shows "Hi everyone, I am starting the recording." for 3 seconds.</Text>

          {!recorder.recording && recorder.canShare && (
            <AnimatedPressable style={styles.check} onPress={() => setWithTab((v) => !v)}>
              <Ionicons name={withTab ? 'checkbox' : 'square-outline'} size={22} color={withTab ? colors.brand[600] : colors.gray[400]} />
              <Text style={styles.checkText}>Also record the others. Pick the Meet tab and tick "Share tab audio".</Text>
            </AnimatedPressable>
          )}
          {!recorder.canRecord && <Text style={styles.hint}>This browser cannot record. Paste the transcript below instead.</Text>}
          {recorder.canRecord && (
            <AnimatedPressable style={[styles.primary, recorder.recording && { backgroundColor: colors.gray[800] }]} onPress={recorder.recording ? recorder.stop : startRecording}>
              <Ionicons name={recorder.recording ? 'stop' : 'mic'} size={20} color="#fff" />
              <Text style={styles.primaryText}>{recorder.recording ? `Stop at ${clock(recorder.elapsed)}` : chars ? 'Keep recording' : 'Start recording'}</Text>
            </AnimatedPressable>
          )}
          {recorder.recording && <Text style={styles.hint}>Keep this page open until you stop. The screen stays awake; if a phone locks anyway, recording starts again when you come back{recorder.resumed ? ` (restarted ${recorder.resumed} time${recorder.resumed === 1 ? '' : 's'})` : ''}.</Text>}
        </View>
      ) : (
        <View {...glass('card')} style={styles.panel}>
          <Text style={styles.clock}>{clock(free.elapsed)}</Text>
          <Text style={styles.status}>
            {free.listening
              ? 'Listening. Each phrase is saved as it is finished.'
              : chars
                ? `${Number(chars).toLocaleString()} characters so far.`
                : 'Not recorded yet.'}
          </Text>
          <Text style={styles.hint}>Free: the browser's own speech recognition writes it down. It works in Chrome or Edge on a computer or Android, and it is less accurate than the paid mode, especially for Telugu. The browser sends the sound to its speech service to do this.</Text>

          {!free.listening && (
            <View style={styles.modes}>
              {[['en-IN', 'English'], ['te-IN', 'Telugu']].map(([k, label]) => (
                <AnimatedPressable key={k} style={[styles.mode, lang === k && styles.modeOn]} onPress={() => setLang(k)}>
                  <Text style={[styles.modeText, lang === k && styles.modeTextOn]}>{label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          )}
          {free.listening && !!free.live && <Text style={styles.live} numberOfLines={3}>{free.live}</Text>}
          {!free.supported && <Text style={styles.hint}>This browser cannot do free transcription. Use Chrome or Edge, or the paid mode.</Text>}
          {free.supported && (
            <AnimatedPressable
              style={[styles.primary, free.listening && { backgroundColor: colors.gray[800] }]}
              onPress={free.listening ? free.stop : () => free.start()}
            >
              <Ionicons name={free.listening ? 'stop' : 'mic'} size={20} color="#fff" />
              <Text style={styles.primaryText}>{free.listening ? `Stop at ${clock(free.elapsed)}` : chars ? 'Keep listening' : 'Start listening'}</Text>
            </AnimatedPressable>
          )}
          {free.listening && <Text style={styles.hint}>Keep this page open until you stop. Anything heard so far is saved when you stop.</Text>}
        </View>
      )}

      <Text style={styles.label}>Or paste a transcript</Text>
      <TextInput
        value={paste}
        onChangeText={setPaste}
        multiline
        placeholder="Paste the transcript or notes from any tool"
        placeholderTextColor={colors.gray[400]}
        {...glass('inset')}
        style={styles.paste}
      />
      <AnimatedPressable style={[styles.secondary, (!paste.trim() || busy) && { opacity: 0.5 }]} disabled={!paste.trim() || busy} onPress={sendPaste}>
        <Text style={styles.secondaryText}>{busy ? 'Saving...' : 'Add the transcript'}</Text>
      </AnimatedPressable>

      <Text style={styles.label}>Tasks from the meeting</Text>
      <Text style={styles.hint}>Every task that was said becomes a draft with the person it is for. You check them on one screen and assign them all with one key; nothing reaches anyone before that.</Text>
      <AnimatedPressable style={[styles.primary, !ready && { opacity: 0.45 }]} disabled={!ready} onPress={findTasks}>
        {drafting ? <ActivityIndicator color="#fff" /> : <Ionicons name="list" size={18} color="#fff" />}
        <Text style={styles.primaryText}>{drafting ? 'Reading the whole meeting...' : 'Find the tasks'}</Text>
      </AnimatedPressable>
      <AnimatedPressable style={[styles.secondary, !ready && { opacity: 0.45 }]} disabled={!ready} onPress={make}>
        <Text style={styles.secondaryText}>{busy ? 'Reading...' : 'Summary and decisions'}</Text>
      </AnimatedPressable>
      {busyHere && <Text style={styles.hint}>Finish the recording first.</Text>}

      {result && (
        <View {...glass('card')} style={styles.panel}>
          {!!result.summary && <Text style={styles.summary}>{result.summary}</Text>}
          {(result.decisions || []).length > 0 && (
            <>
              <Text style={styles.label}>Decided</Text>
              {result.decisions.map((d, i) => <Text key={i} style={styles.bullet}>• {d}</Text>)}
            </>
          )}
          <Text style={styles.label}>{result.created ? 'To-dos created' : 'Action items mentioned'}</Text>
          {(result.created || result.tasks || []).length === 0 && <Text style={styles.hint}>No action items were found.</Text>}
          {(result.created || result.tasks || []).map((t, i) => (
            <View key={i} style={styles.taskRow}>
              <Ionicons name="checkbox-outline" size={16} color={colors.brand[600]} />
              <Text style={styles.taskText}>{t.title}</Text>
              <Text style={styles.taskWho}>{t.assignee ? (t.assignee.name || t.assignee).split(' ')[0] : 'Me'}</Text>
            </View>
          ))}
          {(result.failed || []).map((t, i) => <Text key={`f${i}`} style={[styles.bullet, { color: colors.red[600] }]}>Could not create: {t}</Text>)}
          {result.parts > 1 && <Text style={styles.hint}>Read in {result.parts} parts.</Text>}
        </View>
      )}
      <ConsentOverlay visible={consent} onDone={beginAfterConsent} onCancel={() => setConsent(false)} />
      <DraftReviewSheet open={reviewing} meetingId={id} onClose={() => setReviewing(false)} />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900] },
  lead: { fontSize: fontSize.sm, color: colors.gray[600], lineHeight: 19 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[700] },
  titleInput: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900], paddingVertical: 4, outlineStyle: 'none' },
  panel: { padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.gray[100] },
  modeOn: { backgroundColor: colors.brand[600] },
  modeText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
  modeTextOn: { color: '#fff' },
  live: { fontSize: fontSize.base, color: colors.gray[700], fontStyle: 'italic' },
  clock: { fontSize: 40, fontWeight: '800', color: colors.gray[900], fontVariant: ['tabular-nums'] },
  status: { fontSize: fontSize.sm, color: colors.gray[600] },
  label: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm },
  hint: { fontSize: fontSize.sm, color: colors.gray[500] },
  error: { fontSize: fontSize.sm, color: colors.red[600] },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  checkText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[700] },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 14 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
  secondary: { backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontWeight: '700', color: colors.gray[800], fontSize: fontSize.base },
  paste: { minHeight: 120, maxHeight: 240, borderRadius: radius.lg, padding: spacing.md, fontSize: fontSize.base, color: colors.gray[900], textAlignVertical: 'top' },
  input: { borderRadius: radius.lg, padding: spacing.md, fontSize: fontSize.base, color: colors.gray[900], marginBottom: spacing.md, outlineStyle: 'none' },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900], marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.xl },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray[100] },
  rowTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  rowSub: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  summary: { fontSize: fontSize.base, color: colors.gray[800], lineHeight: 21 },
  bullet: { fontSize: fontSize.sm, color: colors.gray[700] },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  taskText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[900] },
  taskWho: { fontSize: 11, fontWeight: '700', color: colors.gray[600] },
});
