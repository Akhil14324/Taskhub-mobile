import { useMemo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { spacing, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { Card } from './UI';
import useFeature from '../hooks/useFeature';
import { FEATURES } from '../utils/features';
import { useAuth } from '../context/AuthContext';

/**
 * One switch for every feature, so each person decides what their TaskHub shows. Only this account
 * changes; it follows you to another device.
 */
export default function FeaturesCard() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { on, setFeature } = useFeature();
  const { updatePreferences } = useAuth();
  const groups = [...new Set(FEATURES.map((f) => f.group))];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="toggle-outline" size={18} color={colors.gray[400]} />
        <Text style={styles.title}>Features</Text>
      </View>
      <Text style={styles.note}>Turn off whatever you do not want. This only changes TaskHub for you.</Text>

      {groups.map((group) => (
        <View key={group}>
          <Text style={styles.group}>{group}</Text>
          {FEATURES.filter((f) => f.group === group).map((f) => (
            <View key={f.key} style={styles.row}>
              <Ionicons name={f.icon} size={18} color={colors.gray[500]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{f.label}</Text>
                <Text style={styles.hint}>{f.hint}</Text>
              </View>
              <Switch
                value={on(f.key)}
                onValueChange={(v) => setFeature(f.key, v)}
                trackColor={{ true: colors.brand[600], false: colors.gray[300] }}
                thumbColor="#fff"
                activeThumbColor="#fff"
              />
            </View>
          ))}
        </View>
      ))}

      <AnimatedPressable onPress={() => updatePreferences({ features: {} })} style={styles.reset}>
        <Text style={styles.resetText}>Reset all to the defaults</Text>
      </AnimatedPressable>
    </Card>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] },
  note: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2, marginBottom: spacing.sm },
  group: { fontSize: fontSize.xs || 12, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  hint: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 1 },
  reset: { alignSelf: 'flex-start', paddingVertical: spacing.sm, marginTop: spacing.sm },
  resetText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.brand[600] },
});
