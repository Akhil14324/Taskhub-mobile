import { memo, useState, useMemo, useEffect } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';

const SHIMMER_DURATION = 1200;

/**
 * Drop-in replacement for RN Image built on expo-image.
 * - Decodes + caches on the native side (smoother scroll in lists).
 * - Shimmer pulse placeholder while loading.
 * - Progressive fade-in via transition.
 * - Memoized so list re-renders don't re-trigger loads.
 */
function SmartImage({ source, style, resizeMode = 'cover', contentFit, ...rest }) {
  const colors = useColors();
  const [loaded, setLoaded] = useState(false);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (!loaded) {
      shimmer.value = withRepeat(
        withTiming(1, { duration: SHIMMER_DURATION, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, [loaded, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3], Extrapolation.CLAMP),
  }));

  const uri = typeof source === 'string' ? source : source?.uri;

  return (
    <View style={[{ backgroundColor: colors.gray[200] }, style]}>
      {!loaded && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.gray[300] }, shimmerStyle]}
          pointerEvents="none"
        />
      )}
      <ExpoImage
        source={typeof source === 'string' ? { uri: source } : source}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit || resizeMode}
        transition={180}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        onLoad={() => setLoaded(true)}
        {...rest}
      />
    </View>
  );
}

export default memo(SmartImage);

export const smartImageStyles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
