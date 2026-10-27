import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { Chip } from '../kit';
import { sprintTiming } from './ui';

/**
 * One line above a business's list: the sprint that is running, and a way to narrow the list to it or to the backlog.
 * Everything else about sprints lives in the Sprint tab.
 */
export default function SprintStrip({ list, filter, onFilter, onOpenSprint, filtersOpen, onToggleFilters, extra }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sprints = list?.sprints || [];
  const current = sprints.find((s) => s.status === 'active') || sprints.find((s) => s.status === 'planned') || null;
  const inSprint = filter?.kind === 'sprint' && current && filter.key === current.id;
  const inBacklog = filter?.kind === 'sprint' && filter.key === 'backlog';

  return (
    <View style={styles.wrap}>
      <AnimatedPressable onPress={onOpenSprint} style={styles.summary} accessibilityLabel="Open the sprint">
        <Ionicons name="speedometer-outline" size={16} color={colors.brand[600]} />
        {current ? (
          <Text style={styles.text} numberOfLines={1}>
            <Text style={styles.bold}>{current.name}</Text>
            {`  ${current.done_count} of ${current.task_count} done · ${sprintTiming(current)}`}
          </Text>
        ) : (
          <Text style={styles.text} numberOfLines={1}>No sprint running</Text>
        )}
        <Ionicons name="chevron-forward" size={14} color={colors.gray[400]} />
      </AnimatedPressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {!!extra && <Chip small icon="close" label={extra.label} active onPress={extra.onClear} />}
        <Chip small label="All work" active={!inSprint && !inBacklog && !extra} onPress={() => onFilter(null)} />
        {!!current && <Chip small label="This sprint" active={!!inSprint} onPress={() => onFilter({ kind: 'sprint', key: current.id })} />}
        <Chip small label="Backlog" active={inBacklog} onPress={() => onFilter({ kind: 'sprint', key: 'backlog' })} />
        <Chip small icon="options-outline" label="Filters" active={filtersOpen} onPress={onToggleFilters} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.gray[100],
  },
  text: { flex: 1, fontSize: fontSize.sm, color: colors.gray[700] },
  bold: { fontWeight: '800', color: colors.gray[900] },
  chips: { gap: spacing.sm, paddingVertical: 2 },
});
