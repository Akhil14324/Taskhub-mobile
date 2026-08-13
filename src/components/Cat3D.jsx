import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
  Ellipse,
  Circle,
  Path,
  Polygon,
  Line,
  G,
} from 'react-native-svg';

// Pseudo-3D ginger tabby cat built from layered SVG gradients + shadows.
// Looping micro-animations: breathing (body), tail sway, periodic blink.
// Outer bob/tilt/scale is applied by the parent (Oops.jsx).

const VIEWBOX = 200;
const TAIL_SIZE = 96;
// Tail attachment point in body-viewbox coordinates (right side of body).
const TAIL_ATTACH = { x: 150, y: 150 };

function CatBody({ blink }) {
  const eyeRy = blink ? 1.4 : 9;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
      <Defs>
        <RadialGradient id="headFill" cx="0.35" cy="0.3" r="0.85">
          <Stop offset="0%" stopColor="#ffe0b0" />
          <Stop offset="55%" stopColor="#f4a86a" />
          <Stop offset="100%" stopColor="#cf6f3a" />
        </RadialGradient>
        <LinearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#f4a86a" />
          <Stop offset="100%" stopColor="#c96a36" />
        </LinearGradient>
        <LinearGradient id="earFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#e89255" />
          <Stop offset="100%" stopColor="#b85f2e" />
        </LinearGradient>
        <RadialGradient id="irisFill" cx="0.5" cy="0.4" r="0.7">
          <Stop offset="0%" stopColor="#a6d97a" />
          <Stop offset="100%" stopColor="#3f7a26" />
        </RadialGradient>
      </Defs>

      {/* ground shadow (faked with stacked ellipses for reliability) */}
      <Ellipse cx="100" cy="186" rx="58" ry="11" fill="#000" opacity="0.06" />
      <Ellipse cx="100" cy="188" rx="46" ry="8" fill="#000" opacity="0.10" />

      {/* body */}
      <Path
        d="M62 120 C52 150 56 178 100 178 C144 178 148 150 138 120 C132 96 116 92 100 92 C84 92 68 96 62 120 Z"
        fill="url(#bodyFill)"
      />
      {/* belly highlight */}
      <Ellipse cx="100" cy="150" rx="26" ry="26" fill="#ffe2bd" opacity="0.55" />
      {/* front paws */}
      <Ellipse cx="84" cy="176" rx="12" ry="7" fill="#f6b884" />
      <Ellipse cx="116" cy="176" rx="12" ry="7" fill="#f6b884" />

      {/* ears (behind head top) */}
      <Polygon points="68,52 60,18 92,40" fill="url(#earFill)" />
      <Polygon points="132,52 140,18 108,40" fill="url(#earFill)" />
      <Polygon points="72,48 68,28 86,42" fill="#f9b0c0" />
      <Polygon points="128,48 132,28 114,42" fill="#f9b0c0" />

      {/* head */}
      <Circle cx="100" cy="64" r="42" fill="url(#headFill)" />

      {/* tabby stripes on forehead */}
      <Path d="M88 34 q4 8 0 14" stroke="#a8542a" strokeWidth="2.4" fill="none" opacity="0.5" />
      <Path d="M100 32 q0 9 0 16" stroke="#a8542a" strokeWidth="2.4" fill="none" opacity="0.5" />
      <Path d="M112 34 q-4 8 0 14" stroke="#a8542a" strokeWidth="2.4" fill="none" opacity="0.5" />

      {/* cheek blush */}
      <Ellipse cx="74" cy="78" rx="9" ry="6" fill="#ff9eb0" opacity="0.35" />
      <Ellipse cx="126" cy="78" rx="9" ry="6" fill="#ff9eb0" opacity="0.35" />

      {/* head glossy highlight (top-left, sells the 3D look) */}
      <Ellipse cx="82" cy="44" rx="14" ry="9" fill="#ffffff" opacity="0.3" />

      {/* eyes */}
      <G>
        <Ellipse cx="85" cy="66" rx="7.5" ry={eyeRy} fill="url(#irisFill)" />
        <Ellipse cx="115" cy="66" rx="7.5" ry={eyeRy} fill="url(#irisFill)" />
        {!blink && (
          <G>
            <Ellipse cx="85" cy="66" rx="3" ry="7.5" fill="#1a1a1a" />
            <Ellipse cx="115" cy="66" rx="3" ry="7.5" fill="#1a1a1a" />
            <Circle cx="83" cy="63" r="1.8" fill="#ffffff" />
            <Circle cx="113" cy="63" r="1.8" fill="#ffffff" />
          </G>
        )}
      </G>

      {/* nose */}
      <Polygon points="96,80 104,80 100,85" fill="#d98aa0" />

      {/* mouth */}
      <Path
        d="M100 85 q-6 6 -12 3 M100 85 q6 6 12 3"
        stroke="#7a4a2a"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />

      {/* whiskers */}
      <Line x1="64" y1="80" x2="86" y2="82" stroke="#fbe9d0" strokeWidth="1.2" opacity="0.8" />
      <Line x1="62" y1="86" x2="86" y2="86" stroke="#fbe9d0" strokeWidth="1.2" opacity="0.8" />
      <Line x1="136" y1="80" x2="114" y2="82" stroke="#fbe9d0" strokeWidth="1.2" opacity="0.8" />
      <Line x1="138" y1="86" x2="114" y2="86" stroke="#fbe9d0" strokeWidth="1.2" opacity="0.8" />
    </Svg>
  );
}

function CatTail() {
  // Tail drawn in its own 100x100 viewBox with the base at center (~50,50),
  // so rotating the wrapper around its center pivots at the attachment point.
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="tailFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#f4a86a" />
          <Stop offset="100%" stopColor="#b85f2e" />
        </LinearGradient>
      </Defs>
      <Path
        d="M50 52 C70 50 86 38 82 22 C80 12 70 10 64 18 C60 24 66 30 72 28 C76 27 76 22 72 22"
        stroke="url(#tailFill)"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      {/* tail tip highlight */}
      <Circle cx="72" cy="22" r="3" fill="#ffe0b0" opacity="0.5" />
    </Svg>
  );
}

export default function Cat3D({ size = 180 }) {
  const [blink, setBlink] = useState(false);

  const breath = useSharedValue(1);
  const tailSway = useSharedValue(0);

  useEffect(() => {
    // gentle breathing
    breath.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    // tail sway
    tailSway.value = withRepeat(
      withSequence(
        withTiming(9, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(-9, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [breath, tailSway]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3600);
    return () => clearInterval(interval);
  }, []);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  const tailStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tailSway.value}deg` }],
  }));

  // map tail attachment (viewbox coords) into the rendered component size
  const scale = size / VIEWBOX;
  const tailLeft = TAIL_ATTACH.x * scale - TAIL_SIZE / 2;
  const tailTop = TAIL_ATTACH.y * scale - TAIL_SIZE / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[styles.tail, { left: tailLeft, top: tailTop, width: TAIL_SIZE, height: TAIL_SIZE }, tailStyle]}
      >
        <CatTail />
      </Animated.View>
      <Animated.View style={[styles.body, bodyStyle]}>
        <CatBody blink={blink} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  tail: {
    position: 'absolute',
  },
  body: {
    ...StyleSheet.absoluteFillObject,
  },
});
