import { Platform } from 'react-native';
import { remindersOf, MEOW_RATE, VOLUME } from './reminders';

/**
 * Small sounds and haptics, both optional in Settings. Sounds are synthesised in the browser (no audio
 * files): a soft tone for a finished to-do, a short rising phrase for a finished day or a new badge.
 * Haptics use the browser's vibration (Android Chrome; iPhones ignore it).
 *
 * Defaults: haptics on, sounds off (an office is a quiet place), celebrations on.
 */
let settings = { sounds: false, haptics: true, celebrations: true, reduceMotion: false, reminderSound: true, catMeows: 'normal', catGain: 1 };

export function configureFeedback(prefs = {}) {
  const reminders = remindersOf(prefs);
  settings = {
    sounds: prefs.sounds === true,
    haptics: prefs.haptics !== false,
    celebrations: prefs.celebrations !== false,
    reduceMotion: !!prefs.reduceMotion,
    reminderSound: prefs.reminderSound !== false,
    catMeows: reminders.catMeows,
    catGain: VOLUME[reminders.catVolume],
  };
}
/** How often the cat meows on its own (0 = never). Read by the cat buddy when it picks what to do. */
export const catMeowRate = () => MEOW_RATE[settings.catMeows];
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

/**
 * The cat buddy's voice, synthesised like everything else. A meow is a buzzy tone through a vowel-like
 * filter whose pitch rises then falls ("mi-aow"); a purr is a low rumble pulsing about 25 times a second.
 * `attention` meows (water, stretch) follow the reminder-sound setting; the rest follow "sounds".
 */
function synthMeow({ attention, pitch, length }) {
  try {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + 0.01;
    const peak = (attention ? 0.22 : 0.12) * settings.catGain;
    const osc = c.createOscillator();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520 * pitch, t0);
    osc.frequency.linearRampToValueAtTime(820 * pitch, t0 + length * 0.35);
    osc.frequency.linearRampToValueAtTime(470 * pitch, t0 + length);
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(900, t0);
    filter.frequency.linearRampToValueAtTime(1700, t0 + length * 0.4);
    filter.frequency.linearRampToValueAtTime(800, t0 + length);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.05);
    gain.gain.setValueAtTime(peak, t0 + length * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(filter); filter.connect(gain); gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.05);
  } catch (e) { /* no audio available */ }
}

export function playMeow({ attention = false, pitch = 1, length = 0.5 } = {}) {
  if (settings.catMeows === 'never') return;
  if (attention ? !settings.reminderSound : !settings.sounds) return;
  synthMeow({ attention, pitch, length });
}

/** The Settings "try it" button: plays a meow at the chosen volume, whatever the other sound switches say. */
export function previewMeow() {
  synthMeow({ attention: false, pitch: 1.15, length: 0.5 });
}

export function playPurr(seconds = 1.2) {
  if (!settings.sounds || settings.catMeows === 'never') return;
  try {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + 0.01;
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const gain = c.createGain();
    const peak = 0.06 * settings.catGain;
    osc.type = 'triangle';
    osc.frequency.value = 70;
    lfo.type = 'sine';
    lfo.frequency.value = 25;
    lfoGain.gain.value = 0.05;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.15);
    gain.gain.setValueAtTime(peak, t0 + seconds - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    lfo.connect(lfoGain); lfoGain.connect(gain.gain);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); lfo.start(t0);
    osc.stop(t0 + seconds + 0.05); lfo.stop(t0 + seconds + 0.05);
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
