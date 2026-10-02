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
  Easing,
} from 'react-native-reanimated';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { ChatProvider } from './context/ChatContext';
import { TodoProvider } from './context/TodoContext';
import { EngageProvider } from './context/EngageContext';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import DialogHost from './components/DialogHost';
import ToastHost from './components/ToastHost';
import AppNavigator from './navigation/AppNavigator';

// Prevent splash screen from auto-hiding so we can control the transition
SplashScreen.preventAutoHideAsync().catch(() => { /* already prevented or native */ });

function ThemedStatusBar() {
  const { theme, colors } = useTheme();
  // The page behind the app must follow the theme too, or any gap shows the browser's white.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = colors.gray[50];
    document.body.style.backgroundColor = colors.gray[50];
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }, [colors, theme]);
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

const TEXT_ZOOM = { small: 0.92, normal: 1, large: 1.12 };

/** Applies the signed-in person's own settings (theme, text size, motion) to this device. */
function PreferencesApplier() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const prefs = user?.preferences || {};

  useEffect(() => {
    if (!prefs.theme) return undefined;
    if (prefs.theme !== 'system') { setTheme(prefs.theme); return undefined; }
    const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!media) return undefined;
    const apply = () => setTheme(media.matches ? 'dark' : 'light');
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [prefs.theme, setTheme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.zoom = String(TEXT_ZOOM[prefs.textSize] || 1);
  }, [prefs.textSize]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (!prefs.reduceMotion) return undefined;
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{transition-duration:0s !important;animation-duration:0s !important;animation-delay:0s !important}';
    document.head.appendChild(style);
    return () => style.remove();
  }, [prefs.reduceMotion]);

  return null;
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
          <PreferencesApplier />
          <ChatProvider>
            <TodoProvider>
              <EngageProvider>
              <NotificationProvider>
                <LanguageProvider>
                  <ErrorBoundary>
                    <ThemeCrossfade>
                      <AppNavigator />
                    </ThemeCrossfade>
                  </ErrorBoundary>
                  <ToastHost />
                  <DialogHost />
                </LanguageProvider>
              </NotificationProvider>
            </EngageProvider>
            </TodoProvider>
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
