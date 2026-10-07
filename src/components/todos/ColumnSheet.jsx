import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Chip } from '../kit';
import { glass } from '../../theme/glass';
import { BUCKET_BASES } from '../../utils/boardBuckets';

/**
 * Edits one board column: a section (kind 'section') or a status bucket (kind 'bucket').
 * value = { kind, id?, name, base?, ... }. A new column (no id) also picks where it goes: onSave gets
 * `afterId` = '__start', null (the end) or the id of the column it goes after.
 * places = [{ id, name }] the board's current columns, in order.
 */
export default function ColumnSheet({ value, places, lockBase, canDelete = true, onClose, onSave, onDelete, onMove }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [base, setBase] = useState('todo');
  const [afterId, setAfterId] = useState(null);
  useEffect(() => {
    if (value) {
      setName(value.name || '');
      setBase(value.base || 'todo');
      setAfterId(null);
    }
  }, [value]);
  if (!value) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const isNew = !value.id;
  const isBucket = value.kind === 'bucket';
  const index = places.findIndex((p) => p.id === value.id);
  const label = isBucket ? 'column' : 'section';
  const save = () => name.trim() && onSave({ ...value, name: name.trim(), base, afterId });

  return (
    <BottomSheet visible onClose={onClose} maxHeight={560} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: spacing.sm }}>
          <Text style={styles.heading}>{isNew ? `New ${label}` : `Edit ${label}`}</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={save}
            placeholder={isBucket ? 'Column name, e.g. In review' : 'Section name, e.g. This week'}
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')}
            style={styles.input}
          />

          {isBucket && !lockBase && (
            <>
              <Text style={styles.label}>Moving a card here marks it as</Text>
              <View style={styles.chips}>
                {BUCKET_BASES.map((b) => (
                  <Chip key={b.key} label={b.label} active={base === b.key} onPress={() => setBase(b.key)} />
                ))}
              </View>
            </>
          )}

          {isNew && places.length > 0 && (
            <>
              <Text style={styles.label}>Place it</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Chip label="First" active={afterId === '__start'} onPress={() => setAfterId('__start')} />
                {places.map((p) => (
                  <Chip key={p.id} label={`After ${p.name}`} active={afterId === p.id} onPress={() => setAfterId(p.id)} />
                ))}
                <Chip label="Last" active={afterId === null} onPress={() => setAfterId(null)} />
              </ScrollView>
            </>
          )}

          {!isNew && onMove && (
            <View style={styles.moveRow}>
              <AnimatedPressable
                disabled={index <= 0}
                onPress={() => onMove(value, -1)}
                {...glass('inset')}
                style={[styles.moveBtn, index <= 0 && { opacity: 0.35 }]}
              >
                <Ionicons name="arrow-back" size={18} color={colors.gray[700]} />
                <Text style={styles.moveText}>Move left</Text>
              </AnimatedPressable>
              <AnimatedPressable
                disabled={index < 0 || index >= places.length - 1}
                onPress={() => onMove(value, 1)}
                {...glass('inset')}
                style={[styles.moveBtn, (index < 0 || index >= places.length - 1) && { opacity: 0.35 }]}
              >
                <Text style={styles.moveText}>Move right</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.gray[700]} />
              </AnimatedPressable>
            </View>
          )}

          <View style={styles.actions}>
            {!isNew && canDelete && onDelete && (
              <AnimatedPressable onPress={() => onDelete(value)} {...glass('inset')} style={styles.deleteBtn} haptic="light">
                <Ionicons name="trash-outline" size={20} color={colors.red[600]} />
              </AnimatedPressable>
            )}
            <AnimatedPressable
              disabled={!name.trim()}
              onPress={save}
              haptic="medium"
              {...glass('accent')}
              style={[styles.saveBtn, { opacity: name.trim() ? 1 : 0.4 }]}
            >
              <Text style={styles.saveText}>Save</Text>
            </AnimatedPressable>
          </View>
        </View>
      </ScrollView>
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
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moveRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  moveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: radius.lg, backgroundColor: colors.gray[100],
  },
  moveText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[700] },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  deleteBtn: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.red[50] },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600] },
  saveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
