import { useCallback, useEffect, useRef, useState } from 'react';

const PIECE_MS = 60 * 1000; // each piece is a complete one-minute file, sent as soon as it is finished
const BITRATE = 32000; // speech needs little; a minute is about 240 KB
const RETRY_STEPS_MS = [3000, 8000, 20000, 45000, 90000]; // then every 90 s while the page is open

/**
 * Records the microphone (and, on a computer, the tab audio of a shared meeting) in numbered one-minute pieces
 * for as long as the meeting runs (F-MTG-02). `send(blob, { pieceNo, durationMs })` uploads one piece; a piece
 * that fails is kept and retried (after a pause, and at once when the connection comes back), so a dropped
 * network loses nothing. The server ignores a piece number it already has, so a retry never doubles the text.
 *
 * The screen is kept awake while recording. If the phone still locks and the browser drops the microphone
 * (iPhone does this to web apps), recording starts again by itself when the page is shown again (F-MTG-03).
 */
export default function useMeetingRecorder({ send, onError }) {
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [pieces, setPieces] = useState(0); // pieces cut so far in this session
  const [queued, setQueued] = useState(0); // pieces not yet sent
  const [resumed, setResumed] = useState(0); // times the microphone had to be started again
  const rec = useRef({
    active: false, recorder: null, timer: null, ctx: null, dest: null, streams: [], wake: null,
    pending: [], sending: false, nextPiece: 0, withTab: false, retryTimer: null,
  });
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

  // Ask before the page is closed while recording or while pieces are still waiting to be sent.
  useEffect(() => {
    if (!recording && !queued) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, queued]);

  const keepAwake = async () => {
    try {
      rec.current.wake = await navigator.wakeLock?.request('screen');
    } catch { /* not allowed or not supported: the screen may sleep */ }
  };
  const releaseWake = () => {
    try { rec.current.wake?.release(); } catch { /* already released */ }
    rec.current.wake = null;
  };

  // ---- sending, in piece order, with patient retries -------------------------------------------------
  const pump = useCallback(async () => {
    const r = rec.current;
    if (r.sending) return;
    r.sending = true;
    try {
      while (r.pending.length) {
        const piece = r.pending[0];
        try {
          await sendRef.current(piece.blob, { pieceNo: piece.no, durationMs: piece.ms });
          r.pending.shift();
          setQueued(r.pending.length);
        } catch (err) {
          piece.tries += 1;
          if (piece.tries === 3) errorRef.current?.(err);
          const wait = RETRY_STEPS_MS[Math.min(piece.tries - 1, RETRY_STEPS_MS.length - 1)];
          clearTimeout(r.retryTimer);
          r.retryTimer = setTimeout(() => pump(), wait);
          return;
        }
      }
    } finally {
      r.sending = false;
    }
  }, []);

  // Back online: send what is waiting straight away.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const online = () => { clearTimeout(rec.current.retryTimer); pump(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [pump]);

  const queuePiece = useCallback((blob, ms) => {
    if (!blob.size) return;
    const r = rec.current;
    r.pending.push({ blob, ms, no: r.nextPiece, tries: 0 });
    r.nextPiece += 1;
    setQueued(r.pending.length);
    pump();
  }, [pump]);

  // ---- recording -------------------------------------------------------------------------------------
  const segment = () => {
    const r = rec.current;
    if (!r.active || !r.dest) return;
    let recorder;
    try {
      recorder = new MediaRecorder(r.dest.stream, { audioBitsPerSecond: BITRATE });
    } catch {
      recorder = new MediaRecorder(r.dest.stream);
    }
    const chunks = [];
    const began = Date.now();
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => queuePiece(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), Date.now() - began);
    recorder.start();
    r.recorder = recorder;
    r.timer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      setPieces((n) => n + 1);
      if (r.active) segment();
    }, PIECE_MS);
  };

  /** Opens the microphone (and tab audio) and wires them into one recording destination. */
  const openStreams = async (withTab) => {
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
    return { ctx, dest, streams, tab: !!tabAudio };
  };

  const closeStreams = () => {
    const r = rec.current;
    clearTimeout(r.timer);
    if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop();
    r.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    r.streams = [];
    try { r.ctx?.close(); } catch { /* already closed */ }
    r.ctx = null;
    r.dest = null;
  };

  const stopAll = () => {
    rec.current.active = false;
    closeStreams();
    releaseWake();
  };

  // Shown again after the screen locked: keep the screen awake again, and if the browser dropped the
  // microphone meanwhile, start it again (the piece in progress was already sent when it stopped).
  useEffect(() => {
    if (!recording) return undefined;
    const back = async () => {
      if (document.visibilityState !== 'visible' || !rec.current.active) return;
      keepAwake();
      const mic = rec.current.streams[0]?.getAudioTracks?.()[0];
      if (mic && mic.readyState === 'live' && rec.current.ctx?.state !== 'suspended') return;
      try {
        closeStreams();
        const opened = await openStreams(false);
        Object.assign(rec.current, opened);
        setResumed((n) => n + 1);
        segment();
      } catch {
        errorRef.current?.(new Error('The microphone stopped while the screen was locked. Press Start to go on.'));
        stopAll();
        setRecording(false);
      }
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop everything if the screen goes away mid-recording.
  useEffect(() => () => { if (rec.current.active) stopAll(); clearTimeout(rec.current.retryTimer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Starts the recording. `firstPiece` continues the numbering of a meeting that already has pieces.
   * Returns false when the microphone could not be used.
   */
  const start = async ({ withTab, firstPiece = 0 }) => {
    try {
      const opened = await openStreams(withTab);
      Object.assign(rec.current, opened, { active: true, withTab, nextPiece: Math.max(firstPiece, rec.current.nextPiece) });
      setPieces(0);
      setResumed(0);
      setStartedAt(Date.now());
      setNow(Date.now());
      setRecording(true);
      await keepAwake();
      segment();
      return { tab: opened.tab };
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
    resumed,
    start,
    stop,
    upload: queuePiece,
  };
}
