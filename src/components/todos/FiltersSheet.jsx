import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Chip, PRIORITY } from '../kit';
import { todayYmd } from '../../utils/dates';
import {
  BUILTIN_FILTERS, FILTER_DEFAULT, FILTER_DUE_OPTIONS, FILTER_ASSIGNED_OPTIONS, applyFilter, describeFilter,
} from '../../utils/todoMeta';

/** Filters & labels: built-in views, my saved filters and every label in use. */
export default function FiltersSheet({ visible, onClose, onPick, onEdit }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, filters, labels, lists } = useTodos();
  const today = todayYmd();
  const countOf = (config) => applyFilter(todos, config, { userId: user?.id, today }).length;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640}>
      <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Filters</Text>
        {BUILTIN_FILTERS.map((f) => (
          <Row key={f.id} icon={f.icon} title={f.name} count={countOf(f.config)} onPress={() => onPick(`filter:${f.id}`)} />
        ))}
        {filters.map((f) => (
          <Row
            key={f.id}
            icon="funnel"
            title={f.name}
            hint={describeFilter(f.config, lists)}
            count={countOf(f.config)}
            onPress={() => onPick(`filter:${f.id}`)}
            onEdit={() => onEdit(f)}
          />
        ))}
        <AnimatedPressable style={styles.newRow} onPress={() => onEdit({ name: '', config: { ...FILTER_DEFAULT } })} haptic="light">
          <Ionicons name="add-circle" size={22} color={colors.brand[600]} />
          <Text style={styles.newText}>New filter</Text>
        </AnimatedPressable>

        <Text style={[styles.heading, { marginTop: spacing.lg }]}>Labels</Text>
        {labels.length === 0 ? (
          <Text style={styles.empty}>No labels yet. Type +name when adding a to-do, e.g. “Pay rent +finance”.</Text>
        ) : (
          <View style={styles.labelWrap}>
            {labels.map((l) => (
              <Chip key={l.name} icon="pricetag" label={`${l.name}${l.count ? ` · ${l.count}` : ''}`} onPress={() => onPick(`label:${l.name}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function Row({ icon, title, hint, count, onPress, onEdit }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.sm }}
    >
      <Ionicons name={icon} size={20} color={colors.brand[600]} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
        {!!hint && <Text style={{ fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 }} numberOfLines={1}>{hint}</Text>}
      </View>
      <Text style={{ fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '600' }}>{count}</Text>
      {onEdit && (
        <AnimatedPressable onPress={onEdit} hitSlop={8} haptic="light">
          <Ionicons name="create-outline" size={18} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </AnimatedPressable>
  );
}

/** Create / edit one saved filter. value = { id?, name, config } */
export function FilterEditorSheet({ value, onClose, onSave, onDelete }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { lists, labels } = useTodos();
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (value) setDraft(value); }, [value]);
  const config = { ...FILTER_DEFAULT, ...(draft?.config || {}) };
  const setConfig = (patch) => setDraft((d) => ({ ...d, config: { ...FILTER_DEFAULT, ...(d.config || {}), ...patch } }));
  const toggle = (key, item) => setConfig({ [key]: config[key].includes(item) ? config[key].filter((x) => x !== item) : [...config[key], item] });

  if (!draft) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  return (
    <BottomSheet visible={!!value} onClose={onClose} maxHeight={720} avoidKeyboard>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>{draft.id ? 'Edit filter' : 'New filter'}</Text>
        <TextInput
          autoFocus={!draft.id}
          value={draft.name}
          onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
          placeholder="Filter name, e.g. Urgent finance"
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
        />

        <Text style={styles.label}>Due</Text>
        <View style={styles.chipRow}>
          {FILTER_DUE_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} active={config.due === o.key} onPress={() => setConfig({ due: o.key })} />
          ))}
        </View>

        <Text style={styles.label}>Priority (any of)</Text>
        <View style={styles.chipRow}>
          {[1, 2, 3, 4].map((p) => (
            <Chip key={p} icon="flag" color={PRIORITY[p].color} label={PRIORITY[p].short} active={config.priorities.includes(p)} onPress={() => toggle('priorities', p)} />
          ))}
        </View>

        <Text style={styles.label}>Who</Text>
        <View style={styles.chipRow}>
          {FILTER_ASSIGNED_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} active={config.assigned === o.key} onPress={() => setConfig({ assigned: o.key })} />
          ))}
        </View>

        <Text style={styles.label}>List</Text>
        <View style={styles.chipRow}>
          <Chip label="Any" active={config.list_id === null} onPress={() => setConfig({ list_id: null })} />
          <Chip icon="file-tray" label="Inbox" active={config.list_id === 'inbox'} onPress={() => setConfig({ list_id: 'inbox' })} />
          {lists.map((l) => (
            <Chip key={l.id} icon="albums-outline" label={l.name} active={config.list_id === l.id} onPress={() => setConfig({ list_id: l.id })} />
          ))}
        </View>

        {labels.length > 0 && (
          <>
            <Text style={styles.label}>Labels (any of)</Text>
            <View style={styles.chipRow}>
              {labels.map((l) => (
                <Chip key={l.name} icon="pricetag-outline" label={l.name} active={config.labels.includes(l.name)} onPress={() => toggle('labels', l.name)} />
              ))}
            </View>
          </>
        )}

        <View style={styles.actions}>
          {draft.id && (
            <AnimatedPressable onPress={() => onDelete(draft)} style={styles.deleteBtn} haptic="light">
              <Ionicons name="trash-outline" size={20} color={colors.red[600]} />
            </AnimatedPressable>
          )}
          <AnimatedPressable
            disabled={!draft.name?.trim()}
            onPress={() => onSave({ ...draft, name: draft.name.trim(), config })}
            haptic="medium"
            style={[styles.saveBtn, { opacity: draft.name?.trim() ? 1 : 0.4 }]}
          >
            <Text style={styles.saveText}>{draft.id ? 'Save' : 'Create filter'}</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  heading: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.sm },
  newText: { fontSize: fontSize.base, fontWeight: '600', color: colors.brand[600] },
  empty: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.sm, paddingBottom: spacing.md, lineHeight: 19 },
  labelWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  input: {
    marginHorizontal: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md, paddingHorizontal: spacing.sm },
  deleteBtn: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.red[50] },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center', backgroundColor: colors.brand[600] },
  saveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
