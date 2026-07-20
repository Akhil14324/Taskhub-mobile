import React from 'react';
import { StatusBar } from 'react-native';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import AppNavigator from './navigation/AppNavigator';

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <LanguageProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
