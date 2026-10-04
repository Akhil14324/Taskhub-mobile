import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as SecureStore from '../utils/secureStorage';
import AnimatedPressable from './AnimatedPressable';
import { useColors } from '../context/ThemeContext';
import { glass } from '../theme/glass';
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

/**
 * The small glass grip that straddles a panel's edge: tap to close, tap again to bring it back. It rides the
 * edge as the panel moves and parks against the window's left edge once the panel is shut.
 * The edge runs from `min` (shut, 0 for a drawer, the rail width for the main sidebar) to `max` (open).
 */
export function PaneHandle({ p, min = 0, max, open, onPress, label, top = '50%' }) {
  const colors = useColors();
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(4, min + (max - min) * Math.min(1.02, p.value) - 13) }] }));
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, top, marginTop: -14, zIndex: 40 }, style]}>
      <AnimatedPressable
        onPress={onPress}
        hitSlop={10}
        accessibilityLabel={label}
        {...glass('button')}
        style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={open ? 'chevron-back' : 'chevron-forward'} size={14} color={colors.gray[600]} />
      </AnimatedPressable>
    </Animated.View>
  );
}
