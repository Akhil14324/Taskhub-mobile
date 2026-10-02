import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';

/**
 * Ask for a short piece of text (a reason, a note, a warning message) before doing something.
 * value = null (closed) | { title, hint?, placeholder?, confirmLabel?, required?, destructive? }
 * onSubmit(text) is called with the trimmed text.
 */
export default function PromptSheet({ value, onClose, onSubmit }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  useEffect(() => { if (value) setText(''); }, [value]);
  if (!value) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const trimmed = text.trim();
  const blocked = value.required && !trimmed;
  return (
    <BottomSheet visible onClose={onClose} maxHeight={420} avoidKeyboard>
      <View style={styles.wrap}>
        <Text style={styles.title}>{value.title}</Text>
        {!!value.hint && <Text style={styles.hint}>{value.hint}</Text>}
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder={value.placeholder || 'Write a note'}
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          multiline
        />
        <View style={styles.actions}>
          <AnimatedPressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
            <Text style={styles.ghostText}>Cancel</Text>
          </AnimatedPressable>
          <AnimatedPressable
            disabled={blocked}
            onPress={() => onSubmit(trimmed)}
            style={[styles.btn, styles.btnSolid, blocked && { opacity: 0.4 }]}
          >
            <Text style={styles.solidText}>{value.confirmLabel || 'Send'}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  input: {
    marginTop: spacing.md, minHeight: 84, maxHeight: 160, backgroundColor: colors.gray[100], borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none',
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  btn: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.gray[100] },
  btnSolid: { backgroundColor: colors.brand[600] },
  ghostText: { fontWeight: '600', color: colors.gray[700], fontSize: fontSize.base },
  solidText: { fontWeight: '700', color: '#fff', fontSize: fontSize.base },
});
