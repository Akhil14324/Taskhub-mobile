// Colours: true white and true black surfaces, one warm orange for actions (#D4621A, with the amber #F4AE52,
// the cream #FEF3E2 and the deep brown #2A1A0E as its scale), and named colours that mean something (green done,
// amber working, red stuck or late, purple waiting on someone). The token
// names are the ones every screen already uses (brand, gray, green, ...), so screens restyle without edits.
//
// Scales: 50 and 100 are tints for backgrounds, 500 is the colour itself, 600 is text and icons in that
// colour, 700 is the strong form. In dark mode the scales flip like the grey one: 50/100 are dark tints and
// 600/700 are the lighter, readable shades.

const scale = (t50, t100, c500, c600, c700) => ({ 50: t50, 100: t100, 500: c500, 600: c600, 700: c700 });

export const lightColors = {
  brand: {
    50: '#FEF3E2',
    100: '#FCE4C2',
    200: '#F9CD90',
    300: '#F4AE52',
    400: '#E88A32',
    500: '#DC7022',
    600: '#D4621A',
    700: '#B04E12',
    800: '#86390D',
    900: '#2A1A0E',
  },
  gray: {
    // Neutral greys with no blue tint: a pure white app with light grey lines.
    50: '#f7f7f7',
    100: '#f0f0f0',
    200: '#e4e4e4',
    300: '#cdcdcd',
    400: '#9a9a9a',
    500: '#6b6b6b',
    600: '#4f4f4f',
    700: '#383838',
    800: '#262626',
    900: '#111111',
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
  overlay: 'rgba(0, 0, 0, 0.32)',
  page: '#ffffff',
  rim: 'rgba(0, 0, 0, 0.06)',
};

export const darkColors = {
  brand: {
    50: '#2A1A0E',
    100: '#3B2310',
    200: '#5A3212',
    300: '#864313',
    400: '#B04E12',
    500: '#D4621A',
    600: '#EC8438',
    700: '#F4AE52',
    800: '#F9CD90',
    900: '#FEF3E2',
  },
  gray: {
    // True black. 50 is the page, `white` below is a panel on it (also black, set apart by its hairline).
    50: '#000000',
    100: '#121212',
    200: '#262626',
    300: '#3d3d3d',
    400: '#7a7a7a',
    500: '#a0a0a0',
    600: '#c2c2c2',
    700: '#d6d6d6',
    800: '#e8e8e8',
    900: '#f7f7f7',
  },
  green: scale('#0f3326', '#13513a', '#00c875', '#3ddc97', '#6ee7b4'),
  yellow: scale('#3a3110', '#5c4c12', '#ffcb00', '#ffd84d', '#ffe58a'),
  red: scale('#3d1820', '#5e2230', '#e2445c', '#f0697f', '#f598a8'),
  purple: scale('#2c1d42', '#432b66', '#a25ddc', '#c08ae8', '#d6b1f0'),
  blue: scale('#0e2349', '#133774', '#579bfc', '#8dbbfd', '#bbd6fe'),
  indigo: scale('#1e1f4d', '#2c2e75', '#5559df', '#8a8df0', '#b3b5f6'),
  amber: scale('#3d2a10', '#5e3f12', '#fdab3d', '#fec26f', '#fed79f'),
  white: '#000000',
  black: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.6)',
  page: '#000000',
  rim: 'rgba(255, 255, 255, 0.12)',
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
export const BRAND = '#D4621A';

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
