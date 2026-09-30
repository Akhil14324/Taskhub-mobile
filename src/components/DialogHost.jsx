import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Alert, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { on, showDialog } from '../utils/events';

// react-native-web's Alert.alert does nothing, which silently broke every confirm
// dialog in the PWA. Route it to the themed dialog below instead.
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    showDialog({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] });
  };
}

export default function DialogHost() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [queue, setQueue] = useState([]);
  const current = queue[0];
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => on('dialog:show', (options) => setQueue((q) => [...q, options])), []);

  useEffect(() => {
    if (current) {
      scale.value = 0.92;
      opacity.value = 0;
      scale.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.6 });
      opacity.value = withTiming(1, { duration: 160 });
    }
  }, [current, scale, opacity]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const close = useCallback((button) => {
    setQueue((q) => q.slice(1));
    if (button?.onPress) setTimeout(() => button.onPress(), 0);
  }, []);

  if (!current) return null;
  const buttons = current.buttons && current.buttons.length ? current.buttons : [{ text: 'OK' }];
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const stacked = buttons.length > 2;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => { current.onDismiss?.(); close(cancelButton); }}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (cancelButton) {
              current.onDismiss?.();
              close(cancelButton);
            }
          }}
        />
        <Animated.View style={[styles.card, cardStyle]}>
          {!!current.title && <Text style={styles.title}>{current.title}</Text>}
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}
          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDestructive = b.style === 'destructive';
              return (
                <AnimatedPressable
                  key={`${b.text}-${i}`}
                  haptic="light"
                  onPress={() => close(b)}
                  style={[
                    styles.btn,
                    !stacked && { flex: 1 },
                    isCancel ? styles.btnCancel : isDestructive ? styles.btnDanger : styles.btnPrimary,
                  ]}
                >
                  <Text style={[styles.btnText, isCancel ? styles.btnTextCancel : styles.btnTextOnColor]}>{b.text}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.base,
    color: colors.gray[600],
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
  },
  btn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: colors.brand[600] },
  btnDanger: { backgroundColor: colors.red[600] },
  btnCancel: { backgroundColor: colors.gray[100] },
  btnText: { fontSize: fontSize.base, fontWeight: '600' },
  // colors.white is the card colour, which reads correctly on brand/red in both themes.
  btnTextOnColor: { color: colors.white },
  btnTextCancel: { color: colors.gray[700] },
});
