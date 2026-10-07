import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { SPRING } from '../theme/motion';
import useReducedMotion from '../hooks/useReducedMotion';

/**
 * How a module arrives. One spring drives opacity, a short slide and a slight settle in scale.
 * Opacity reaches 1 early (by ~40% of the spring) because an ancestor with opacity < 1 flattens the
 * backdrop blur of every glass surface inside it: the sooner it is 1, the sooner the glass is real.
 * When the spring is done the transform is dropped entirely (an identity transform would still make
 * a containing block for fixed / absolute children).
 */
function arrival(p, dx, dy) {
  'worklet';
  const v = Math.min(1, Math.max(0, p));
  if (p >= 0.9995) return { opacity: 1, transform: [] };
  const rest = 1 - p;
  return {
    opacity: Math.min(1, v * 1.8),
    transform: [{ translateX: dx * rest }, { translateY: dy * rest }],
  };
}

/**
 * Mounts, then springs in. Put `key` on it to replay the arrival when the content it holds changes
 * (a different layout or view): dir -1 / 1 slides from the left / right, 0 rises from below.
 */
export function Reveal({ dir = 0, distance = 30, rise = 14, style, children }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) p.value = withSpring(1, SPRING.screen); }, [p, reduced]);
  const animated = useAnimatedStyle(() => arrival(p.value, dir * distance, dir ? 0 : rise));
  return <Animated.View style={[{ flex: 1 }, style, animated]}>{children}</Animated.View>;
}

// Which way the last tab change went, so tabs slide the way the bar suggests.
const TAB_ORDER = ['Dashboard', 'Todos', 'ChatList'];
let lastTab = -1;

/**
 * Wraps a screen so it animates every time it comes into focus (tab change, route push, back).
 * The native stack does no transition at all in a browser, so this is where module changes get their
 * motion. `kind` 'tab' slides sideways by tab order; 'push' glides in from the right.
 */
export function withScreenTransition(Component, kind = 'push', name) {
  function Transitioned(props) {
    const focused = useIsFocused();
    const reduced = useReducedMotion();
    const p = useSharedValue(reduced ? 1 : 0);
    const dir = useSharedValue(kind === 'push' ? 1 : 0);
    useEffect(() => {
      if (reduced) { p.value = 1; return; }
      if (!focused) { p.value = 0; return; } // hidden: park it at the start for the next arrival
      if (kind === 'tab') {
        const i = TAB_ORDER.indexOf(name);
        dir.value = lastTab < 0 || i === lastTab ? 0 : i > lastTab ? 1 : -1;
        lastTab = i;
      }
      p.value = withSpring(1, SPRING.screen);
    }, [focused, reduced, p, dir]);
    const animated = useAnimatedStyle(() => arrival(p.value, dir.value * 34, dir.value ? 0 : 16));
    return (
      <Animated.View style={[{ flex: 1 }, animated]}>
        <Component {...props} />
      </Animated.View>
    );
  }
  Transitioned.displayName = `Transitioned(${Component.displayName || Component.name || 'Screen'})`;
  return Transitioned;
}
