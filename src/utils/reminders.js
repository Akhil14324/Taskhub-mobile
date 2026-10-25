/**
 * Water, stretch and cat-voice settings. They are stored on the account as `preferences.reminders` and
 * follow the person to another device. A value that was never set (or is not one of the options) uses its
 * default. The backend whitelist (`PREFERENCE_RULES.reminders` in routes/users.js) must list the same options.
 */
export const REMINDER_OPTIONS = {
  waterGoal: [4, 6, 8, 10, 12], // glasses a day
  waterEvery: [30, 60, 90, 120], // minutes between asks
  waterFrom: [7, 8, 9, 10], // first hour of the day it may ask
  waterTo: [18, 20, 21, 22], // it stops asking from this hour
  stretchEvery: [60, 90, 120, 180], // minutes between stretch breaks
  stretchFrom: [8, 9, 10],
  stretchTo: [17, 18, 19, 20],
  catMeows: ['never', 'rarely', 'normal', 'often'],
  catVolume: ['soft', 'normal', 'loud'],
};

export const REMINDER_DEFAULTS = {
  waterGoal: 8,
  waterEvery: 60,
  waterFrom: 8,
  waterTo: 21,
  stretchEvery: 120,
  stretchFrom: 9,
  stretchTo: 19,
  catMeows: 'normal',
  catVolume: 'normal',
};

/** How often the cat meows on its own, as a multiplier of its normal chance. */
export const MEOW_RATE = { never: 0, rarely: 0.35, normal: 1, often: 2.5 };
/** How often a hungry or thirsty cat cries out, as a multiplier of the normal gap (0 = never). */
export const CRY_SCALE = { never: 0, rarely: 2, normal: 1, often: 0.5 };
/** Loudness of the cat's voice. */
export const VOLUME = { soft: 0.45, normal: 1, loud: 1.7 };

/** The effective settings for someone with these preferences. Usable outside React components. */
export function remindersOf(prefs) {
  const saved = prefs?.reminders || {};
  const out = {};
  for (const key of Object.keys(REMINDER_DEFAULTS)) {
    out[key] = REMINDER_OPTIONS[key].includes(saved[key]) ? saved[key] : REMINDER_DEFAULTS[key];
  }
  return out;
}

export const hourLabel = (h) => `${h}:00`;
