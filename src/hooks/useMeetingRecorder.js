import { useCallback, useEffect, useRef, useState } from 'react';

const PIECE_MS = 5 * 60 * 1000; // each piece is a complete file of 5 minutes, sent as it is finished
const BITRATE = 32000; // speech needs little; 5 minutes is about 1.2 MB, well under the server limit
const RETRY_MS = 4000;

/**
 * Records the microphone (and, on a computer, the tab audio of a shared meeting) in 5 minute pieces for as
 * long as the meeting runs. `send(blob)` uploads one piece and is retried once if it fails. The screen is kept
 * awake while recording where the browser allows it, and the page asks before it is closed.
 */
export default function useMeetingRecorder({ send, onError }) {
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [pieces, setPieces] = useState(0); // pieces cut so far in this session
  const [queued, setQueued] = useState(0); // pieces not yet sent
  const rec = useRef({ active: false, recorder: null, timer: null, ctx: null, streams: [], wake: null, queue: Promise.resolve() });
  const sendRef = useRef(send);
  const errorRef = useRef(onError);
  sendRef.current = send;
  errorRef.current = onError;

  const canRecord = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
  const canShare = canRecord && !!navigator.mediaDevices?.getDisplayMedia;

  // Elapsed time comes from the clock, not from counting ticks, so a throttled background tab still shows the truth.
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Ask before the page is closed while a meeting is being recorded.
  useEffect(() => {
    if (!recording) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording]);

  const keepAwake = async () => {
    try {
      rec.current.wake = await navigator.wakeLock?.request('screen');
    } catch { /* not allowed or not supported: the screen may sleep */ }
  };
  const releaseWake = () => {
    try { rec.current.wake?.release(); } catch { /* already released */ }
    rec.current.wake = null;
  };
  // The system drops the wake lock when the page is hidden; take it again when it is shown.
  useEffect(() => {
    if (!recording) return undefined;
    const back = () => { if (document.visibilityState === 'visible' && rec.current.active) keepAwake(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = useCallback((blob) => {
    if (!blob.size) return;
    setQueued((n) => n + 1);
    rec.current.queue = rec.current.queue.then(async () => {
      try {
        await sendRef.current(blob);
      } catch {
        // One retry: a dropped connection for a few seconds should not lose five minutes of speech.
        await new Promise((r) => setTimeout(r, RETRY_MS));
        try {
          await sendRef.current(blob);
        } catch (err) {
          errorRef.current?.(err);
        }
      } finally {
        setQueued((n) => n - 1);
      }
    });
  }, []);

  const segment = (dest) => {
    const r = rec.current;
    let recorder;
    try {
      recorder = new MediaRecorder(dest.stream, { audioBitsPerSecond: BITRATE });
    } catch {
      recorder = new MediaRecorder(dest.stream);
    }
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => upload(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    recorder.start();
    r.recorder = recorder;
    r.timer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      setPieces((n) => n + 1);
      if (r.active) segment(dest);
    }, PIECE_MS);
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
    releaseWake();
  };

  // Stop everything if the screen goes away mid-recording.
  useEffect(() => () => { if (rec.current.active) stopAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Starts the recording. Returns false when the microphone could not be used. */
  const start = async ({ withTab }) => {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const streams = [mic];
      let tabAudio = null;
      if (withTab && canShare) {
        try {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          streams.push(display);
          display.getVideoTracks().forEach((t) => t.stop());
          if (display.getAudioTracks().length) tabAudio = new MediaStream(display.getAudioTracks());
        } catch { /* they cancelled the share: microphone only */ }
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(dest);
      if (tabAudio) ctx.createMediaStreamSource(tabAudio).connect(dest);
      rec.current = { ...rec.current, active: true, ctx, streams };
      setPieces(0);
      setStartedAt(Date.now());
      setNow(Date.now());
      setRecording(true);
      await keepAwake();
      segment(dest);
      return { tab: !!tabAudio };
    } catch {
      return false;
    }
  };

  const stop = useCallback(() => {
    stopAll();
    setRecording(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    canRecord,
    canShare,
    recording,
    elapsed: recording ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0,
    pieces,
    queued,
    start,
    stop,
    upload,
  };
}
