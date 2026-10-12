import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { featureOn } from '../utils/features';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import { haptic } from '../utils/feedback';
import { todayYmd } from '../utils/dates';
import { isFocusActive, anyPopup, setPopup } from '../utils/focus';

const EVERY_MS = 2 * 60 * 60 * 1000;
const SNOOZE_MS = 15 * 60 * 1000;
const FROM_HOUR = 9;
const TO_HOUR = 19;
const SECONDS = 60;

const STRETCHES = [
  { icon: 'body-outline', name: 'Neck', steps: 'Drop your right ear toward your right shoulder for 15 seconds, then switch sides. Keep both shoulders low and relaxed. Finish with slow chin-to-chest nods.' },
  { icon: 'fitness-outline', name: 'Shoulders and chest', steps: 'Roll both shoulders back slowly 10 times, then forward 10 times. Then clasp your hands behind you, straighten your arms and open your chest for 15 seconds.' },
  { icon: 'arrow-up-outline', name: 'Back', steps: 'Stand up, interlace your fingers and reach high. Lean gently to the left for 15 seconds, then to the right. Finish by hinging forward and letting your arms hang.' },
  { icon: 'hand-left-outline', name: 'Wrists and hands', steps: 'Hold one arm out, palm up, and gently pull the fingers back for 15 seconds. Repeat palm down, then on the other hand. Finish by shaking both hands out.' },
  { icon: 'eye-outline', name: 'Eyes', steps: 'Look at something at least 6 metres away for 20 seconds. Then blink slowly 10 times and roll your eyes in a full circle each way.' },
  { icon: 'walk-outline', name: 'Legs', steps: 'Stand up and walk or march on the spot for a minute. Rise onto your toes 10 times and take a deep breath every few steps.' },
];

const key = (userId) => `th.stretch.${userId}`;

function load(userId) {
  // A new day starts quietly: the first stretch is about 40 minutes after the app opens.
  const fresh = { day: todayYmd(), count: 0, next: Date.now() + 40 * 60 * 1000 };
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) || 'null');
    if (saved && saved.day === fresh.day) return saved;
  } catch { /* storage blocked */ }
  return fresh;
}

function save(userId, state) {
  try { localStorage.setItem(key(userId), JSON.stringify(state)); } catch { /* ignore */ }
}

/**
 * Stretch break: every two hours (09:00 to 19:00) a pop-up gives one stretch (neck, shoulders, back,
 * wrists, eyes or legs) and a one-minute countdown. Done unlocks when the minute is up; Snooze asks again
 * in 15 minutes. It waits while a focus session runs and while another reminder is on screen.
 */
export default function StretchBreak() {
  const colors = useColors();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const enabled = featureOn(user?.preferences, 'stretch');
  const userId = user?.id;
  const [state, setState] = useState(() => load(userId));
  const [asking, setAsking] = useState(false);
  const [left, setLeft] = useState(null); // null = not started

  const update = (patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      save(userId, next);
      return next;
    });
  };

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    const tick = () => {
      const today = todayYmd();
      setState((prev) => {
        if (prev.day === today) return prev;
        const next = { day: today, count: 0, next: Date.now() + 40 * 60 * 1000 };
        save(userId, next);
        return next;
      });
      const hour = new Date().getHours();
      setState((prev) => {
        const due = hour >= FROM_HOUR && hour < TO_HOUR && Date.now() >= prev.next;
        if (due && !isFocusActive() && !anyPopup()) setAsking(true);
        return prev;
      });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [enabled, userId]);

  useEffect(() => {
    setPopup('stretch', asking);
    return () => setPopup('stretch', false);
  }, [asking]);

  useEffect(() => {
    if (left === null || left <= 0) return undefined;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  if (!enabled || !userId || !asking) return null;

  const stretch = STRETCHES[state.count % STRETCHES.length];
  const running = left !== null && left > 0;
  const finished = left === 0;

  const done = () => {
    haptic('light');
    setAsking(false);
    setLeft(null);
    update({ count: state.count + 1, next: Date.now() + EVERY_MS });
  };
  const snooze = () => {
    setAsking(false);
    setLeft(null);
    update({ next: Date.now() + SNOOZE_MS });
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.scrim} onPress={snooze} accessibilityLabel="Snooze" />
      <View {...glass('sheet')} style={styles.card}>
        <View style={styles.row}>
          <Ionicons name={stretch.icon} size={30} color={colors.brand[600]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Stretch break: {stretch.name}</Text>
            <Text style={styles.sub}>{state.count} stretch{state.count === 1 ? '' : 'es'} so far today</Text>
          </View>
        </View>
        <Text style={styles.steps}>{stretch.steps}</Text>
        {running && <Text style={styles.clock}>{left}s</Text>}
        <View style={styles.buttons}>
          <Pressable onPress={snooze} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Snooze 15 min</Text></Pressable>
          {left === null && <Pressable onPress={() => setLeft(SECONDS)} style={[styles.btn, styles.solid]}><Text style={styles.solidText}>Start 1 minute</Text></Pressable>}
          {running && <View style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Keep going</Text></View>}
          {finished && <Pressable onPress={done} style={[styles.btn, styles.solid]}><Text style={styles.solidText}>Done</Text></Pressable>}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8000, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { width: '100%', maxWidth: 440, padding: spacing.lg, borderRadius: radius.xl, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 2 },
  steps: { fontSize: fontSize.base, color: colors.gray[800], lineHeight: 21 },
  clock: { fontSize: 40, fontWeight: '800', color: colors.brand[600], textAlign: 'center', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md },
  ghost: { backgroundColor: colors.gray[100] },
  ghostText: { fontWeight: '600', color: colors.gray[800], fontSize: fontSize.sm },
  solid: { backgroundColor: colors.brand[600] },
  solidText: { fontWeight: '700', color: '#fff', fontSize: fontSize.sm },
});
