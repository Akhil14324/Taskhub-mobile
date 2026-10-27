import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { SlideGroup, SlideItem } from '../SlideGroup';

export const BIZ_TABS = [
  { key: 'work', label: 'Work', icon: 'list-outline' },
  { key: 'sprint', label: 'Sprint', icon: 'speedometer-outline' },
  { key: 'epics', label: 'Epics', icon: 'layers-outline' },
  { key: 'releases', label: 'Releases', icon: 'rocket-outline' },
  { key: 'time', label: 'Time', icon: 'timer-outline' },
  { key: 'reports', label: 'Reports', icon: 'stats-chart-outline' },
];

/** The business's workspace tabs. The selected one is a single highlight that slides, like every other tab bar here. */
export default function BizTabs({ value, onChange, badges = {} }) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.wrap}>
      <SlideGroup style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} pillStyle={{ borderRadius: radius.full }}>
        {BIZ_TABS.map((t) => {
          const active = value === t.key;
          return (
            <SlideItem key={t.key} active={active}>
              <AnimatedPressable onPress={() => onChange(t.key)} water style={styles.tab} accessibilityLabel={t.label}>
                <Ionicons name={t.icon} size={15} color={active ? colors.brand[700] : colors.brand[600]} />
                <Text style={{ fontSize: fontSize.sm, fontWeight: active ? '700' : '600', color: active ? colors.brand[700] : colors.gray[700] }}>{t.label}</Text>
                {badges[t.key] > 0 && <Text style={{ fontSize: 11, fontWeight: '800', color: colors.brand[600] }}>{badges[t.key]}</Text>}
              </AnimatedPressable>
            </SlideItem>
          );
        })}
      </SlideGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0 },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.full },
});
