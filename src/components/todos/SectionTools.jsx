import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { PickerSheet } from './Pickers';
import { showToast, confirmDialog } from '../../utils/events';

/** Name and description of a section. value = { id?, list_id?, position?, name, description? } */
export function SectionEditorSheet({ value, onClose, onSave }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (value) {
      setName(value.name || '');
      setDescription(value.description || '');
    }
  }, [value]);
  if (!value) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  const canSave = !!name.trim();
  return (
    <BottomSheet visible onClose={onClose} maxHeight={420} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm }}>
        <Text style={styles.heading}>{value.id ? 'Edit section' : 'New section'}</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => canSave && onSave({ ...value, name: name.trim(), description: description.trim() })}
          placeholder="e.g. In progress"
          placeholderTextColor={colors.gray[400]}
          {...glass('inset')}
          style={styles.input}
        />
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What goes in this section?"
          placeholderTextColor={colors.gray[400]}
          {...glass('inset')}
          style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
          multiline
        />
        <AnimatedPressable
          disabled={!canSave}
          onPress={() => onSave({ ...value, name: name.trim(), description: description.trim() })}
          haptic="medium"
          {...glass('accent')}
          style={[styles.saveBtn, { opacity: canSave ? 1 : 0.4 }]}
        >
          <Text style={styles.saveText}>Save</Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}

/**
 * The three-dots menu of a section: edit, move left / right, add a to-do, duplicate, move to a business,
 * archive (or bring back) and delete. `siblings` are the sections of the same board in order.
 */
export function SectionMenu({ section, siblings, items = [], onEdit, onAddTodo, onClose }) {
  const { duplicateSection, updateSection, deleteSection, reorderSections, businesses, moveToBusiness } = useTodos();
  const [pickBusiness, setPickBusiness] = useState(false);
  const keepOpen = useRef(false); // choosing "Move to a business" closes the first menu but not this component
  if (!section) return null;
  const index = siblings.findIndex((s) => s.id === section.id);

  const run = async (fn, errorText) => {
    try { await fn(); } catch (err) { showToast({ message: err.response?.data?.error || errorText, tone: 'error' }); }
  };

  const options = [
    { key: 'edit', label: 'Edit', icon: 'create-outline' },
    onAddTodo && { key: 'add', label: 'Add a to-do here', icon: 'add-circle-outline' },
    index > 0 && { key: 'left', label: 'Move earlier', icon: 'arrow-up-outline' },
    index >= 0 && index < siblings.length - 1 && { key: 'right', label: 'Move later', icon: 'arrow-down-outline' },
    { key: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
    businesses.length > 0 && items.length > 0 && { key: 'business', label: 'Move to a business', icon: 'briefcase-outline' },
    { key: 'archive', label: section.archived ? 'Bring back' : 'Archive', icon: section.archived ? 'arrow-undo-outline' : 'archive-outline' },
    { key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
  ].filter(Boolean);

  const onPick = (key) => {
    if (key === 'edit') onEdit(section);
    else if (key === 'add') onAddTodo(section);
    else if (key === 'left' || key === 'right') {
      const ids = siblings.map((s) => s.id);
      const to = key === 'left' ? index - 1 : index + 1;
      [ids[index], ids[to]] = [ids[to], ids[index]];
      run(() => reorderSections(ids), 'Could not move it');
    } else if (key === 'duplicate') run(() => duplicateSection(section.id), 'Could not duplicate it');
    else if (key === 'business') { keepOpen.current = true; setPickBusiness(true); }
    else if (key === 'archive') {
      run(async () => {
        await updateSection(section.id, { archived: !section.archived });
        showToast({ message: section.archived ? 'Section is back' : 'Section archived. Find it at the bottom of the page', icon: 'archive' });
      }, 'Could not archive it');
    } else if (key === 'delete') {
      confirmDialog({
        title: `Delete “${section.name}”?`,
        message: 'Its to-dos stay where they are, without a section.',
        confirmLabel: 'Delete',
        destructive: true,
      }).then((ok) => ok && run(() => deleteSection(section.id), 'Could not delete it'));
    }
  };

  return (
    <>
      <PickerSheet
        visible={!pickBusiness}
        onClose={() => { if (keepOpen.current) { keepOpen.current = false; return; } onClose(); }}
        title={section.name}
        options={options}
        onPick={onPick}
      />
      <PickerSheet
        visible={pickBusiness}
        onClose={() => { setPickBusiness(false); onClose(); }}
        title={`Move ${items.length} to-do${items.length === 1 ? '' : 's'} to`}
        options={businesses.map((b) => ({ key: b.id, label: b.can_manage ? b.name : `${b.name} (sent as proposals)`, icon: 'briefcase-outline' }))}
        onPick={(id) => run(async () => {
          for (const t of items) {
            // eslint-disable-next-line no-await-in-loop
            await moveToBusiness(t, id);
          }
        }, 'Could not move them')}
      />
    </>
  );
}

/** The thin "Add section" line that sits between two sections. It is faint until the pointer is over it. */
export function AddSectionLine({ onPress }) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <AnimatedPressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityLabel="Add a section here"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 26, opacity: hover ? 1 : 0.45 }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: hover ? colors.brand[400] : colors.gray[300] }} />
      <Ionicons name="add" size={14} color={hover ? colors.brand[600] : colors.gray[500]} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: hover ? colors.brand[600] : colors.gray[500] }}>Add section</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: hover ? colors.brand[400] : colors.gray[300] }} />
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heading: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.sm },
  label: { fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.md, marginBottom: 6 },
  input: {
    backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none',
  },
  saveBtn: { marginTop: spacing.lg, marginBottom: spacing.md, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600] },
  saveText: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});
