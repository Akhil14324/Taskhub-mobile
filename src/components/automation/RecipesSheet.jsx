import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { showToast } from '../../utils/events';
import { useCatalog } from './meta';

/** Ready-made automations: one tap adds the profile and its tasks, switched on, ready to change. */
export default function RecipesSheet({ visible, onClose, onAdded }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { catalog } = useCatalog();
  const [busy, setBusy] = useState(null);

  const add = async (recipe) => {
    setBusy(recipe.id);
    try {
      const res = await api.post(`/automation/recipes/${recipe.id}/add`);
      showToast({ message: `Added "${recipe.title}"`, icon: 'checkmark-circle' });
      onAdded?.(res.data.profile);
      onClose();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add it', icon: 'alert-circle' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={700}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Ready-made automations</Text>
        <Text style={styles.sub}>Add one with a tap. You can open it afterwards and change anything.</Text>
        {(catalog?.recipes || []).map((r) => (
          <AnimatedPressable key={r.id} onPress={() => add(r)} disabled={busy === r.id} style={styles.card} {...glass('inset')}>
            <View style={styles.icon}><Ionicons name={r.icon} size={20} color={colors.brand[600]} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{r.title}</Text>
              <Text style={styles.desc}>{r.description}</Text>
            </View>
            <Ionicons name={busy === r.id ? 'hourglass-outline' : 'add-circle'} size={24} color={colors.brand[600]} />
          </AnimatedPressable>
        ))}
        {!catalog && <Text style={styles.sub}>Loading...</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 8 },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  sub: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 16 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[100] },
  name: { fontSize: fontSize.base, fontWeight: '800', color: colors.gray[900] },
  desc: { fontSize: fontSize.xs, color: colors.gray[600], lineHeight: 17, marginTop: 2 },
});
