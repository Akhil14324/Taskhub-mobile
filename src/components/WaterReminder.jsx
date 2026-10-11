import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useIsDesktop from '../hooks/useBreakpoint';
import { spacing, radius, fontSize } from '../theme/theme';
import { glass } from '../theme/glass';
import { haptic } from '../utils/feedback';
import { todayYmd } from '../utils/dates';

// 8 glasses of 250 ml = 2 litres: the usual "at least" for a healthy adult (food supplies the rest).
const GOAL = 8;
const GLASS_ML = 250;
const EVERY_MS = 60 * 60 * 1000;
const SNOOZE_MS = 15 * 60 * 1000;
const FROM_HOUR = 8;
const TO_HOUR = 21;

/** Shrinks a picked photo to a small square-ish thumbnail so a day of them fits in storage. */
function thumbnail(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const scale = 96 / Math.max(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Opens the camera (phones) or the file picker (desktop); resolves with a thumbnail, or null if cancelled. */
function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      thumbnail(file).then(resolve);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

const key = (userId) => `th.water.${userId}`;

function load(userId) {
  const fresh = { day: todayYmd(), count: 0, next: Date.now(), photos: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) || 'null');
    if (saved && saved.day === fresh.day) return saved;
  } catch { /* storage blocked: start the day fresh */ }
  return fresh;
}

function save(userId, state) {
  try { localStorage.setItem(key(userId), JSON.stringify(state)); } catch { /* ignore */ }
}

/**
 * Water reminder: a small drop on every screen with today's count, and once an hour (08:00 to 21:00,
 * until the day's 8 glasses are done) a card asking you to drink. "I drank it" counts a glass, "Snooze"
 * asks again in 15 minutes. It lives on this device, only while TaskHub is open; turn it off in settings.
 */
export default function WaterReminder() {
  const colors = useColors();
  const { user } = useAuth();
  const desktop = useIsDesktop();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const enabled = user?.preferences?.waterReminder !== false;
  const userId = user?.id;
  const [state, setState] = useState(() => load(userId));
  const [asking, setAsking] = useState(false);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      save(userId, next);
      return next;
    });
  }, [userId]);

  // Check every 30 s: new day → reset; due and inside waking hours → ask.
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    const tick = () => {
      const today = todayYmd();
      setState((prev) => {
        if (prev.day === today) return prev;
        const next = { day: today, count: 0, next: Date.now(), photos: [] };
        save(userId, next);
        return next;
      });
      const hour = new Date().getHours();
      setState((prev) => {
        if (prev.count < GOAL && hour >= FROM_HOUR && hour < TO_HOUR && Date.now() >= prev.next) setAsking(true);
        return prev;
      });
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [enabled, userId]);

  if (!enabled || !userId) return null;

  // A glass only counts (and the reminder only stops) once a photo of the bottle or glass is added. It is
  // not checked, it's just for fun.
  const drank = async () => {
    const photo = await pickPhoto();
    if (!photo) return;
    haptic('light');
    setAsking(false);
    update({ count: Math.min(GOAL, state.count + 1), next: Date.now() + EVERY_MS, photos: [...(state.photos || []), photo].slice(-GOAL) });
  };
  const snooze = () => {
    setAsking(false);
    update({ next: Date.now() + SNOOZE_MS });
  };
  const done = state.count >= GOAL;
  const place = desktop ? { right: 20, bottom: 20 } : { left: 12, bottom: 112 };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {asking && (
        <View pointerEvents="box-none" style={styles.cardWrap}>
          <View {...glass('sheet')} style={styles.card}>
            <Ionicons name="water" size={34} color={colors.brand[600]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Time to drink water</Text>
              <Text style={styles.sub}>{state.count} of {GOAL} glasses today ({(GOAL * GLASS_ML) / 1000} L is the goal)</Text>
              {(state.photos || []).length > 0 && (
                <View style={styles.thumbs}>
                  {state.photos.map((src, i) => <Image key={i} source={{ uri: src }} style={styles.thumb} />)}
                </View>
              )}
              <Text style={styles.sub}>Add a photo of your water bottle or glass to count it.</Text>
              <View style={styles.buttons}>
                <Pressable onPress={snooze} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Snooze 15 min</Text></Pressable>
                <Pressable onPress={drank} style={[styles.btn, styles.solid]}><Ionicons name="camera" size={14} color="#fff" /><Text style={styles.solidText}>Photo of your glass</Text></Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
      <Pressable
        onPress={() => (done ? null : setAsking((v) => !v))}
        style={[styles.chip, place]}
        accessibilityLabel={`Water: ${state.count} of ${GOAL} glasses today`}
      >
        <Ionicons name={done ? 'checkmark-circle' : 'water-outline'} size={16} color={colors.brand[600]} />
        <Text style={styles.chipText}>{state.count}/{GOAL}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  chip: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: colors.brand[50], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brand[200],
  },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.brand[700] },
  cardWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', padding: spacing.lg, paddingBottom: 140 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, maxWidth: 420, width: '100%' },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 2 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  thumb: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.gray[200] },
  btn: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md },
  ghost: { backgroundColor: colors.gray[100] },
  ghostText: { fontWeight: '600', color: colors.gray[800], fontSize: fontSize.sm },
  solid: { backgroundColor: colors.brand[600] },
  solidText: { fontWeight: '700', color: '#fff', fontSize: fontSize.sm },
});
