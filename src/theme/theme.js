// The whole app is one colour: red. Every named hue below resolves to the same red scale, so
// a stray `colors.green[600]` or `colors.blue[500]` can never bring a second colour back.
const redScale = {
  50: '#fef2f2',
  100: '#fee2e2',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
};
const darkRedScale = {
  50: '#450a0a',
  100: '#7f1d1d',
  500: '#ef4444',
  600: '#f87171',
  700: '#fca5a5',
};

export const lightColors = {
  brand: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  green: redScale,
  yellow: redScale,
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  purple: redScale,
  blue: redScale,
  indigo: redScale,
  amber: redScale,
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.4)',
};

export const darkColors = {
  brand: {
    50: '#450a0a',
    100: '#7f1d1d',
    200: '#991b1b',
    300: '#b91c1c',
    400: '#dc2626',
    500: '#f87171',
    600: '#fca5a5',
    700: '#fecaca',
    800: '#fee2e2',
    900: '#fef2f2',
  },
  gray: {
    // Neutral greys on a true-black base (no blue tint): 50 is the page, `white` below is a card.
    50: '#000000',
    100: '#1a1a1a',
    200: '#2c2c2c',
    300: '#454545',
    400: '#737373',
    500: '#a3a3a3',
    600: '#d4d4d4',
    700: '#e5e5e5',
    800: '#f5f5f5',
    900: '#fafafa',
  },
  green: darkRedScale,
  yellow: darkRedScale,
  red: {
    50: '#450a0a',
    100: '#7f1d1d',
    500: '#ef4444',
    600: '#f87171',
    700: '#fca5a5',
  },
  purple: darkRedScale,
  blue: darkRedScale,
  indigo: darkRedScale,
  amber: darkRedScale,
  white: '#101010',
  black: '#fafafa',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

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
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
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
