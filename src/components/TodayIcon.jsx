import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Todoist's Today icon: a little calendar page with today's day number on it. */
export default function TodayIcon({ size = 20, color, active }) {
  const day = new Date().getDate();
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={active ? 'calendar-clear' : 'calendar-clear-outline'} size={size} color={color} />
      <Text
        style={{
          position: 'absolute', top: size * 0.3, left: 0, right: 0, textAlign: 'center',
          fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.55), fontWeight: '800',
          color: active ? '#fff' : color,
        }}
      >
        {day}
      </Text>
    </View>
  );
}
