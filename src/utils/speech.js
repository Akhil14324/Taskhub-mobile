// Voice input for quick add, using the browser's speech recognition (Chrome, Edge, Safari 14.5+).
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

/**
 * Start listening. Calls onText(transcriptSoFar) while the person speaks and onEnd() when it stops.
 * Returns a stop() function, or null when speech is not available.
 */
export function startListening({ lang = 'en-IN', onText, onEnd, onError, onLevel }) {
  const Recognition = getRecognition();
  if (!Recognition) return null;
  const rec = new Recognition();
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let heard = false;
  let failed = false;
  // Loudness for the wave meter, 0..1. A laptop reads the real microphone. On a phone a second microphone
  // stream can knock the recogniser off (Android) or never start (iOS), so there the meter is driven by the
  // speech itself: it jumps each time new words arrive and falls back between them.
  let bump = 0;
  let analyser = null;
  let audio = null;
  let mic = null;
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
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
  let stopped = false;
  const buf = new Uint8Array(128);
  const meter = onLevel ? setInterval(() => {
    let level;
    if (analyser) {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) { const v = (buf[i] - 128) / 128; sum += v * v; }
      level = Math.min(1, Math.sqrt(sum / buf.length) * 5);
    } else {
      bump *= 0.82;
      level = Math.min(1, 0.1 + Math.random() * 0.12 + bump);
    }
    onLevel(level);
  }, 66) : null;
  const release = () => {
    stopped = true;
    if (meter) clearInterval(meter);
    mic?.getTracks().forEach((t) => t.stop());
    audio?.close?.().catch?.(() => {});
    onLevel?.(0);
  };
  rec.lang = lang;
  rec.interimResults = true;
  // iOS Safari only delivers live (interim) words when continuous; the person taps the mic again to finish.
  rec.continuous = ios;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    let text = '';
    for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript;
    if (text.trim()) heard = true;
    bump = 0.55 + Math.random() * 0.35;
    onText?.(normalizeSpoken(text));
  };
  rec.onerror = (event) => { failed = true; onError?.(event.error || 'error'); };
  rec.onend = () => {
    release();
    if (!heard && !failed) onError?.('no-speech');
    onEnd?.();
  };
  try {
    rec.start();
  } catch (err) {
    release();
    onError?.(err.message);
    return null;
  }
  return () => {
    try { rec.stop(); } catch { /* already stopped */ }
  };
}
