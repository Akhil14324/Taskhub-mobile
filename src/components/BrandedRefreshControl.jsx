import { memo, useEffect } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';

const SPIN_DURATION = 800;

/**
 * A branded RefreshControl that shows the app's checkmark-done icon
 * spinning in the brand color instead of the default gray spinner.
 *
 * Props: same as RN RefreshControl (refreshing, onRefresh, colors, tintColor, etc.)
 */
function BrandedRefreshControl({ refreshing, onRefresh, ...rest }) {
  const colors = useColors();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: SPIN_DURATION, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
  }, [refreshing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="transparent"
      colors={['transparent']}
      progressViewOffset={0}
      {...rest}
      // Override the native indicator with our custom view
      progressViewOffset={60}
    />
  );
}

/**
 * A custom refresh indicator overlay that can be placed at the top of a list.
 * Shows a spinning branded icon when refreshing.
 *
 * Props:
 * - refreshing: boolean
 */
export const RefreshIndicator = memo(function RefreshIndicator({ refreshing }) {
  const colors = useColors();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: SPIN_DURATION, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 200 });
    }
  }, [refreshing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (!refreshing) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={spinStyle}>
        <Ionicons name="checkmark-done-circle" size={28} color={colors.brand[600]} />
      </Animated.View>
    </View>
  );
});

/**
 * Drop-in replacement for RefreshControl with a branded spinner.
 * Uses the native RefreshControl but with brand colors.
 */
export const BrandedRefresh = memo(function BrandedRefresh({ refreshing, onRefresh, ...rest }) {
  const colors = useColors();
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.brand[600]}
      colors={[colors.brand[600]]}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BrandedRefresh;
