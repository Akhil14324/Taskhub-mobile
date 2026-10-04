import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { glass } from '../theme/glass';
import { apple } from '../theme/motion';

// The light-red highlight under the selected control is one shape that travels. Its edge facing the way it is
// moving runs ahead and the trailing edge follows a beat later, so it stretches across the gap and then
// settles, the way a drop of liquid crosses a surface.
const LEAD = apple(0.34, 0.82);
const TRAIL = apple(0.66, 0.84);
const MID = apple(0.5, 0.8);

const Ctx = createContext(null);

// Position of `el` inside `container` from the layout offsets (immune to transforms mid-animation).
function offsetWithin(el, container) {
  let x = 0; let y = 0; let n = el;
  while (n && n !== container) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return n === container ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
}

/**
 * Wrap a set of controls (tabs, segments, sidebar entries, navigation) in a SlideGroup and mark each with
 * <SlideItem active={...}>. The highlight is drawn once, behind them, and slides to whichever is active.
 * `inset` shrinks it inside the active item; `pillStyle` sets its radius.
 */
export function SlideGroup({ style, pillStyle, inset = 0, variant = 'tint', children }) {
  const ref = useRef(null);
  const activeId = useRef(null);
  const prev = useRef(null);
  const l = useSharedValue(0); const t = useSharedValue(0); const r = useSharedValue(0); const b = useSharedValue(0);
  const show = useSharedValue(0);

  const set = useCallback((id, rect) => {
    activeId.current = id;
    const next = { l: rect.l + inset, t: rect.t + inset, r: rect.r - inset, b: rect.b - inset };
    const p = prev.current;
    prev.current = next;
    if (!p) { // first appearance: just be there
      l.value = next.l; t.value = next.t; r.value = next.r; b.value = next.b;
      show.value = withTiming(1, { duration: 160 });
      return;
    }
    show.value = withTiming(1, { duration: 120 });
    if (p.l === next.l && p.t === next.t && p.r === next.r && p.b === next.b) return;
    const dx = (next.l + next.r) / 2 - (p.l + p.r) / 2;
    const dy = (next.t + next.b) / 2 - (p.t + p.b) / 2;
    const h = (lead) => (Math.abs(dx) < 2 ? MID : lead ? LEAD : TRAIL);
    const v = (lead) => (Math.abs(dy) < 2 ? MID : lead ? LEAD : TRAIL);
    l.value = withSpring(next.l, h(dx < 0));
    r.value = withSpring(next.r, h(dx > 0));
    t.value = withSpring(next.t, v(dy < 0));
    b.value = withSpring(next.b, v(dy > 0));
  }, [inset, l, t, r, b, show]);

  const unset = useCallback((id) => {
    // Hide only if nobody claims the highlight right after (the next active item, or this one re-reporting).
    if (activeId.current === id) activeId.current = null;
    setTimeout(() => { if (activeId.current === null) show.value = withTiming(0, { duration: 160 }); }, 60);
  }, [show]);

  const api = useMemo(() => ({ containerRef: ref, set, unset }), [set, unset]);

  const pill = useAnimatedStyle(() => ({
    left: l.value, top: t.value, width: Math.max(0, r.value - l.value), height: Math.max(0, b.value - t.value), opacity: show.value,
  }));

  return (
    <Ctx.Provider value={api}>
      <View ref={ref} style={style}>
        <Animated.View {...glass(variant)} pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, pillStyle, pill]} />
        {children}
      </View>
    </Ctx.Provider>
  );
}

export function SlideItem({ active, style, children }) {
  const ctx = useContext(Ctx);
  const ref = useRef(null);
  const id = useRef({}).current;
  const report = useCallback(() => {
    if (!ctx || !active) return;
    const el = ref.current; const c = ctx.containerRef.current;
    if (!el || !c) return;
    const o = offsetWithin(el, c);
    if (o && o.w) ctx.set(id, { l: o.x, t: o.y, r: o.x + o.w, b: o.y + o.h });
  }, [ctx, active, id]);
  useEffect(() => {
    if (!active || !ctx) return undefined;
    report();
    return () => ctx.unset(id);
  }, [active, ctx, report, id]);
  return <View ref={ref} onLayout={report} style={style}>{children}</View>;
}
