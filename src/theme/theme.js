// Work OS colours (MONDAY_FEATURE_SPEC.md F-DSN-01): a neutral base, one blue for actions, and named colours
// that mean something (green done, orange working, red stuck or late, purple waiting on someone). The token
// names are the ones every screen already uses (brand, gray, green, ...), so screens restyle without edits.
//
// Scales: 50 and 100 are tints for backgrounds, 500 is the colour itself, 600 is text and icons in that
// colour, 700 is the strong form. In dark mode the scales flip like the grey one: 50/100 are dark tints and
// 600/700 are the lighter, readable shades.

const scale = (t50, t100, c500, c600, c700) => ({ 50: t50, 100: t100, 500: c500, 600: c600, 700: c700 });

export const lightColors = {
  brand: {
    50: '#eaf3fe',
    100: '#cce5ff',
    200: '#a8cfff',
    300: '#7db5fb',
    400: '#3d8cf0',
    500: '#1f7cee',
    600: '#0073ea',
    700: '#0060b9',
    800: '#004b91',
    900: '#003366',
  },
  gray: {
    50: '#f6f7fb',
    100: '#eef0f6',
    200: '#e1e4ee',
    300: '#c3c6d4',
    400: '#9699a6',
    500: '#676879',
    600: '#535468',
    700: '#3d3e4a',
    800: '#323338',
    900: '#1f2023',
  },
  green: scale('#e6f9f1', '#bff0da', '#00c875', '#00854d', '#037f4c'),
  yellow: scale('#fff8db', '#ffeda3', '#ffcb00', '#8a6d00', '#6b5400'),
  red: scale('#fdecef', '#f9c9d1', '#e2445c', '#c9304a', '#a3263b'),
  purple: scale('#f4ecfb', '#e2cdf5', '#a25ddc', '#7e3fbf', '#6a32a3'),
  blue: scale('#eaf3fe', '#cce5ff', '#579bfc', '#0060b9', '#004b91'),
  indigo: scale('#eeeefc', '#d3d4f7', '#5559df', '#3d41c4', '#3235a3'),
  amber: scale('#fff3e3', '#fedeb2', '#fdab3d', '#a8650a', '#8a520a'),
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(16, 18, 40, 0.36)',
  page: '#f6f7fb',
  rim: 'rgba(0, 0, 0, 0.06)',
};

export const darkColors = {
  brand: {
    50: '#0e2349',
    100: '#133774',
    200: '#1a4a9a',
    300: '#2160c0',
    400: '#2b74da',
    500: '#3d8cf0',
    600: '#579bfc',
    700: '#8dbbfd',
    800: '#bbd6fe',
    900: '#e1eeff',
  },
  gray: {
    // 50 is the page, `white` below is a card or panel on it.
    50: '#181b34',
    100: '#22263f',
    200: '#2e3253',
    300: '#4b4e69',
    400: '#797e93',
    500: '#9699a6',
    600: '#b5b8c4',
    700: '#c9ccd6',
    800: '#d5d8df',
    900: '#eef0f6',
  },
  green: scale('#0f3326', '#13513a', '#00c875', '#3ddc97', '#6ee7b4'),
  yellow: scale('#3a3110', '#5c4c12', '#ffcb00', '#ffd84d', '#ffe58a'),
  red: scale('#3d1820', '#5e2230', '#e2445c', '#f0697f', '#f598a8'),
  purple: scale('#2c1d42', '#432b66', '#a25ddc', '#c08ae8', '#d6b1f0'),
  blue: scale('#0e2349', '#133774', '#579bfc', '#8dbbfd', '#bbd6fe'),
  indigo: scale('#1e1f4d', '#2c2e75', '#5559df', '#8a8df0', '#b3b5f6'),
  amber: scale('#3d2a10', '#5e3f12', '#fdab3d', '#fec26f', '#fed79f'),
  white: '#30324e',
  black: '#f6f7fb',
  overlay: 'rgba(0, 0, 0, 0.55)',
  page: '#181b34',
  rim: 'rgba(255, 255, 255, 0.08)',
};

/**
 * Named label colours (status labels, dropdown options, group colours, tags). Same names as the backend
 * PALETTE (utils/columns.js); the same hex in both themes, with the text colour that stays readable on it.
 */
export const PALETTE = {
  green: { hex: '#00c875', ink: '#1f1f1f' },
  orange: { hex: '#fdab3d', ink: '#1f1f1f' },
  red: { hex: '#df2f4a', ink: '#ffffff' },
  grey: { hex: '#c4c4c4', ink: '#1f1f1f' },
  blue: { hex: '#579bfc', ink: '#1f1f1f' },
  purple: { hex: '#a25ddc', ink: '#ffffff' },
  dark_green: { hex: '#037f4c', ink: '#ffffff' },
  grass: { hex: '#9cd326', ink: '#1f1f1f' },
  yellow: { hex: '#ffcb00', ink: '#1f1f1f' },
  dark_orange: { hex: '#ff6d3b', ink: '#1f1f1f' },
  pink: { hex: '#ff158a', ink: '#ffffff' },
  berry: { hex: '#bb3354', ink: '#ffffff' },
  lipstick: { hex: '#ff5ac4', ink: '#1f1f1f' },
  dark_purple: { hex: '#784bd1', ink: '#ffffff' },
  indigo: { hex: '#5559df', ink: '#ffffff' },
  dark_blue: { hex: '#007eb5', ink: '#ffffff' },
  sky: { hex: '#66ccff', ink: '#1f1f1f' },
  aquamarine: { hex: '#4eccc6', ink: '#1f1f1f' },
  brown: { hex: '#7f5347', ink: '#ffffff' },
  black: { hex: '#333333', ink: '#ffffff' },
};
export const PALETTE_NAMES = Object.keys(PALETTE);

/** The one action colour (buttons, links, selection, focus) in both themes. */
export const BRAND = '#0073ea';

export const colors = lightColors;

export function getColors(theme) {
  return theme === 'dark' ? darkColors : lightColors;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 30,
};

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// Type ramp (F-DSN-01: 12 / 13 / 14 / 16 / 20 / 24 / 32). Spread into a Text style: { ...type.title, color }.
export const type = {
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: -0.1 },
  callout: { fontSize: 14, lineHeight: 19, fontWeight: '500', letterSpacing: -0.1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  label: { fontSize: 12, lineHeight: 15, fontWeight: '600', letterSpacing: 0.1 },
};
