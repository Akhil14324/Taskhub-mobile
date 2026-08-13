import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { PrimaryButton } from '../components/Button';
import Cat3D from '../components/Cat3D';
import { spacing, radius, fontSize } from '../theme/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

const NOT_FOUND_MSG_KEYS = ['oopsCatNotFound1', 'oopsCatNotFound2', 'oopsCatNotFound3'];
const OFFLINE_MSG_KEYS = ['oopsCatOffline1', 'oopsCatOffline2', 'oopsCatOffline3'];

const YARN_BALLS = [
  { emoji: '🧶', size: 30, top: 90, duration: 9000, delay: 0, drift: 30 },
  { emoji: '🧶', size: 22, top: 200, duration: 11000, delay: 1500, drift: -25 },
  { emoji: '🐾', size: 24, top: 420, duration: 10000, delay: 3000, drift: 35 },
  { emoji: '🧶', size: 18, top: 560, duration: 12000, delay: 4500, drift: -30 },
  { emoji: '🐾', size: 20, top: 320, duration: 13000, delay: 2000, drift: 22 },
];

const yarnBallStyle = {
  position: 'absolute',
  left: 0,
  opacity: 0.5,
};

function YarnBall({ config }) {
  const translateX = useSharedValue(-80);
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateX.value = withDelay(
      config.delay,
      withRepeat(
        withTiming(SCREEN_WIDTH + 80, { duration: config.duration, easing: Easing.linear }),
        -1,
        false
      )
    );
    translateY.value = withRepeat(
      withSequence(
        withTiming(config.drift, { duration: config.duration / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: config.duration / 2, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };
  }, [config]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View style={[yarnBallStyle, { top: config.top }, animStyle]}>
      <Text style={{ fontSize: config.size }}>{config.emoji}</Text>
    </Animated.View>
  );
}

export default function Oops() {
  const navigation = useNavigation();
  const route = useRoute();
  const mode = route.params?.mode === 'offline' ? 'offline' : 'notFound';
  const colors = useColors();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const msgKeys = mode === 'offline' ? OFFLINE_MSG_KEYS : NOT_FOUND_MSG_KEYS;
  const [msgIndex, setMsgIndex] = useState(0);

  const catScale = useSharedValue(1);
  const msgOpacity = useSharedValue(0);

  useEffect(() => {
    msgOpacity.value = 0;
    msgOpacity.value = withTiming(1, { duration: 450 });
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % msgKeys.length);
    }, 3800);
    return () => clearInterval(interval);
  }, [msgKeys.length]);

  const catStyle = useAnimatedStyle(() => ({
    transform: [{ scale: catScale.value }],
  }));

  const messageStyle = useAnimatedStyle(() => ({
    opacity: msgOpacity.value,
  }));

  const handlePet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    catScale.value = withSequence(
      withTiming(1.25, { duration: 140 }),
      withTiming(1, { duration: 220 })
    );
    setTimeout(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    }, 380);
  };

  const statusText = mode === 'offline' ? t('oopsCatStatusOffline') : t('oopsCatStatusNotFound');

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.yarnLayer} pointerEvents="none">
        {YARN_BALLS.map((config, i) => (
          <YarnBall key={i} config={config} />
        ))}
      </View>

      <View style={styles.content}>
        <Animated.View style={catStyle}>
          <Cat3D size={280} />
        </Animated.View>

        <View style={styles.sign}>
          <Text style={styles.signText}>{statusText}</Text>
        </View>

        <Animated.View style={[styles.messageWrap, messageStyle]}>
          <Text style={styles.message}>{t(msgKeys[msgIndex])}</Text>
        </Animated.View>

        <View style={styles.actions}>
          <PrimaryButton onPress={handlePet} style={styles.primaryBtn}>
            {t('petTheCatAndRetry')}
          </PrimaryButton>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.gray[50],
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    yarnLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
    },
    content: {
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      zIndex: 1,
    },
    sign: {
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.brand[300],
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      marginBottom: spacing.xl,
    },
    signText: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: colors.brand[700],
    },
    messageWrap: {
      minHeight: 64,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    message: {
      fontSize: fontSize.base,
      color: colors.gray[600],
      textAlign: 'center',
      fontWeight: '500',
    },
    actions: {
      width: '100%',
      maxWidth: 320,
      alignItems: 'center',
    },
    primaryBtn: {
      width: '100%',
    },
  });
