export const lightColors = {
  brand: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
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
  green: {
    50: '#f0fdf4',
    100: '#dcfce7',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },
  yellow: {
    50: '#fefce8',
    100: '#fef9c3',
    500: '#eab308',
    600: '#ca8a04',
    700: '#a16207',
  },
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  purple: {
    50: '#faf5ff',
    100: '#f3e8ff',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7e22ce',
  },
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
  },
  indigo: {
    50: '#eef2ff',
    100: '#e0e7ff',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
  },
  amber: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
  },
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.4)',
};

export const darkColors = {
  brand: {
    50: '#1e1b4b',
    100: '#312e81',
    200: '#3730a3',
    300: '#4338ca',
    400: '#6366f1',
    500: '#818cf8',
    600: '#a5b4fc',
    700: '#c7d2fe',
    800: '#e0e7ff',
    900: '#eef2ff',
  },
  gray: {
    50: '#0f172a',
    100: '#1e293b',
    200: '#334155',
    300: '#475569',
    400: '#64748b',
    500: '#94a3b8',
    600: '#cbd5e1',
    700: '#e2e8f0',
    800: '#f1f5f9',
    900: '#f8fafc',
  },
  green: {
    50: '#052e16',
    100: '#064e3b',
    500: '#22c55e',
    600: '#4ade80',
    700: '#86efac',
  },
  yellow: {
    50: '#422006',
    100: '#713f12',
    500: '#eab308',
    600: '#facc15',
    700: '#fde047',
  },
  red: {
    50: '#450a0a',
    100: '#7f1d1d',
    500: '#ef4444',
    600: '#f87171',
    700: '#fca5a5',
  },
  purple: {
    50: '#3b0764',
    100: '#581c87',
    500: '#a855f7',
    600: '#c084fc',
    700: '#d8b4fe',
  },
  blue: {
    50: '#172554',
    100: '#1e3a8a',
    500: '#3b82f6',
    600: '#60a5fa',
    700: '#93c5fd',
  },
  indigo: {
    50: '#1e1b4b',
    100: '#312e81',
    500: '#6366f1',
    600: '#818cf8',
    700: '#a5b4fc',
  },
  amber: {
    50: '#451a03',
    100: '#78350f',
    500: '#f59e0b',
    600: '#fbbf24',
    700: '#fcd34d',
  },
  white: '#1e293b',
  black: '#f8fafc',
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
