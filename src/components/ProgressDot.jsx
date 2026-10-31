import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColors } from '../context/ThemeContext';
import { BRAND } from '../theme/theme';

const DONE = '#00c875';

/**
 * A small circle that fills as a task's sub-tasks get done (blue while under way, green with a tick when all
 * are). `pct` is 0 to 100. Meant to sit next to a task's name, in a card or a row.
 */
export default function ProgressDot({ pct = 0, size = 20, stroke = 3 }) {
  const colors = useColors();
  const p = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const full = p >= 100;
  return (
    <View accessibilityLabel={`${Math.round(p)} percent done`} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.gray[200]} strokeWidth={stroke} fill={full ? DONE : 'none'} />
        {!full && p > 0 && (
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={BRAND} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${(p / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {full && <Path d={`M ${size * 0.28} ${size * 0.52} L ${size * 0.44} ${size * 0.68} L ${size * 0.73} ${size * 0.34}`} stroke="#fff" strokeWidth={stroke * 0.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>
    </View>
  );
}
