import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { showToast } from '../../utils/events';
import api from '../../api/client';

const SEGMENT_MS = 5 * 60 * 1000; // each upload is a complete 5 minute file, well under the 25 MB limit
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Get what was said in a meeting into the app, two ways:
 *  - Record it here: the microphone, plus (on a computer) the audio of the Meet tab if it is shared. It is sent
 *    in 5 minute pieces and turned into text on the server as it goes.
 *  - Paste a transcript from any other tool.
 * "Make to-dos" then hands over to the review list (onExtract).
 */
export default function MeetingCapture({ visible, onClose, meeting, onExtract }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState('record');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState(0);
  const [chars, setChars] = useState(0);
  const [shareTab, setShareTab] = useState(true);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const rec = useRef({ active: false, recorder: null, timer: null, ctx: null, streams: [], queue: Promise.resolve() });
  const canRecord = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
  const canShare = canRecord && !!navigator.mediaDevices?.getDisplayMedia;

  useEffect(() => { if (visible) setChars(meeting?.transcript_chars || 0); }, [visible, meeting?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(() => () => { if (rec.current.active) stopAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (blob) => {
    if (!blob.size) return;
    setPending((n) => n + 1);
    rec.current.queue = rec.current.queue.then(async () => {
      try {
        const form = new FormData();
        const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
        form.append('file', blob, `part.${ext}`);
        const res = await api.post(`/ai/meetings/${meeting.id}/audio`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
        setChars(res.data.chars || 0);
      } catch (err) {
        showToast({ message: err.response?.data?.error || 'One piece of the recording could not be read', tone: 'error' });
      } finally {
        setPending((n) => n - 1);
      }
    });
  };

  const segment = (dest) => {
    const r = rec.current;
    const recorder = new MediaRecorder(dest.stream);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => upload(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    recorder.start();
    r.recorder = recorder;
    r.timer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      if (r.active) segment(dest);
    }, SEGMENT_MS);
  };

  const stopAll = () => {
    const r = rec.current;
    r.active = false;
    clearTimeout(r.timer);
    if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop();
    r.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    r.streams = [];
    try { r.ctx?.close(); } catch { /* already closed */ }
    r.ctx = null;
  };

  const start = async () => {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const streams = [mic];
      let tabAudio = null;
      if (shareTab && canShare) {
        try {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          streams.push(display);
          display.getVideoTracks().forEach((t) => t.stop());
          if (display.getAudioTracks().length) tabAudio = new MediaStream(display.getAudioTracks());
          else showToast({ message: 'No tab audio was shared, so only your microphone is recorded. Tick "Share tab audio" next time.', tone: 'info' });
        } catch { /* they cancelled the share: microphone only */ }
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(dest);
      if (tabAudio) ctx.createMediaStreamSource(tabAudio).connect(dest);
      rec.current = { ...rec.current, active: true, ctx, streams };
      setSeconds(0);
      setRecording(true);
      segment(dest);
    } catch {
      showToast({ message: 'The microphone could not be used. Allow it in the browser and try again.', tone: 'error' });
    }
  };

  const stop = () => {
    stopAll();
    setRecording(false);
  };

  const sendPaste = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/ai/meetings/${meeting.id}/transcript`, { text: paste, replace: false });
      setChars(res.data.chars || 0);
      setPaste('');
      showToast({ message: 'Transcript saved', tone: 'success' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not save the transcript', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const ready = !recording && pending === 0 && chars > 40;
  const make = () => { onClose(); onExtract(); };

  return (
    <BottomSheet visible={visible} onClose={() => { if (!recording) onClose(); }} maxHeight={640} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm }}>
        <View style={styles.titleRow}>
          <Ionicons name="document-text" size={18} color={colors.brand[600]} />
          <Text style={styles.title}>To-dos from this meeting</Text>
        </View>
        <View style={styles.tabs}>
          {[['record', 'Record it'], ['paste', 'Paste a transcript']].map(([k, label]) => (
            <AnimatedPressable key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => !recording && setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
            </AnimatedPressable>
          ))}
        </View>

        {tab === 'record' ? (
          <View>
            {!canRecord && <Text style={styles.hint}>This browser cannot record. Use "Paste a transcript" instead.</Text>}
            {canRecord && (
              <>
                {!recording && canShare && (
                  <AnimatedPressable style={styles.check} onPress={() => setShareTab((v) => !v)}>
                    <Ionicons name={shareTab ? 'checkbox' : 'square-outline'} size={22} color={shareTab ? colors.brand[600] : colors.gray[400]} />
                    <Text style={styles.checkText}>Also record what the others say. Pick the Meet tab and tick "Share tab audio".</Text>
                  </AnimatedPressable>
                )}
                {!recording && !canShare && <Text style={styles.hint}>Only your microphone is recorded on this device, so hold the phone near the speaker.</Text>}
                <AnimatedPressable style={[styles.rec, recording && { backgroundColor: colors.gray[800] }]} onPress={recording ? stop : start}>
                  <Ionicons name={recording ? 'stop' : 'mic'} size={20} color="#fff" />
                  <Text style={styles.recText}>{recording ? `Stop  ${clock(seconds)}` : chars ? 'Record more' : 'Start recording'}</Text>
                </AnimatedPressable>
                <Text style={styles.hint}>
                  {recording ? 'Keep this window open while the meeting runs.' : pending ? 'Turning the recording into text...' : chars ? `${chars} characters captured.` : 'Nothing is stored as audio, only the text.'}
                </Text>
              </>
            )}
          </View>
        ) : (
          <View>
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
              <Text style={styles.secondaryText}>{busy ? 'Saving...' : 'Save transcript'}</Text>
            </AnimatedPressable>
            {!!chars && <Text style={styles.hint}>{chars} characters saved.</Text>}
          </View>
        )}

        <AnimatedPressable style={[styles.go, !ready && { opacity: 0.45 }]} disabled={!ready} onPress={make}>
          <Ionicons name="sparkles" size={17} color="#fff" />
          <Text style={styles.goText}>Make to-dos</Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.gray[100] },
  tabOn: { backgroundColor: colors.brand[600] },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
  tabTextOn: { color: '#fff' },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 8 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  checkText: { flex: 1, fontSize: fontSize.sm, color: colors.gray[700] },
  rec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 14, marginTop: spacing.sm },
  recText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
  paste: { minHeight: 150, maxHeight: 260, borderRadius: radius.lg, padding: spacing.md, fontSize: fontSize.base, color: colors.gray[900], textAlignVertical: 'top' },
  secondary: { backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
  secondaryText: { fontWeight: '700', color: colors.gray[800], fontSize: fontSize.base },
  go: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 14, marginTop: spacing.lg, marginBottom: spacing.sm },
  goText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});
