import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { View, Modal, StyleSheet, Dimensions, Pressable, LayoutAnimation } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { useColors } from '../context/ThemeContext';
import Ionicons from '@expo/vector-icons/Ionicons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING_OPEN = { damping: 22, stiffness: 220, mass: 0.9, overshootClamping: true };
const SPRING_CLOSE = { damping: 26, stiffness: 280, mass: 0.8, overshootClamping: true };

/**
 * Hero image with tap-to-expand fullscreen transition.
 * The image flies from its inline position to fullscreen and back.
 *
 * Props:
 * - source: string | { uri: string }
 * - thumbStyle: style for the inline thumbnail
 * - fullscreenStyle: style for the fullscreen image (optional)
 * - contentFit: expo-image contentFit (default: 'cover' for thumb, 'contain' for fullscreen)
 * - recyclingKey: optional key for cache
 */
function HeroImage({ source, thumbStyle, contentFit = 'cover', recyclingKey }) {
  const colors = useColors();
  const [fullscreen, setFullscreen] = useState(false);
  const [measuredLayout, setMeasuredLayout] = useState(null);
  const [shouldRenderFullscreen, setShouldRenderFullscreen] = useState(false);
  const closeTimerRef = useRef(null);

  // Animated values for the fullscreen image position/size
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const bgOpacity = useSharedValue(0);

  const openFullscreen = useCallback((event) => {
    // Measure the thumbnail position on screen
    const layout = event.nativeEvent.layout;
    setMeasuredLayout(layout);
    setFullscreen(true);
  }, []);

  useEffect(() => {
    if (fullscreen && measuredLayout) {
      // Start from the thumbnail position
      const thumbX = measuredLayout.x;
      const thumbY = measuredLayout.y;
      const thumbW = measuredLayout.width;
      const thumbH = measuredLayout.height;

      // Target: centered fullscreen
      const targetW = SCREEN_WIDTH;
      const targetH = SCREEN_HEIGHT * 0.7;
      const targetX = 0;
      const targetY = (SCREEN_HEIGHT - targetH) / 2;

      // Initial state: at thumbnail position
      translateX.value = thumbX + thumbW / 2 - SCREEN_WIDTH / 2;
      translateY.value = thumbY + thumbH / 2 - targetH / 2 - (SCREEN_HEIGHT - targetH) / 2;
      scale.value = thumbW / SCREEN_WIDTH;
      opacity.value = 0;
      bgOpacity.value = 0;

      setShouldRenderFullscreen(true);

      // Animate to fullscreen
      translateX.value = withSpring(targetX, SPRING_OPEN);
      translateY.value = withSpring(targetY - (SCREEN_HEIGHT - targetH) / 2, SPRING_OPEN);
      scale.value = withSpring(1, SPRING_OPEN);
      opacity.value = withTiming(1, { duration: 200 });
      bgOpacity.value = withTiming(1, { duration: 250 });
    }
  }, [fullscreen, measuredLayout, translateX, translateY, scale, opacity, bgOpacity]);

  const closeFullscreen = useCallback(() => {
    if (!measuredLayout) {
      setFullscreen(false);
      return;
    }
    const thumbX = measuredLayout.x;
    const thumbY = measuredLayout.y;
    const thumbW = measuredLayout.width;
    const thumbH = measuredLayout.height;

    // Animate back to thumbnail position
    translateX.value = withSpring(thumbX + thumbW / 2 - SCREEN_WIDTH / 2, SPRING_CLOSE);
    translateY.value = withSpring(thumbY + thumbH / 2 - SCREEN_HEIGHT * 0.35 - (SCREEN_HEIGHT - SCREEN_HEIGHT * 0.7) / 2, SPRING_CLOSE);
    scale.value = withSpring(thumbW / SCREEN_WIDTH, SPRING_CLOSE);
    opacity.value = withTiming(0, { duration: 200 });
    bgOpacity.value = withTiming(0, { duration: 200 });

    closeTimerRef.current = setTimeout(() => {
      setFullscreen(false);
      setShouldRenderFullscreen(false);
    }, 300);
  }, [measuredLayout, translateX, translateY, scale, opacity, bgOpacity]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  // Pan-to-dismiss in fullscreen
  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX(8)
    .onUpdate((e) => {
      translateY.value = e.translationY;
      bgOpacity.value = interpolate(
        Math.abs(e.translationY),
        [0, 200],
        [1, 0.3],
        Extrapolation.CLAMP,
      );
      scale.value = interpolate(
        Math.abs(e.translationY),
        [0, 200],
        [1, 0.85],
        Extrapolation.CLAMP,
      );
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 600) {
        runOnJS(closeFullscreen)();
      } else {
        translateY.value = withSpring(0, SPRING_OPEN);
        bgOpacity.value = withSpring(1, SPRING_OPEN);
        scale.value = withSpring(1, SPRING_OPEN);
      }
    });

  const fullscreenImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const uri = typeof source === 'string' ? source : source?.uri;

  return (
    <>
      <Pressable onPress={openFullscreen} style={thumbStyle}>
        <ExpoImage
          source={source}
          style={thumbStyle}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey || uri}
          transition={150}
        />
      </Pressable>

      {shouldRenderFullscreen && (
        <Modal visible transparent animationType="none" onRequestClose={closeFullscreen} statusBarTranslucent>
          <Animated.View style={[styles.overlay, bgStyle]}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeFullscreen} />
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.fullscreenContainer, fullscreenImageStyle]}>
                <ExpoImage
                  source={source}
                  style={styles.fullscreenImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={recyclingKey || uri}
                />
              </Animated.View>
            </GestureDetector>
            <Pressable style={styles.closeBtn} onPress={closeFullscreen} hitSlop={12}>
              <Ionicons name="close" size={28} color={colors.white} />
            </Pressable>
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(HeroImage);
