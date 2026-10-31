import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import Popover, { anchorOf } from './Popover';

/** A small "?" that says in one or two plain sentences what the thing next to it does. */
export default function Hint({ text, size = 15, style }) {
  const colors = useColors();
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Pressable onPress={(e) => setAnchor(anchorOf(e))} hitSlop={8} accessibilityLabel="What is this?" style={style}>
        <Ionicons name="help-circle-outline" size={size} color={colors.gray[400]} />
      </Pressable>
      {anchor && (
        <Popover visible anchor={anchor} onClose={() => setAnchor(null)} width={260}>
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.gray[800], padding: 4 }}>{text}</Text>
        </Popover>
      )}
    </>
  );
}
