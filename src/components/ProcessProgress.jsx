import { View, Text } from 'react-native';
import { useColors } from '../context/ThemeContext';
import { BRAND } from '../theme/theme';
import ProgressDot from './ProgressDot';
import { HealthPill } from './todos/TimeHealth';

/**
 * A task's progress from its steps: a ring, a bar, "2 of 5 steps · 78%", and a red "no step in 6 days" pill when
 * it has stalled. `p` comes from utils/progress.js. The percentage is by time when the steps have estimates.
 */
export default function ProcessProgress({ p, compact }) {
  const colors = useColors();
  if (!p) return null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ProgressDot pct={p.pct} size={compact ? 18 : 20} />
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
          <View style={{ width: `${p.pct}%`, height: 6, backgroundColor: p.pct >= 100 ? '#00c875' : BRAND }} />
        </View>
        <Text style={{ fontSize: 12, color: colors.gray[700], fontWeight: '600' }}>
          {p.done} of {p.total} steps · {p.pct}%{p.weighted ? ' by time' : ''}
        </Text>
      </View>
      {p.stalled && <HealthPill level="red" icon="hourglass-outline" compact label={`No step finished in ${p.idleDays} days${p.daysToDue === null || p.daysToDue === undefined ? '' : p.daysToDue < 0 ? `, ${-p.daysToDue}d late` : p.daysToDue === 0 ? ', due today' : `, due in ${p.daysToDue}d`}`} />}
    </View>
  );
}
