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
export function startListening({ lang = 'en-IN', onText, onEnd, onError }) {
  const Recognition = getRecognition();
  if (!Recognition) return null;
  const rec = new Recognition();
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let heard = false;
  let failed = false;
  rec.lang = lang;
  rec.interimResults = true;
  // iOS Safari only delivers live (interim) words when continuous; the person taps the mic again to finish.
  rec.continuous = ios;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    let text = '';
    for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript;
    if (text.trim()) heard = true;
    onText?.(normalizeSpoken(text));
  };
  rec.onerror = (event) => { failed = true; onError?.(event.error || 'error'); };
  rec.onend = () => {
    if (!heard && !failed) onError?.('no-speech');
    onEnd?.();
  };
  try {
    rec.start();
  } catch (err) {
    onError?.(err.message);
    return null;
  }
  return () => {
    try { rec.stop(); } catch { /* already stopped */ }
  };
}
