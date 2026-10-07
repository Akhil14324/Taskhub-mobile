// Voice input, using the browser's speech recognition (Chrome, Edge, Safari 14.5+).
// Nothing is sent to TaskHub's servers: the browser/OS service turns speech into text.
import { Platform } from 'react-native';

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function getRecognition() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
  return !!getRecognition();
}

/** "five p.m." → "5pm", "tomorrow at six thirty pm" → "tomorrow at 6:30pm", "p one" → "p1". */
export function normalizeSpoken(text) {
  let out = String(text || '').trim();
  out = out.replace(/\b([ap])\.\s?m\.?/gi, '$1m');
  const words = Object.keys(NUMBER_WORDS).join('|');
  out = out.replace(new RegExp(String.raw`\b(${words})\s+(thirty|fifteen|forty[- ]five)\s*(am|pm)\b`, 'gi'), (m, h, mm, ap) => {
    const minutes = /thirty/i.test(mm) ? '30' : /fifteen/i.test(mm) ? '15' : '45';
    return `${NUMBER_WORDS[h.toLowerCase()]}:${minutes}${ap.toLowerCase()}`;
  });
  out = out.replace(new RegExp(String.raw`\b(${words})\s*(am|pm)\b`, 'gi'), (m, h, ap) => `${NUMBER_WORDS[h.toLowerCase()]}${ap.toLowerCase()}`);
  out = out.replace(/\b(\d{1,2})\s+(am|pm)\b/gi, '$1$2');
  out = out.replace(/\bpriority (one|two|three|four|1|2|3|4)\b/gi, (m, n) => `p${NUMBER_WORDS[n.toLowerCase()] || n}`);
  out = out.replace(/\bp (one|two|three|four)\b/gi, (m, n) => `p${NUMBER_WORDS[n.toLowerCase()] || ({ three: 3, four: 4 }[n.toLowerCase()])}`);
  return out;
}

const join = (a, b) => (a && b ? `${a.replace(/\s+$/, '')} ${b.replace(/^\s+/, '')}` : a || b);

/**
 * Start listening. `onText(transcriptSoFar)` is called with everything heard in this session while the
 * person speaks (finished words plus the words still being worked out), and `onEnd()` when listening
 * stops. Pauses do not end it: on desktop and iPhone the recogniser keeps running until stop() is
 * called, and if the browser closes it early (Chrome does after a few quiet seconds) it is started
 * again and the earlier words are kept. Returns stop(), or null when speech is not available.
 *
 * `onLevel(0..1)` drives a wave meter: the real microphone level on a laptop; on a phone (where a second
 * microphone stream can knock the recogniser off) it follows the speech itself.
 */
export function startListening({ lang = 'en-IN', onText, onEnd, onError, onLevel }) {
  const Recognition = getRecognition();
  if (!Recognition) return null;
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;

  let stopped = false;
  let heard = false;
  let failed = false;
  let finalText = '';   // words the recogniser has finished with, kept across restarts
  let restarts = 0;
  let rec = null;
  let bump = 0;
  let analyser = null;
  let audio = null;
  let mic = null;

  if (onLevel && !ios && !coarse && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      mic = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio = new Ctx();
      analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      audio.createMediaStreamSource(stream).connect(analyser);
    }).catch(() => {});
  }
  const buf = new Uint8Array(128);
  let smooth = 0;
  const meter = onLevel ? setInterval(() => {
    let target;
    if (analyser) {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) { const v = (buf[i] - 128) / 128; sum += v * v; }
      target = Math.min(1, Math.sqrt(sum / buf.length) * 6);
    } else {
      bump *= 0.9;
      target = Math.min(1, 0.08 + Math.random() * 0.1 + bump);
    }
    // Rise quickly, fall slowly: the bars breathe instead of flickering.
    smooth += (target - smooth) * (target > smooth ? 0.6 : 0.22);
    onLevel(smooth);
  }, 50) : null;

  const release = () => {
    if (meter) clearInterval(meter);
    mic?.getTracks().forEach((t) => t.stop());
    audio?.close?.().catch?.(() => {});
    onLevel?.(0);
  };

  const begin = () => {
    rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    // Android Chrome repeats earlier words in continuous mode, so there each phrase is its own session.
    rec.continuous = !android;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      let fin = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript;
      }
      const sessionText = join(fin.trim(), interim.trim());
      if (sessionText) heard = true;
      bump = 0.5 + Math.random() * 0.4;
      onText?.(normalizeSpoken(join(finalText, sessionText)));
      // Remember finished words so a restart does not lose them.
      rec.__final = fin.trim();
    };
    rec.onerror = (event) => {
      if (event.error === 'no-speech' && !stopped) return; // quiet moment: onend restarts
      if (event.error === 'aborted') return;
      failed = true;
      onError?.(event.error || 'error');
    };
    rec.onend = () => {
      finalText = join(finalText, rec.__final || '');
      if (!stopped && !failed && restarts < 40) {
        restarts += 1;
        try { begin(); return; } catch { /* fall through and finish */ }
      }
      stopped = true;
      release();
      if (!heard && !failed) onError?.('no-speech');
      onEnd?.();
    };
    rec.start();
  };

  try {
    begin();
  } catch (err) {
    stopped = true;
    release();
    onError?.(err.message);
    return null;
  }
  return () => {
    stopped = true;
    try { rec.stop(); } catch { /* already stopped */ }
  };
}
