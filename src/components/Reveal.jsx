import { memo, useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SPRING, springCss } from '../theme/motion';
import useReducedMotion from '../hooks/useReducedMotion';

/**
 * How a module arrives: a quick fade and a short spring slide, played by the browser itself (Web Animations
 * API on transform / opacity), so it runs on the compositor and keeps moving while JavaScript is still busy
 * with the screen that just appeared. It starts in a layout effect, before the first paint, so the finished
 * screen never flashes first. Opacity is 1 within ~120 ms because an ancestor with opacity < 1 flattens the
 * backdrop blur of every glass surface inside it. Nothing is left behind when it ends (fill 'none'): an
 * identity transform would still make a containing block for fixed / absolute children.
 */
function arrive(el, dx, dy) {
  if (!el || typeof el.animate !== 'function') return null;
  const { easing, duration } = springCss(SPRING.screen);
  const fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' });
  const slide = el.animate(
    [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
    { duration, easing },
  );
  return () => { fade.cancel(); slide.cancel(); };
}

/**
 * Mounts, then springs in. Put `key` on it to replay the arrival when the content it holds changes
 * (a different layout or view): dir -1 / 1 slides from the left / right, 0 rises from below.
 */
export function Reveal({ dir = 0, distance = 24, rise = 10, style, children }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  // Once, on mount: the `key` the caller sets is what replays it.
  useLayoutEffect(() => (reduced ? undefined : arrive(ref.current, dir * distance, dir ? 0 : rise) || undefined), []);
  return <View ref={ref} style={[{ flex: 1 }, style]}>{children}</View>;
}

// Which way the last tab change went, so tabs slide the way the bar suggests.
const TAB_ORDER = ['Dashboard', 'Todos', 'ChatList'];
let lastTab = -1;

/**
 * Wraps a screen so it animates every time it comes into focus (tab change, route push, back).
 * The native stack does no transition at all in a browser, so this is where module changes get their
 * motion. `kind` 'tab' slides sideways by tab order; 'push' glides in from the right.
 * The screen itself is memoised: gaining or losing focus re-renders only this wrapper, never the
 * (often large) screen inside it, which is what made switching modules feel heavy.
 */
export function withScreenTransition(Component, kind = 'push', name) {
  const Screen = memo(Component);
  function Transitioned(props) {
    const focused = useIsFocused();
    const reduced = useReducedMotion();
    const ref = useRef(null);
    useLayoutEffect(() => {
      if (!focused || reduced) return undefined;
      let dx = 28; let dy = 0;
      if (kind === 'tab') {
        const i = TAB_ORDER.indexOf(name);
        const dir = lastTab < 0 || i === lastTab ? 0 : i > lastTab ? 1 : -1;
        lastTab = i;
        dx = dir * 24; dy = dir ? 0 : 10;
      }
      return arrive(ref.current, dx, dy) || undefined;
    }, [focused, reduced]);
    return (
      <View ref={ref} style={{ flex: 1 }}>
        <Screen {...props} />
      </View>
    );
  }
  Transitioned.displayName = `Transitioned(${Component.displayName || Component.name || 'Screen'})`;
  return Transitioned;
}
