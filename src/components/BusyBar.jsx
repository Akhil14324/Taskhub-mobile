import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, cancelAnimation, Easing } from 'react-native-reanimated';
import { onBusy } from '../utils/busy';
import { BRAND } from '../theme/theme';
import { SPRING } from '../theme/motion';

const SHOW_AFTER_MS = 120; // fast requests never flash the bar
const MIN_SHOW_MS = 350;   // once shown it stays long enough to be seen

/**
 * A thin bar across the top of the screen while something the person did is waiting on the server
 * (every request in api/client.js without `__skipOops`). Without it a slow save looks like nothing happened.
 */
export default function BusyBar() {
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const x = useSharedValue(-1);
  const fade = useSharedValue(0);

  useEffect(() => onBusy((n) => {
    if (n > 0) {
      clearTimeout(hideTimer.current);
      if (!visible && !showTimer.current) {
        showTimer.current = setTimeout(() => { showTimer.current = null; shownAt.current = Date.now(); setVisible(true); }, SHOW_AFTER_MS);
      }
    } else {
      clearTimeout(showTimer.current);
      showTimer.current = null;
      const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - shownAt.current));
      hideTimer.current = setTimeout(() => setVisible(false), visible ? wait : 0);
    }
  }), [visible]);

  useEffect(() => {
    if (visible) {
      fade.value = withSpring(1, SPRING.smooth);
      x.value = -1;
      x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false);
    } else {
      fade.value = withSpring(0, SPRING.smooth);
      const t = setTimeout(() => cancelAnimation(x), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible, x, fade]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: x.value * width }, { scaleX: 0.45 }],
  }));

  return (
    <View pointerEvents="none" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 100000, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 3, width: '100%', backgroundColor: BRAND, borderRadius: 2 }, style]} />
    </View>
  );
}
