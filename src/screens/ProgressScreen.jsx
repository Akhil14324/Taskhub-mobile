import { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { spacing } from '../theme/theme';
import BackTitle from '../components/BackTitle';
import { Chip } from '../components/kit';
import useIsDesktop from '../hooks/useBreakpoint';
import MyDayScreen from './MyDayScreen';
import StandupScreen from './StandupScreen';
import WinsScreen from './WinsScreen';
import GoalsScreen from './GoalsScreen';

const TABS = [
  { key: 'today', label: 'Today', icon: 'sunny', Component: MyDayScreen },
  { key: 'standup', label: 'Stand-up', icon: 'megaphone', Component: StandupScreen },
  { key: 'wins', label: 'Wins', icon: 'trophy', Component: WinsScreen },
  { key: 'goals', label: 'Goals', icon: 'flag', Component: GoalsScreen },
];

/**
 * One place for everything about how the work is going: today, the daily stand-up, wins and badges, and goals.
 * It replaces four separate pages; each tab is the same screen as before, shown without its own header.
 * `route.params.tab` opens a given tab (used by notification links).
 */
export default function ProgressScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const route = useRoute();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState(TABS.some((t) => t.key === route.params?.tab) ? route.params.tab : 'today');
  const active = TABS.find((t) => t.key === tab) || TABS[0];
  const Body = active.Component;

  return (
    <View style={[styles.container, { paddingTop: desktop ? spacing.lg : insets.top }]}>
      <View style={styles.header}>
        <BackTitle title="Progress" style={styles.title} />
      </View>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Chip key={t.key} icon={t.icon} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Body embedded />
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
