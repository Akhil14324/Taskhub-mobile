import { memo, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { Avatar } from './kit';

/**
 * Autocomplete list shown while typing "@name". Renders nothing when there are no matches.
 * onPick(person) receives { id, name, username, ... }.
 */
function MentionSuggestions({ people, onPick, style }) {
  const colors = useColors();
  const s = useMemo(() => styles(colors), [colors]);
  const appear = useSharedValue(0);
  const visible = people && people.length > 0;

  useEffect(() => {
    appear.value = withTiming(visible ? 1 : 0, { duration: 140 });
  }, [visible, appear]);

  const animated = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ translateY: (1 - appear.value) * 6 }] }));
  if (!visible) return null;

  return (
    <Animated.View style={[s.box, animated, style]}>
      <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 220 }}>
        {people.map((p) => (
          <AnimatedPressable key={p.id} onPress={() => onPick(p)} style={s.row} haptic="light">
            <Avatar name={p.name} uri={p.profile_picture} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{p.name}</Text>
              <Text style={s.meta} numberOfLines={1}>
                @{p.username}{p.display_title ? ` · ${p.display_title}` : ''}
              </Text>
            </View>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = (colors) => StyleSheet.create({
  box: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  name: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  meta: { fontSize: fontSize.sm, color: colors.gray[500] },
});

export default memo(MentionSuggestions);
