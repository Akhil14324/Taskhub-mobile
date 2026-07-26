import React from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { ChatProvider } from './context/ChatContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppNavigator from './navigation/AppNavigator';

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />;
}

function AppRoot() {
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  if (fontError) {
    console.warn('[app] font load error:', fontError);
  }

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.gray[50] }}>
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemedStatusBar />
      <AuthProvider>
        <ChatProvider>
          <LanguageProvider>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
          </LanguageProvider>
        </ChatProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppRoot />
    </ThemeProvider>
  );
}
