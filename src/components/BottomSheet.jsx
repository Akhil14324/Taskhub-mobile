import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Modal, StyleSheet, Dimensions, Pressable, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/theme';
import { glass } from '../theme/glass';
import { SPRING, apple, project } from '../theme/motion';
import useKeyboardInset from '../hooks/useKeyboardInset';
import useIsDesktop from '../hooks/useBreakpoint';
import useBackClose from '../hooks/useBackClose';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Open with a slightly lively spring; close with a critically damped one (nothing to overshoot while leaving).
const CLOSE_SPRING = { ...SPRING.smooth, overshootClamping: true };
const CLOSE_MORPH = { ...apple(0.5, 0.96), overshootClamping: true }; // leaving never undershoots the control it returns to
const CLOSE_DURATION = 300; // how long the exit spring is given before the Modal unmounts

/**
 * Gesture-driven bottom sheet that slides in/out on the UI thread.
 * Drag down to dismiss. Tap overlay to dismiss.
 *
 * Props:
 * - visible: boolean
 * - onClose: () => void
 * - children: ReactNode
 * - maxHeight: number (optional, defaults to 60% of screen)
 * - avoidKeyboard: lift the sheet above the on-screen keyboard (forms)
 * - origin: { x, y, width, height, radius } window rect of the control this sheet grows out of. The sheet
 *   then morphs from that rect to its resting place (and back on close) instead of sliding in: the shape,
 *   position and size are one spring, and the content fades in once there is room for it.
 * - onOpened / onClosed: after the arrival spring settles / after the sheet has fully left.
 */
export default function BottomSheet({ visible, onClose, children, maxHeight: requestedMaxHeight = SCREEN_HEIGHT * 0.6, avoidKeyboard = false, origin = null, onMorphStart, onOpened, onClosed }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const keyboardInset = useKeyboardInset();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const desktop = useIsDesktop();
  const liftBy = avoidKeyboard ? keyboardInset : 0;
  // A form sheet that grows out of a control on a phone is a floating dialog resting just above the keyboard.
  // The keyboard space is a spring-driven value that follows the keyboard (it is 0 until the keyboard reports),
  // so the dialog rides up with it instead of being re-laid-out on every resize event.
  const centered = !desktop && avoidKeyboard && !!origin;
  const floating = desktop || centered;
  const kbSpace = liftBy;
  // On a desktop browser the sheet is a centred dialog that fades in instead of sliding up.
  const maxHeight = Math.min(desktop ? Math.max(requestedMaxHeight, 640) : requestedMaxHeight, windowHeight - kbSpace - insets.top - 24);
  const hiddenY = desktop ? 14 : maxHeight;

  // Internal render gate: stays true during close animation so Modal doesn't unmount early
  const [shouldRender, setShouldRender] = useState(false);
  const closeTimerRef = useRef(null);
  const openTimerRef = useRef(null);

  const translateY = useSharedValue(hiddenY);
  const overlayOpacity = useSharedValue(0);
  const materialize = useSharedValue(0); // 0 -> 1 as the glass arrives: scale and fade together
  const shouldRenderRef = useRef(false);

  // Morph mode (a sheet that grows out of a control). 'plain' = the normal slide / scale arrival.
  // measure: laid out invisibly to learn where it will rest -> morph: size, position and radius spring
  // from the origin rect to that rect -> settled: ordinary layout again (same rect, nothing jumps).
  const [phase, setPhaseState] = useState('plain');
  const phaseRef = useRef('plain');
  const mode = useSharedValue(0);               // phase for worklets: 0 plain, 1 measure, 2 morph, 3 settled
  const setPhase = (next) => {
    phaseRef.current = next;
    mode.value = { plain: 0, measure: 1, morph: 2, settled: 3 }[next];
    setPhaseState(next);
  };
  const [rest, setRest] = useState(null);       // resting rect {x, y, w, h}
  const restRef = useRef(null);
  const m = useSharedValue(0);                  // 0 = at the origin control, 1 = resting
  const ox = useSharedValue(0); const oy = useSharedValue(0); const ow = useSharedValue(0); const oh = useSharedValue(0); const orad = useSharedValue(28);
  const tx = useSharedValue(0); const ty = useSharedValue(0); const tw = useSharedValue(0); const th = useSharedValue(0);
  const startedRef = useRef(false);
  const shTarget = useRef(0);
  const sh = useSharedValue(0);                 // the settled dialog's height: springs when its content changes size
  const kb = useSharedValue(0);                 // space left for the keyboard under a centred dialog (animated)
  const expectKb = useRef(false);               // the keyboard is about to come up: do not recentre in the gap

  const finishClose = () => {
    clearTimeout(closeTimerRef.current);
    if (!shouldRenderRef.current) return;
    shouldRenderRef.current = false;
    setShouldRender(false);
    setPhase('plain');
    kb.value = 0;
    onClosed?.();
  };
  const finishOpen = () => {
    clearTimeout(openTimerRef.current);
    if (phaseRef.current !== 'morph' || !shouldRenderRef.current) return; // already settled, or on its way out
    if (restRef.current) { sh.value = restRef.current.h; shTarget.current = restRef.current.h; } // the explicit height carries on from where the morph ended
    setPhase('settled');
    onOpened?.();
  };

  useEffect(() => {
    if (visible) {
      // Opening: mount immediately, animate in
      clearTimeout(closeTimerRef.current);
      if (!shouldRenderRef.current) {
        shouldRenderRef.current = true;
        startedRef.current = false;
        restRef.current = null;
        if (origin) {
          translateY.value = 0; // a morphing sheet is never parked below the screen (that is for the plain slide-in)
          expectKb.current = true;
          kb.value = liftBy;
          setTimeout(() => { expectKb.current = false; }, 1600);
          ox.value = origin.x; oy.value = origin.y; ow.value = origin.width; oh.value = origin.height; orad.value = origin.radius ?? origin.height / 2;
          m.value = 0;
          setPhase('measure');
        } else {
          setPhase('plain');
        }
        setShouldRender(true);
      }
      if (phaseRef.current === 'plain') {
        translateY.value = withSpring(0, SPRING.sheet);
        materialize.value = withSpring(1, SPRING.sheet);
      }
      overlayOpacity.value = withTiming(1, { duration: 260 });
    } else if (shouldRenderRef.current) {
      clearTimeout(openTimerRef.current);
      overlayOpacity.value = withTiming(0, { duration: 260 });
      if (phaseRef.current !== 'plain') {
        const r = restRef.current;
        if (!r || phaseRef.current === 'measure') { finishClose(); return; }
        // Fly back into the control it came from.
        translateY.value = 0;
        tx.value = r.x; ty.value = r.y; tw.value = r.w; th.value = r.h;
        if (phaseRef.current === 'settled') m.value = 1;
        setRest(r);
        setPhase('morph');
        m.value = withSpring(0, CLOSE_MORPH, (done) => { if (done) runOnJS(finishClose)(); });
        closeTimerRef.current = setTimeout(finishClose, 1100);
      } else {
        translateY.value = withSpring(hiddenY, CLOSE_SPRING);
        materialize.value = withSpring(0, CLOSE_SPRING);
        closeTimerRef.current = setTimeout(() => {
          shouldRenderRef.current = false;
          setShouldRender(false);
          onClosed?.();
        }, CLOSE_DURATION + 16);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, maxHeight, hiddenY, translateY, overlayOpacity, materialize]);

  // Where the sheet rests, worked out from its content's measured height (the sheet itself is an animated
  // view, and those do not report layout reliably on web): a dialog is centred, a phone sheet sits on the
  // bottom edge above the keyboard.
  // Under a centred dialog the keyboard space follows the real keyboard, as a spring (not a re-layout per event).
  useEffect(() => {
    if (!centered || !shouldRenderRef.current) return;
    if (liftBy > 0) { expectKb.current = false; kb.value = withSpring(liftBy, SPRING.smooth); }
    else if (!expectKb.current) kb.value = withSpring(0, SPRING.smooth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liftBy, centered]);

  const contentRef = useRef(null);
  // The resting rectangle for a given content height.
  const restFor = (contentH) => {
    const pad = spacing.sm + (floating ? spacing.sm : 28) + (floating || liftBy > 0 ? spacing.md : Math.max(insets.bottom, spacing.md));
    const width = desktop ? Math.min(620, windowWidth - 48) : centered ? Math.min(620, windowWidth - 24) : windowWidth;
    const height = Math.min(contentH + pad, maxHeight);
    const x = (windowWidth - width) / 2;
    const y = desktop ? (windowHeight - height) / 2
      : centered ? windowHeight - liftBy - 8 - (liftBy > 0 ? 0 : insets.bottom) - height
      : windowHeight - height - liftBy;
    return { x, y, w: width, h: height };
  };
  const restForRef = useRef(restFor);
  restForRef.current = restFor;
  const placeFrom = (contentH) => {
    if (phaseRef.current === 'plain' || phaseRef.current === 'morph') return;
    const r = restFor(contentH);
    const { x, y, w: width, h: height } = r;
    restRef.current = r;
    if (phaseRef.current !== 'measure' || startedRef.current || !contentH) return;
    startedRef.current = true;
    tx.value = x; ty.value = y; tw.value = width; th.value = height;
    setRest(r);
    setPhase('morph');
    onMorphStart?.();
    m.value = withSpring(1, SPRING.morph, (done) => { if (done) runOnJS(finishOpen)(); });
    // The spring's completion callback is not guaranteed to reach us (and a dialog stuck in its morph state keeps the
    // size it landed at, so later content spills out of the glass): settle on a timer as well.
    clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(finishOpen, 1700);
  };

  // Settled: the dialog is as tall as its content, and when that changes (a people list, a picker, a note field) the
  // glass springs to the new height on the UI thread instead of snapping. Read from the element itself, not onLayout.
  useEffect(() => {
    if (phase !== 'settled') return undefined;
    const id = setInterval(() => {
      const el = contentRef.current;
      const h = el && typeof el.offsetHeight === 'number' ? el.offsetHeight : 0;
      if (!h) return;
      const r = restForRef.current(h);
      restRef.current = r; // where the sheet would fly back to on close
      if (Math.abs(shTarget.current - r.h) < 1) return;
      shTarget.current = r.h;
      sh.value = withSpring(r.h, SPRING.layout);
    }, 70);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const onContentLayout = (e) => placeFrom(e.nativeEvent.layout.height);
  // Do not wait for a layout event: read the height straight off the element as soon as the portal has
  // mounted it (offsetHeight ignores the sheet's transform), retrying for a moment.
  useEffect(() => {
    if (phase !== 'measure') return undefined;
    let tries = 0;
    let timer;
    const poll = () => {
      const el = contentRef.current;
      const h = el && typeof el.offsetHeight === 'number' ? el.offsetHeight : 0;
      if (h > 0) { placeFrom(h); return; }
      if (++tries < 120) timer = setTimeout(poll, 16);
    };
    poll();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { clearTimeout(closeTimerRef.current); clearTimeout(openTimerRef.current); }, []);

  useBackClose(visible, onClose);

  // Esc closes the sheet (keyboard use).
  useEffect(() => {
    if (!visible || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  // Touch screens: pulling the sheet down from anywhere closes it, as long as whatever scrolls inside it
  // is already at the top (otherwise the pull is just scrolling).
  const touch = useRef(null);
  const scrolledAway = (node) => {
    for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return true;
    }
    return false;
  };
  const touchHandlers = desktop ? {} : {
    onTouchStart: (e) => {
      const t = e.nativeEvent.touches?.[0];
      touch.current = t ? { y: t.pageY, x: t.pageX, active: false, off: scrolledAway(e.target), lastY: t.pageY, lastT: Date.now(), vy: 0 } : null;
    },
    onTouchMove: (e) => {
      const s = touch.current;
      const t = e.nativeEvent.touches?.[0];
      if (!s || !t || s.off) return;
      const dy = t.pageY - s.y;
      if (!s.active) {
        if (dy > 14 && Math.abs(t.pageX - s.x) < dy) s.active = true;
        else return;
      }
      // Track the finger's speed (px/s) so release can hand it to the spring.
      const now = Date.now();
      if (now > s.lastT) s.vy = ((t.pageY - s.lastY) / (now - s.lastT)) * 1000;
      s.lastY = t.pageY; s.lastT = now;
      translateY.value = Math.max(0, dy - 14);
      overlayOpacity.value = interpolate(translateY.value, [0, maxHeight], [1, 0], Extrapolation.CLAMP);
    },
    onTouchEnd: (e) => {
      const s = touch.current;
      touch.current = null;
      if (!s || !s.active) return;
      const t = e.nativeEvent.changedTouches?.[0];
      const dy = t ? t.pageY - s.y : 0;
      // Decide from where the flick is heading, not where the finger let go.
      const heading = translateY.value + project(s.vy, 0.99);
      if (dy > 110 || heading > maxHeight * 0.45) {
        translateY.value = withSpring(maxHeight, { ...CLOSE_SPRING, velocity: s.vy });
        overlayOpacity.value = withTiming(0, { duration: 220 });
        onClose();
      } else {
        translateY.value = withSpring(0, { ...SPRING.sheet, velocity: s.vy });
        overlayOpacity.value = withTiming(1, { duration: 160 });
      }
    },
  };

  const morphing = phase === 'morph';
  const settledFloating = phase === 'settled' && floating;
  const sheetStyle = useAnimatedStyle(() => {
    if (mode.value === 1) return { opacity: 0, transform: [] };
    if (mode.value === 2) {
      // Two beats on one spring. First the capsule gathers itself into a round bubble and floats to the middle
      // of the screen (with a small hop); then the bubble unfolds into the dialog. Closing plays it backwards.
      const t = m.value;
      const B = 64;
      const SPLIT = 0.42;
      const cx = tx.value + tw.value / 2;
      const cy = ty.value + th.value / 2;
      const ocx = ox.value + ow.value / 2;
      const ocy = oy.value + oh.value / 2;
      const t1 = Math.min(1, Math.max(0, t / SPLIT));
      const t2 = Math.min(1, Math.max(0, (t - SPLIT) / (1 - SPLIT)));
      let w; let h; let x; let y; let topR; let botR;
      if (t < SPLIT) {
        w = ow.value + (B - ow.value) * t1;
        h = oh.value + (B - oh.value) * t1;
        x = ocx + (cx - ocx) * t1;
        y = ocy + (cy - ocy) * t1 - Math.sin(Math.PI * t1) * 36;
        topR = Math.min(w, h) / 2;
        botR = topR;
      } else {
        w = B + (tw.value - B) * t2;
        h = B + (th.value - B) * t2;
        x = cx; y = cy;
        topR = B / 2 + (28 - B / 2) * t2;
        botR = B / 2 + ((floating ? 28 : 0) - B / 2) * t2;
      }
      return {
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderTopLeftRadius: topR, borderTopRightRadius: topR, borderBottomLeftRadius: botR, borderBottomRightRadius: botR,
        opacity: 1,
        transform: [],
      };
    }
    if (mode.value === 3) {
      // Back to ordinary layout. The morph's absolute size and position are written explicitly away: a style that
      // is merely left out would keep the last inline value, and the dialog would stay the height it landed at
      // (content that appears later, like a people list, then spilled out of the glass).
      return {
        position: 'relative', left: 'auto', top: 'auto', width: floating ? '100%' : 'auto', height: sh.value > 0 ? sh.value : 'auto',
        borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: floating ? 28 : 0, borderBottomRightRadius: floating ? 28 : 0,
        transform: [{ translateY: translateY.value }], opacity: 1,
      };
    }
    return {
      transform: [{ translateY: translateY.value }, { scale: desktop ? 0.94 + 0.06 * materialize.value : 1 }],
      opacity: desktop ? Math.min(1, materialize.value * 1.4) : 1,
    };
  });
  // While morphing the content keeps its final layout (so nothing reflows) and fades in once the shape has room.
  const contentStyle = useAnimatedStyle(() => (mode.value === 2
    ? { opacity: interpolate(m.value, [0.64, 0.95], [0, 1], Extrapolation.CLAMP) }
    : { opacity: 1 }));

  const overlayStyle = useAnimatedStyle(() => (centered
    ? { opacity: overlayOpacity.value, paddingBottom: kb.value + 8 + insets.bottom * (1 - Math.min(1, kb.value / 60)) }
    : { opacity: overlayOpacity.value }));

  if (!shouldRender) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View {...glass('scrim')} style={[styles.overlay, desktop && { justifyContent: 'center', padding: 24 }, centered && { justifyContent: 'flex-end', paddingTop: insets.top + 12, paddingHorizontal: 12 }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View
          dataSet={{ glass: 'sheet', ...(centered && (phase === 'measure' || phase === 'morph') ? { morphing: '1' } : null) }}
          style={[
            styles.sheet, floating && styles.dialog,
            { maxHeight, marginBottom: centered ? 0 : liftBy }, (liftBy > 0 || centered) && { paddingBottom: spacing.md },
            phase === 'settled' && floating && { overflow: 'hidden' },
            morphing && { paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0, marginBottom: 0, maxHeight: undefined, overflow: 'hidden' },
            sheetStyle,
          ]}
          {...touchHandlers}
        >
          {/* Swipe-down handling is the touch handlers above (works from anywhere once content is at the top). */}
          <Animated.View
            style={[
              { flexShrink: settledFloating ? 0 : 1 }, // settled: natural height, so what is measured is not squeezed by the (animating) glass
              morphing && rest && {
                position: 'absolute', left: 0, top: 0, width: rest.w, height: rest.h,
                paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: floating || liftBy > 0 ? spacing.md : Math.max(insets.bottom, spacing.md),
              },
              contentStyle,
            ]}
          >
            {floating ? <View style={{ height: spacing.sm }} /> : (
              <View style={styles.handleZone}>
                <View style={styles.handle} />
              </View>
            )}
            <View ref={contentRef} style={{ flexShrink: settledFloating ? 0 : 1 }} onLayout={onContentLayout}>{children}</View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const createStyles = (colors, insets) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  dialog: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 620,
    borderRadius: 28,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Math.max(insets.bottom, spacing.md),
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  handleZone: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    marginTop: -spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[400],
    opacity: 0.55,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
});
