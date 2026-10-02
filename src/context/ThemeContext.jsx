import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors } from '../theme/theme';
import { setDarkMode } from '../components/kit';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('theme');
      if (saved) setTheme(saved);
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  setDarkMode(theme === 'dark');
  const colors = useMemo(() => getColors(theme), [theme]);

  // Native controls (scrollbars, date inputs, autofill) follow the app's theme on the web.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    document.body.style.backgroundColor = colors.gray[50];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#dc2626');
  }, [theme, colors]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme, colors }), [theme, toggleTheme, colors]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function useColors() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useColors must be used within ThemeProvider');
  return ctx.colors;
}
