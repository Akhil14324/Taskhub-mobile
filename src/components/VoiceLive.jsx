import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';

/**
 * The words slide in a few letters at a time instead of appearing in jumps, so the transcript reads like
 * someone typing it as you speak. When the recogniser corrects an earlier word the text steps back to
 * the part that is still right and carries on from there.
 */
function useTypedReveal(target) {
  const [shown, setShown] = useState('');
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const id = setInterval(() => {
      setShown((cur) => {
        const goal = targetRef.current;
        if (cur === goal) return cur;
        let common = 0;
        while (common < cur.length && common < goal.length && cur[common] === goal[common]) common += 1;
        if (common < cur.length) return cur.slice(0, common); // a correction: back up first
        const gap = goal.length - cur.length;
        const step = Math.max(1, Math.ceil(gap / 6));        // a long gap catches up faster
        return goal.slice(0, cur.length + step);
      });
    }, 28);
    return () => clearInterval(id);
  }, []);
  return shown;
}

/** Live recording panel: pulsing dot, moving wave, and the transcript as it is spoken. */
export default function VoiceLive({ levels, live, compact = false, onStop }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typed = useTypedReveal(live || '');
  const maxBar = compact ? 18 : 30;
  return (
    <View {...glass('inset')} style={[styles.box, compact && styles.boxCompact]} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text style={styles.rec}>Listening</Text>
        <View style={styles.wave}>
          {levels.map((v, i) => (
            <View
              key={i}
              style={[styles.bar, { height: 3 + Math.round(v * maxBar), opacity: 0.3 + v * 0.7, marginLeft: i ? 2 : 0 }]}
            />
          ))}
        </View>
        {!!onStop && (
          <Text style={styles.stop} onPress={onStop} accessibilityRole="button">Done</Text>
        )}
      </View>
      <Text style={[styles.text, !typed && { color: colors.gray[400] }]}>
        {typed || 'Speak now...'}
        {!!typed && <Text style={styles.caret}>|</Text>}
      </Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  box: {
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.brand[50], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brand[200],
  },
  boxCompact: { padding: spacing.sm, marginHorizontal: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand[600] },
  rec: { fontSize: 11, fontWeight: '800', color: colors.brand[700], textTransform: 'uppercase', letterSpacing: 0.6 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', height: 34, overflow: 'hidden' },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.brand[600] },
  stop: { fontSize: fontSize.sm, fontWeight: '800', color: colors.brand[700], paddingLeft: spacing.sm },
  text: { marginTop: spacing.sm, fontSize: fontSize.md, lineHeight: 24, color: colors.gray[900], fontWeight: '500' },
  caret: { color: colors.brand[600], fontWeight: '300' },
});
