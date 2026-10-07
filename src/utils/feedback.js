import { Platform } from 'react-native';

/**
 * Small sounds and haptics, both optional in Settings. Sounds are synthesised in the browser (no audio
 * files): a soft tone for a finished to-do, a short rising phrase for a finished day or a new badge.
 * Haptics use the browser's vibration (Android Chrome; iPhones ignore it).
 *
 * Defaults: haptics on, sounds off (an office is a quiet place), celebrations on.
 */
let settings = { sounds: false, haptics: true, celebrations: true, reduceMotion: false, reminderSound: true };

export function configureFeedback(prefs = {}) {
  settings = {
    sounds: prefs.sounds === true,
    haptics: prefs.haptics !== false,
    celebrations: prefs.celebrations !== false,
    reduceMotion: !!prefs.reduceMotion,
    reminderSound: prefs.reminderSound !== false,
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
  // A reminder is meant to be noticed: a bell-like three-note call, played twice. Nothing else sounds like it.
  reminder: [
    [988, 0, 0.22, 0.11], [1319, 0.18, 0.22, 0.11], [1760, 0.36, 0.55, 0.12],
    [988, 1.1, 0.22, 0.11], [1319, 1.28, 0.22, 0.11], [1760, 1.46, 0.7, 0.12],
  ],
};

export function playSound(name) {
  if (!settings.sounds) return;
  try {
    const c = audio();
    if (!c) return;
    (PHRASES[name] || []).forEach(([f, s, l, v]) => note(c, f, s, l, v));
  } catch (e) { /* no audio available */ }
}

/** The reminder chime: on unless the person turned it off, and independent of the other sounds. */
export function playReminder() {
  if (!settings.reminderSound) return;
  try {
    const c = audio();
    if (!c) return;
    PHRASES.reminder.forEach(([f, s, l, v]) => note(c, f, s, l, v));
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  } catch (e) { /* no audio available */ }
}

/** Only the main moments vibrate (a finished to-do, a finished day, a badge); button taps ('light'/'medium') stay silent. */
export function haptic(kind = 'light') {
  if (kind !== 'success' && kind !== 'heavy') return;
  if (!settings.haptics || Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(kind === 'heavy' ? 24 : [12, 40, 18]);
  } catch (e) { /* vibration blocked */ }
}

/** Ready-made moments. */
export const feedback = {
  complete() { haptic('success'); playSound('done'); },
  dayComplete() { haptic('success'); playSound('day'); },
  badge() { haptic('success'); playSound('badge'); },
};
