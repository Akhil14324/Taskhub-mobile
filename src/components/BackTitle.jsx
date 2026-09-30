import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import AnimatedPressable from './AnimatedPressable';

/**
 * Screen title with a back chevron when the screen was pushed on the stack.
 * Installed PWAs have no browser back button, so every pushed screen needs one.
 */
export default function BackTitle({ title, style }) {
  const colors = useColors();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {canGoBack && (
        <AnimatedPressable onPress={() => navigation.goBack()} hitSlop={10} haptic="light" style={{ marginLeft: -6, padding: 4 }}>
          <Ionicons name="chevron-back" size={26} color={colors.gray[700]} />
        </AnimatedPressable>
      )}
      <Text style={[style, { marginBottom: 0 }]} numberOfLines={1}>{title}</Text>
    </View>
  );
}
