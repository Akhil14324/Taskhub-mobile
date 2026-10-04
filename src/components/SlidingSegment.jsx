import { useState, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { glass } from '../theme/glass';
import { apple } from '../theme/motion';

// A touch of bounce so the pill reads as liquid sliding under the labels, not a highlight that teleports.
const SLIDE = apple(0.5, 0.74);

/**
 * A segmented control whose selected state is one glass pill that slides (and stretches to the width of
 * each label) from option to option, instead of every option switching its own background.
 * `items`: [{ key, content }] where content is the (transparent) pressable for that option;
 * `value`: the selected key; `pillStyle`: radius / inset of the pill.
 */
export default function SlidingSegment({ items, value, style, pillStyle, variant = 'inset' }) {
  const [boxes, setBoxes] = useState({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);
  const onBox = useCallback((key, e) => {
    const { x: bx, width, height } = e.nativeEvent.layout;
    setBoxes((b) => (b[key] && b[key].x === bx && b[key].width === width ? b : { ...b, [key]: { x: bx, width, height } }));
  }, []);

  const box = boxes[value];
  useEffect(() => {
    if (!box) return;
    if (!placed.current) { // first time: just be there
      x.value = box.x; w.value = box.width; placed.current = true;
      return;
    }
    x.value = withSpring(box.x, SLIDE);
    w.value = withSpring(box.width, SLIDE);
  }, [box, x, w]);

  const pill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }], opacity: w.value > 0 ? 1 : 0 }));

  return (
    <View style={style}>
      <Animated.View {...glass(variant)} pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0 }, pillStyle, pill]} />
      {items.map((it) => (
        <View key={it.key} onLayout={(e) => onBox(it.key, e)} style={it.style}>{it.content}</View>
      ))}
    </View>
  );
}
