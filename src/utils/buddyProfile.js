/**
 * A person's cat buddy: its name and look. Stored on the account as `preferences.buddy` so it follows them to
 * another device and other people can see it. Mirrors vgrand-taskhub-backend/src/utils/buddyProfile.js.
 * Looks stay inside the app's one colour: white, blush, rose, ruby and a charcoal neutral.
 */
export const DEFAULT_NAME = 'Mochi';

export const COATS = [
  { key: 'snow', label: 'Snow', swatch: '#ffffff' },
  { key: 'cream', label: 'Cream', swatch: '#fff0dc' },
  { key: 'rose', label: 'Rose', swatch: '#ffc9cf' },
  { key: 'ruby', label: 'Ruby', swatch: '#ef6a72' },
  { key: 'shadow', label: 'Shadow', swatch: '#6b5a5a' },
];

export const HATS = [
  { key: 'none', label: 'None' },
  { key: 'party', label: 'Party hat' },
  { key: 'crown', label: 'Crown' },
  { key: 'beanie', label: 'Beanie' },
  { key: 'bow', label: 'Bow' },
  { key: 'glasses', label: 'Glasses' },
  { key: 'shades', label: 'Shades' },
];

/** The cat's profile from account preferences, with every missing piece filled in. */
export function buddyOf(preferences) {
  const b = preferences?.buddy || {};
  return {
    name: (typeof b.name === 'string' && b.name.trim()) || DEFAULT_NAME,
    coat: COATS.some((c) => c.key === b.coat) ? b.coat : 'snow',
    hat: HATS.some((h) => h.key === b.hat) ? b.hat : 'none',
  };
}
