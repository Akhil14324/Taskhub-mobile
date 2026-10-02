import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, interpolate } from 'react-native-reanimated';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useColors } from '../../context/ThemeContext';
import { useEngage } from '../../context/EngageContext';
import { spacing, fontSize } from '../../theme/theme';
import BadgeMedal from './BadgeMedal';
import { feedback, celebrationsOn, motionReduced } from '../../utils/feedback';
import * as SecureStore from '../../utils/secureStorage';

const PARTICLES = 22;
const SEEN_KEY = 'badges.seen';
const DAY_KEY = 'celebrated.day';
const SHOW_MS = 3600;

function Ring({ delay, colors }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) })); }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.5, 2.6]) }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: colors.brand[500] }, style]} />;
}

/** One speck thrown outwards from the centre; deterministic so it needs no randomness at render. */
function Speck({ i, colors }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(120, withTiming(1, { duration: 1300 + (i % 5) * 90, easing: Easing.out(Easing.cubic) })); }, [t, i]);
  const angle = (i / PARTICLES) * Math.PI * 2 + (i % 2) * 0.18;
  const reach = 120 + (i % 4) * 34;
  const size = 6 + (i % 3) * 3;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1, 0.75, 1], [0, 1, 0.8, 0]),
    transform: [
      { translateX: Math.cos(angle) * reach * t.value },
      { translateY: Math.sin(angle) * reach * t.value + 40 * t.value * t.value },
      { rotate: `${t.value * (i % 2 ? 220 : -220)}deg` },
      { scale: interpolate(t.value, [0, 0.2, 1], [0, 1, 0.5]) },
    ],
  }));
  const shade = [colors.brand[500], colors.brand[600], colors.brand[300] || colors.brand[400], colors.brand[700]][i % 4];
  return <Animated.View style={[{ position: 'absolute', width: size, height: i % 3 === 0 ? size : size * 2, borderRadius: i % 3 === 0 ? size / 2 : 2, backgroundColor: shade }, style]} />;
}

function Card({ item, onDone }) {
  const colors = useColors();
  const calm = motionReduced();
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withTiming(1, { duration: calm ? 150 : 420, easing: Easing.out(Easing.cubic) });
    const id = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(id);
  }, [pop, calm, onDone]);
  const badgeStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: calm ? 1 : interpolate(pop.value, [0, 1], [0.4, 1]) }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: withDelay(calm ? 0 : 220, withTiming(pop.value, { duration: 300 })), transform: [{ translateY: calm ? 0 : interpolate(pop.value, [0, 1], [12, 0]) }] }));

  const isBadge = item.kind === 'badge';
  return (
    <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }]} onPress={onDone}>
      <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center' }}>
        {!calm && [0, 220, 440].map((d) => <Ring key={d} delay={d} colors={colors} />)}
        {!calm && Array.from({ length: PARTICLES }, (_, i) => <Speck key={i} i={i} colors={colors} />)}
        <Animated.View style={badgeStyle}>
          {isBadge ? (
            <BadgeMedal badge={{ ...item.badge, earned: true }} size={110} />
          ) : (
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.brand[600], alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={72} color="#fff" />
            </View>
          )}
        </Animated.View>
      </View>
      <Animated.View style={[{ alignItems: 'center', gap: 4, paddingHorizontal: spacing.xl }, textStyle]}>
        <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: colors.brand[600], textTransform: 'uppercase' }}>{isBadge ? 'Badge earned' : 'All clear'}</Text>
        <Text style={{ fontSize: fontSize.xxxl, fontWeight: '900', color: colors.gray[900], textAlign: 'center' }}>{isBadge ? item.badge.title : 'Day complete'}</Text>
        <Text style={{ fontSize: fontSize.base, color: colors.gray[600], textAlign: 'center' }}>
          {isBadge ? item.badge.description : item.streak > 1 ? `Everything due is done. ${item.streak}-day streak.` : 'Everything that was due today is done.'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Full-screen moments: the day-complete celebration (once per day, the moment the last due item is
 * finished) and a pop-up when a new milestone badge is earned. Mounted once, next to the navigator.
 * Both are skipped when celebrations are off in Settings; reduced motion gets a calm fade.
 */
export default function Celebration() {
  const { user } = useAuth();
  const { myDay } = useEngage();
  const [queue, setQueue] = useState([]);
  const prevClear = useRef(undefined);
  const lastChecked = useRef('');
  const current = queue[0] || null;
  const next = useCallback(() => setQueue((q) => q.slice(1)), []);
  const enqueue = useCallback((item) => setQueue((q) => [...q, item]), []);

  // The moment the day turns "all clear".
  useEffect(() => {
    if (!myDay) return;
    const now = !!myDay.all_clear;
    if (prevClear.current === false && now && celebrationsOn()) {
      SecureStore.getItemAsync(DAY_KEY).then((v) => {
        if (v === myDay.today) return;
        SecureStore.setItemAsync(DAY_KEY, myDay.today).catch(() => {});
        feedback.dayComplete();
        enqueue({ kind: 'day', streak: myDay.streak });
      }).catch(() => {});
    }
    prevClear.current = now;
  }, [myDay, enqueue]);

  // New badges: compare with what this device has already shown.
  useEffect(() => {
    if (!user || !myDay) return;
    const sig = `${myDay.done_today}-${myDay.streak}`;
    if (lastChecked.current === sig) return;
    lastChecked.current = sig;
    (async () => {
      try {
        const res = await api.get('/engage/badges', { __skipOops: true });
        const earned = res.data.badges.filter((b) => b.earned);
        const raw = await SecureStore.getItemAsync(`${SEEN_KEY}.${user.id}`);
        await SecureStore.setItemAsync(`${SEEN_KEY}.${user.id}`, JSON.stringify(earned.map((b) => b.key)));
        if (raw === null) return; // first time on this device: do not announce a backlog
        const seen = new Set(JSON.parse(raw));
        const fresh = earned.filter((b) => !seen.has(b.key));
        if (fresh.length && celebrationsOn()) {
          feedback.badge();
          // The highest tier of each family is the one worth showing.
          const best = new Map();
          fresh.forEach((b) => { if (!best.has(b.family) || best.get(b.family).tier < b.tier) best.set(b.family, b); });
          best.forEach((badge) => enqueue({ kind: 'badge', badge }));
        }
      } catch (e) { /* offline: try again on the next change */ }
    })();
  }, [user, myDay, enqueue]);

  if (!current) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={next}>
      <Card key={queue.length + current.kind} item={current} onDone={next} />
    </Modal>
  );
}
