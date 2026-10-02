import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';

/**
 * A badge as a medal. Tiers are told apart by how many rings it has and how deep the red is
 * (the app is one colour); a badge not yet earned is an empty grey outline.
 */
export default function BadgeMedal({ badge, size = 64 }) {
  const colors = useColors();
  const earned = badge.earned;
  const rings = Math.min(3, Math.ceil((badge.tier / Math.max(1, badge.tiers)) * 3));
  const core = earned ? colors.brand[600] : colors.gray[200];
  const ink = earned ? '#fff' : colors.gray[400];
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: rings }, (_, i) => {
        const gap = (i + 1) * 4;
        return (
          <View
            key={i}
            style={{
              position: 'absolute', top: -gap, left: -gap, right: -gap, bottom: -gap, borderRadius: size, borderWidth: 1.5,
              borderColor: earned ? colors.brand[500] : colors.gray[200], opacity: earned ? 0.65 - i * 0.18 : 0.6,
            }}
          />
        );
      })}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: core, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={badge.icon} size={size * 0.46} color={ink} />
        {earned && (
          <View style={{ position: 'absolute', bottom: -2, minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: colors.brand[600] }}>{badge.target >= 1000 ? `${badge.target / 1000}k` : badge.target}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
