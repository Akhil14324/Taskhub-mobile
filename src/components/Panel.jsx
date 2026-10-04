import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as SecureStore from '../utils/secureStorage';
import { SPRING } from '../theme/motion';

/**
 * Collapsible side panels (lists, conversations, the main sidebar). `p` is the open amount, 0 to 1, on the
 * UI thread: one spring drives the width, the slide of the content and the handle, so a panel closes
 * like a drawer with weight instead of blinking out. The choice is remembered per panel on this device.
 *  - hidden: force it shut without forgetting the choice (e.g. a detail pane needs the room).
 */
export function usePanel(storageKey, { defaultOpen = true, hidden = false } = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const [forced, setHidden] = useState(hidden);
  const openRef = useRef(defaultOpen);
  const p = useSharedValue(defaultOpen ? 1 : 0);

  useEffect(() => {
    SecureStore.getItemAsync(storageKey).then((v) => {
      if (v !== '0' && v !== '1') return;
      openRef.current = v === '1';
      setOpen(openRef.current);
    }).catch(() => {});
  }, [storageKey]);

  useEffect(() => { p.value = withSpring(open && !forced ? 1 : 0, SPRING.panel); }, [open, forced, p]);

  const set = useCallback((next) => {
    openRef.current = next;
    setOpen(next);
    SecureStore.setItemAsync(storageKey, next ? '1' : '0').catch(() => {});
  }, [storageKey]);
  const toggle = useCallback(() => set(!openRef.current), [set]);
  return { open: open && !forced, userOpen: open, p, setOpen: set, toggle, setHidden };
}

/** A panel that slides shut: its width follows `p`, its content stays at full width and slides under the edge. */
export function Panel({ p, width, children }) {
  const outer = useAnimatedStyle(() => ({ width: Math.max(0, width * Math.min(1.02, p.value)) }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - Math.min(1, Math.max(0, p.value))) * width * 0.18 }] }));
  return (
    <Animated.View style={[{ zIndex: 5 }, outer]}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={[{ width, flex: 1, flexDirection: 'row' }, inner]}>{children}</Animated.View>
      </View>
    </Animated.View>
  );
}
