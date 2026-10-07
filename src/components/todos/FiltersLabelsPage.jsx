import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import { BUILTIN_FILTERS, applyFilter, describeFilter } from '../../utils/todoMeta';
import { todayYmd } from '../../utils/dates';

function Row({ icon, label, hint, count, onPress, onEdit, last }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      water
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
      ]}
    >
      <Ionicons name={icon} size={19} color={colors.brand[600]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: '500', color: colors.gray[900] }} numberOfLines={1}>{label}</Text>
        {!!hint && <Text style={{ fontSize: fontSize.xs, color: colors.gray[500], marginTop: 1 }} numberOfLines={1}>{hint}</Text>}
      </View>
      {count > 0 && <Text style={{ fontSize: fontSize.sm, color: colors.gray[400] }}>{count}</Text>}
      {onEdit && (
        <AnimatedPressable onPress={onEdit} hitSlop={8} accessibilityLabel={`Edit ${label}`}>
          <Ionicons name="create-outline" size={17} color={colors.gray[400]} />
        </AnimatedPressable>
      )}
    </AnimatedPressable>
  );
}

/**
 * Todoist's "Filters & Labels" page: the people views, the built-in and saved filters, and every
 * label, each opening as a view of the To-do screen.
 */
export default function FiltersLabelsPage({ counts, onPick, onEdit, onNew }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, filters, labels, lists } = useTodos();
  const [showFilters, setShowFilters] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const today = todayYmd();
  const open = useMemo(() => todos.filter((t) => !t.is_done), [todos]);
  const countOf = (config) => applyFilter(open, config, { userId: user?.id, today }).length;

  const heading = (label, isOpen, setOpen, onAdd) => (
    <View style={styles.heading}>
      <Text style={styles.headingText}>{label}</Text>
      {onAdd && (
        <AnimatedPressable onPress={onAdd} hitSlop={10} accessibilityLabel={`New ${label.toLowerCase().replace(/s$/, '')}`}>
          <Ionicons name="add" size={20} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
      <AnimatedPressable onPress={() => setOpen((v) => !v)} hitSlop={10} accessibilityLabel={isOpen ? 'Collapse' : 'Expand'}>
        <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={17} color={colors.gray[500]} />
      </AnimatedPressable>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View {...glass('card')} style={styles.group}>
        <Row icon="person-add-outline" label="Assigned to me" count={counts.assigned} onPress={() => onPick('assigned')} />
        <Row icon="people-outline" label="Shared with me" count={counts.shared} onPress={() => onPick('shared')} last />
      </View>

      {heading('Filters', showFilters, setShowFilters, onNew)}
      {showFilters && (
        <View {...glass('card')} style={styles.group}>
          {BUILTIN_FILTERS.map((f, i) => (
            <Row key={f.id} icon={`${f.icon}-outline`} label={f.name} count={countOf(f.config)} onPress={() => onPick(`filter:${f.id}`)} last={!filters.length && i === BUILTIN_FILTERS.length - 1} />
          ))}
          {filters.map((f, i) => (
            <Row
              key={f.id}
              icon="funnel-outline"
              label={f.name}
              hint={describeFilter(f.config, lists)}
              count={countOf(f.config)}
              onPress={() => onPick(`filter:${f.id}`)}
              onEdit={() => onEdit(f)}
              last={i === filters.length - 1}
            />
          ))}
        </View>
      )}

      {heading('Labels', showLabels, setShowLabels)}
      {showLabels && (labels.length ? (
        <View {...glass('card')} style={styles.group}>
          {labels.map((l, i) => (
            <Row key={l.name} icon="pricetag-outline" label={l.name} count={l.count} onPress={() => onPick(`label:${l.name}`)} last={i === labels.length - 1} />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No labels yet. Type +name when adding a task, e.g. “Pay rent +finance”.</Text>
      ))}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { maxWidth: 820, width: '100%', paddingTop: spacing.sm },
  group: {
    borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  headingText: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.gray[700] },
  empty: { fontSize: fontSize.sm, color: colors.gray[500], paddingHorizontal: spacing.xs, lineHeight: 19 },
});
