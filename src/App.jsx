import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StatusBar, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { ChatProvider } from './context/ChatContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppNavigator from './navigation/AppNavigator';

// Prevent splash screen from auto-hiding so we can control the transition
SplashScreen.preventAutoHideAsync().catch(() => { /* already prevented or native */ });

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />;
}

/**
 * Wraps the app content with a crossfade on theme change.
 * When dark/light mode toggles, the background color animates smoothly
 * instead of hard-swapping in a single frame.
 */
function ThemeCrossfade({ children }) {
  const { colors, theme } = useTheme();
  const bgColor = useSharedValue(colors.gray[50]);

  useEffect(() => {
    bgColor.value = withTiming(colors.gray[50], {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });
  }, [colors.gray[50], bgColor]);

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: bgColor.value,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}>
      {children}
    </Animated.View>
  );
}

function AppRoot() {
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);
  const splashHiddenRef = useRef(false);

  if (fontError) {
    console.warn('[app] font load error:', fontError);
  }

  // Hide splash screen with a crossfade once fonts are loaded
  useEffect(() => {
    if (fontsLoaded && !splashHiddenRef.current) {
      splashHiddenRef.current = true;
      // Small delay to let the first frame render, then hide splash
      requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => { /* native already hidden */ });
      });
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.gray[50] }}>
        <ActivityIndicator size="large" color={colors.brand[600]} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemedStatusBar />
        <AuthProvider>
          <ChatProvider>
            <LanguageProvider>
              <ErrorBoundary>
                <ThemeCrossfade>
                  <AppNavigator />
                </ThemeCrossfade>
              </ErrorBoundary>
            </LanguageProvider>
          </ChatProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppRoot />
    </ThemeProvider>
  );
}
