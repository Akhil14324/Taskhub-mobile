import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { glass } from '../../theme/glass';

/**
 * Generic "choose one" sheet. options = [{ key, label, icon?, active?, destructive? }]
 */
export function PickerSheet({ visible, onClose, title, options, onPick }) {
  const colors = useColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={560}>
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        {!!title && (
          <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], paddingHorizontal: spacing.sm, marginBottom: spacing.sm }}>
            {title}
          </Text>
        )}
        {options.map((o) => (
          <AnimatedPressable
            key={String(o.key)}
            haptic="light"
            onPress={() => { onPick(o.key); onClose(); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 13, paddingHorizontal: spacing.sm }}
          >
            {!!o.icon && <Ionicons name={o.icon} size={20} color={o.destructive ? colors.red[600] : colors.gray[600]} />}
            <Text style={{ flex: 1, fontSize: fontSize.base, color: o.destructive ? colors.red[600] : colors.gray[900], fontWeight: o.active ? '700' : '500' }}>
              {o.label}
            </Text>
            {o.active && <Ionicons name="checkmark" size={20} color={colors.brand[600]} />}
          </AnimatedPressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** One-line name editor (sections, …). value = { id?, name } */
export function NameSheet({ value, title, placeholder, onClose, onSave, onDelete }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  useEffect(() => { if (value) setName(value.name || ''); }, [value]);
  if (!value) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  return (
    <BottomSheet visible={!!value} onClose={onClose} maxHeight={320} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm }}>
        <Text style={styles.heading}>{title}</Text>
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => name.trim() && onSave({ ...value, name: name.trim() })}
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          {...glass('inset')} style={styles.input}
        />
        <View style={styles.actions}>
          {!!value.id && onDelete && (
            <AnimatedPressable onPress={() => onDelete(value)} {...glass('inset')} style={styles.deleteBtn} haptic="light">
              <Ionicons name="trash-outline" size={20} color={colors.red[600]} />
            </AnimatedPressable>
          )}
          <AnimatedPressable
            disabled={!name.trim()}
            onPress={() => onSave({ ...value, name: name.trim() })}
            haptic="medium"
            {...glass('accent')} style={[styles.saveBtn, { opacity: name.trim() ? 1 : 0.4 }]}
          >
            <Text style={styles.saveText}>Save</Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heading: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.md },
  input: {
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  deleteBtn: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.red[50] },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600] },
  saveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
