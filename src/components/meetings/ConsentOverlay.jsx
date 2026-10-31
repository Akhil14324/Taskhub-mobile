import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { darkColors as dark } from '../../theme/theme';

const SECONDS = 3;
export const CONSENT_TEXT = 'Hi everyone, I am starting the recording.';

/**
 * The recording consent (company context, decision 4): before every recording the screen shows
 * "Hi everyone, I am starting the recording." for 3 seconds with a countdown, then `onDone()` starts it.
 * Esc or Cancel during the countdown calls `onCancel()` and nothing is recorded.
 */
export default function ConsentOverlay({ visible, onDone, onCancel }) {
  const [left, setLeft] = useState(SECONDS);
  const doneRef = useRef(onDone);
  const cancelRef = useRef(onCancel);
  doneRef.current = onDone;
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!visible) return undefined;
    setLeft(SECONDS);
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = SECONDS - Math.floor((Date.now() - started) / 1000);
      if (remaining <= 0) { clearInterval(id); doneRef.current?.(); } else setLeft(remaining);
    }, 100);
    const onKey = (e) => { if (e.key === 'Escape') { clearInterval(id); cancelRef.current?.(); } };
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true);
    return () => {
      clearInterval(id);
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: dark.page, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 28 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: dark.red[500], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>{left}</Text>
        </View>
        <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 34, fontWeight: '700', textAlign: 'center', maxWidth: 760, lineHeight: 44 }}>
          {CONSENT_TEXT}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="mic" size={18} color={dark.red[500]} />
          <Text style={{ color: dark.gray[700], fontSize: 15 }}>Recording starts in {left} second{left === 1 ? '' : 's'}</Text>
        </View>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: dark.gray[300] }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>Cancel (Esc)</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
