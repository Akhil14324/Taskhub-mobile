import { Platform } from 'react-native';

/**
 * Small sounds and haptics, both optional in Settings. Sounds are synthesised in the browser (no audio
 * files): a soft tone for a finished to-do, a short rising phrase for a finished day or a new badge.
 * Haptics use the browser's vibration (Android Chrome; iPhones ignore it).
 *
 * Defaults: haptics on, sounds off (an office is a quiet place), celebrations on.
 */
let settings = { sounds: false, haptics: true, celebrations: true, reduceMotion: false };

export function configureFeedback(prefs = {}) {
  settings = {
    sounds: prefs.sounds === true,
    haptics: prefs.haptics !== false,
    celebrations: prefs.celebrations !== false,
    reduceMotion: !!prefs.reduceMotion,
  };
}
export const celebrationsOn = () => settings.celebrations;
export const motionReduced = () => settings.reduceMotion;

let ctx = null;
function audio() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** One soft note: a sine with a quick attack and a smooth fade, so it never clicks. */
function note(c, freq, start, length, volume) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

const PHRASES = {
  tap: [[1320, 0, 0.04, 0.025]],
  done: [[659, 0, 0.11, 0.05], [880, 0.07, 0.16, 0.05]],
  day: [[523, 0, 0.16, 0.055], [659, 0.1, 0.16, 0.055], [784, 0.2, 0.18, 0.055], [1047, 0.32, 0.4, 0.06]],
  badge: [[880, 0, 0.12, 0.05], [1175, 0.09, 0.12, 0.05], [1568, 0.18, 0.34, 0.05]],
};

export function playSound(name) {
  if (!settings.sounds) return;
  try {
    const c = audio();
    if (!c) return;
    (PHRASES[name] || []).forEach(([f, s, l, v]) => note(c, f, s, l, v));
  } catch (e) { /* no audio available */ }
}

export function haptic(kind = 'light') {
  if (!settings.haptics || Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(kind === 'heavy' ? 24 : kind === 'medium' ? 16 : kind === 'success' ? [12, 40, 18] : 8);
  } catch (e) { /* vibration blocked */ }
}

/** Ready-made moments. */
export const feedback = {
  complete() { haptic('success'); playSound('done'); },
  dayComplete() { haptic('success'); playSound('day'); },
  badge() { haptic('success'); playSound('badge'); },
};
