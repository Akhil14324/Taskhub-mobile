import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { on } from '../utils/events';
import { playReminder, motionReduced } from '../utils/feedback';
import { openNotificationTarget } from '../navigation/navigationRef';

const FLASH_MS = 15000; // flashes for this long, then stays solid until dismissed

/**
 * Full-screen attention alert, raised when someone presses the bell on a task assigned to you
 * (`todo_nudge`). The whole screen flashes red with the message. It cannot light the screen of a
 * closed app (a website can't); in that case the push notification is shown and tapping it opens
 * the app straight into this alert.
 */
export default function AttentionAlert() {
  const colors = useColors();
  const [alert, setAlert] = useState(null);
  const flash = useSharedValue(1); // 1 = bright red, 0 = dark red

  useEffect(() => on('alert:show', (a) => { setAlert(a); playReminder(); }), []);

  useEffect(() => {
    if (!alert) return undefined;
    if (motionReduced()) { flash.value = 1; return undefined; }
    flash.value = withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1);
    const stop = setTimeout(() => { cancelAnimation(flash); flash.value = withTiming(1, { duration: 200 }); }, FLASH_MS);
    return () => { clearTimeout(stop); cancelAnimation(flash); };
  }, [alert, flash]);

  const bg = useAnimatedStyle(() => ({ opacity: flash.value }));
  if (!alert) return null;

  const close = () => setAlert(null);
  const open = () => { close(); openNotificationTarget({ type: 'todo_nudge', todoId: alert.todoId, noAlert: true }); };

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#450a0a' }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#dc2626' }, bg]} />
        <View style={styles.center}>
          <Ionicons name={alert.overdue ? 'alarm' : 'notifications'} size={72} color="#fff" />
          <Text style={styles.title}>{alert.title || 'Attention'}</Text>
          {!!alert.message && <Text style={styles.message}>{alert.message}</Text>}
          <View style={styles.buttons}>
            <Pressable onPress={close} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Dismiss</Text></Pressable>
            {!!alert.todoId && <Pressable onPress={open} style={[styles.btn, styles.solid]}><Text style={[styles.solidText, { color: colors.brand[700] }]}>Open task</Text></Pressable>}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center' },
  message: { color: '#fff', fontSize: fontSize.lg, textAlign: 'center', maxWidth: 420, opacity: 0.95 },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  btn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: radius.xl },
  ghost: { borderWidth: 2, borderColor: '#fff' },
  ghostText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
  solid: { backgroundColor: '#fff' },
  solidText: { fontWeight: '800', fontSize: fontSize.base },
});
