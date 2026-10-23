import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import useFeature from '../hooks/useFeature';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import { on as onEvent, openFocus, showToast, emit } from '../utils/events';
import { pickTask } from '../utils/roulette';
import { openNotificationTarget } from '../navigation/navigationRef';

/**
 * "Pick for me": chooses one open to-do from the list on screen and says why. Overdue work, close
 * deadlines and urgent priority are likelier than undated work; "Another one" never repeats a pick.
 */
export default function RoulettePicker() {
  const colors = useColors();
  const { on } = useFeature();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [round, setRound] = useState(null); // { candidates, skip, pick }
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => onEvent('roulette:open', ({ candidates } = {}) => {
    if (!onRef.current('roulette')) return;
    const pick = pickTask(candidates, []);
    if (!pick) { showToast({ message: 'Nothing open to pick from here', icon: 'checkmark-done' }); return; }
    setRound({ candidates, skip: [pick.todo.id], pick });
    emit('buddy', { type: 'roulette', title: pick.todo.title });
  }), []);

  if (!round) return null;
  const { pick } = round;
  const close = () => setRound(null);
  const another = () => {
    const next = pickTask(round.candidates, round.skip);
    if (!next) { showToast({ message: 'That was every open to-do here', icon: 'checkmark-done' }); return; }
    setRound({ ...round, skip: [...round.skip, next.todo.id], pick: next });
    emit('buddy', { type: 'roulette', title: next.todo.title });
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
      <View {...glass('sheet')} style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="dice-outline" size={24} color={colors.brand[600]} />
          <Text style={styles.heading}>Do this next</Text>
        </View>
        <Text style={styles.title}>{pick.todo.title}</Text>
        <Text style={styles.reason}>{pick.reason}</Text>
        <View style={styles.buttons}>
          {pick.remaining > 0 && <Pressable onPress={another} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Another one</Text></Pressable>}
          <Pressable onPress={() => { close(); openNotificationTarget({ todoId: pick.todo.id }); }} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Open</Text></Pressable>
          {on('focus') && (
            <Pressable onPress={() => { close(); openFocus({ todo: pick.todo }); }} style={[styles.btn, styles.solid]}><Text style={styles.solidText}>Focus on it</Text></Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9000, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { width: '100%', maxWidth: 420, padding: spacing.lg, borderRadius: radius.xl, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heading: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  reason: { fontSize: fontSize.base, color: colors.brand[700], fontWeight: '600' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  btn: { flexGrow: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.md },
  ghost: { backgroundColor: colors.gray[100] },
  ghostText: { fontWeight: '600', color: colors.gray[800], fontSize: fontSize.sm },
  solid: { backgroundColor: colors.brand[600] },
  solidText: { fontWeight: '700', color: '#fff', fontSize: fontSize.sm },
});
