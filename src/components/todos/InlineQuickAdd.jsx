import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useColors } from '../../context/ThemeContext';
import AnimatedPressable from '../AnimatedPressable';
import { glass } from '../../theme/glass';
import { SPRING } from '../../theme/motion';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { parseQuickAdd } from '../../utils/quickAdd';
import { showToast } from '../../utils/events';

/**
 * With onExpand, touching the capsule does not type in place: it hands over to the full Quick add dialog,
 * which grows out of this capsule (onExpand receives the capsule's window rect and anything already typed).
 *
 * The floating glass capsule at the bottom of the to-do screen: type, press Enter, the to-do is added and
 * the capsule is ready for the next one. Understands the same shortcuts as Quick add (dates, +labels, p1,
 * "for 2h"). It swells slightly while focused, the send button springs in once there is text, and the
 * "more" button opens the full Quick add sheet (onMore).
 */
const InlineQuickAdd = forwardRef(function InlineQuickAdd({ defaults = {}, lists = [], placeholder, onMore, onExpand, hidden = false }, ref) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { createTodo } = useTodos();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), blur: () => inputRef.current?.blur() }), []);
  const focus = useSharedValue(0);
  const ready = useSharedValue(0);
  const hasText = text.trim().length > 0;
  useEffect(() => { ready.value = withSpring(hasText ? 1 : 0, SPRING.pop); }, [hasText, ready]);
  const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 + focus.value * 0.012 }, { scaleY: 1 + focus.value * 0.03 }] }));
  const sendStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, ready.value * 1.4), transform: [{ scale: 0.4 + ready.value * 0.6 }] }));

  const submit = async () => {
    const parsed = parseQuickAdd(text, lists);
    if (!parsed.title || saving) return;
    setSaving(true);
    try {
      await createTodo({
        title: parsed.title,
        due_date: parsed.due_date ?? defaults.due_date,
        due_time: parsed.due_time,
        priority: parsed.priority,
        recurrence: parsed.recurrence,
        list_id: defaults.business_id ? undefined : (parsed.list?.id ?? defaults.list_id),
        business_id: defaults.business_id || undefined,
        labels: [...new Set([...(parsed.labels || []), ...(defaults.labels || [])])],
        deadline_date: parsed.deadline_date,
        duration_minutes: parsed.duration_minutes,
      });
      setText('');
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add it', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const expand = () => {
    const node = wrapRef.current;
    if (!node?.measureInWindow) { onExpand({ rect: null, text }); return; }
    node.measureInWindow((x, y, width, height) => {
      onExpand({ rect: { x, y, width, height, radius: height / 2 }, text });
      setText('');
      // No blur here: iOS only raises the keyboard from a tap, so this input keeps focus (and the keyboard up)
      // until the dialog's own input takes it over. It lets go once the capsule is back (see below).
    });
  };

  useEffect(() => { if (!hidden) inputRef.current?.blur(); }, [hidden]);

  return (
    // A plain View carries the ref: it is the one that can report its window rect (an animated one cannot on web).
    <View ref={wrapRef} collapsable={false} style={styles.slot}>
    <Animated.View
      {...glass('capsule')}
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[styles.wrap, hidden && { opacity: 0 }, capsuleStyle]}
    >
      <Ionicons name="add-circle" size={24} color={colors.brand[600]} />
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        onFocus={() => { if (onExpand) { expand(); return; } focus.value = withSpring(1, SPRING.smooth); }}
        onBlur={() => { focus.value = withSpring(0, SPRING.smooth); }}
        blurOnSubmit={false}
        placeholder={placeholder || 'New to-do. Try "Call supplier tomorrow 4pm p1"'}
        placeholderTextColor={colors.gray[400]}
        style={styles.input}
        returnKeyType="done"
      />
      <Animated.View style={sendStyle} pointerEvents={hasText ? 'auto' : 'none'}>
        <AnimatedPressable onPress={submit} haptic="light" scale={0.88} accessibilityLabel="Add to-do" style={styles.send} {...glass('accent')}>
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </AnimatedPressable>
      </Animated.View>
      {!!onMore && !hasText && (
        <AnimatedPressable onPress={onMore} haptic="light" scale={0.88} accessibilityLabel="More options" style={styles.more}>
          <Ionicons name="options-outline" size={20} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </Animated.View>
    </View>
  );
});

export default InlineQuickAdd;

const createStyles = (colors) => StyleSheet.create({
  slot: { width: '100%', maxWidth: 720 },
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%',
    paddingLeft: spacing.lg, paddingRight: 6, minHeight: 56, borderRadius: 28, backgroundColor: colors.white,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: fontSize.md, letterSpacing: -0.2, color: colors.gray[900], outlineStyle: 'none' },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[600] },
  more: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -48 },
});
