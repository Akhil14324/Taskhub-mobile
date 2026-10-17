import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';

/**
 * Choose what a profile listens for, or what a task does, from the catalog. Items are grouped
 * (Time, To-dos, Messages...) and searchable; the closing items of a block (End if) are hidden
 * because adding "If" adds its "End if" for you.
 */
export default function TypePicker({ visible, onClose, title, items, onPick, hideTypes = [] }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const shown = (items || []).filter((i) => !hideTypes.includes(i.type) && (!s || `${i.label} ${i.hint || ''} ${i.group}`.toLowerCase().includes(s)));
    const out = [];
    for (const it of shown) {
      let g = out.find((x) => x.name === it.group);
      if (!g) { g = { name: it.group, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [items, q, hideTypes]);

  return (
    <BottomSheet visible={visible} onClose={() => { setQ(''); onClose(); }} avoidKeyboard maxHeight={680}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.search} />
        {groups.map((g) => (
          <View key={g.name}>
            <Text style={styles.group}>{g.name}</Text>
            {g.items.map((it) => (
              <AnimatedPressable key={it.type} onPress={() => { setQ(''); onPick(it); }} style={styles.row}>
                <View style={styles.icon}><Ionicons name={it.icon || 'ellipse-outline'} size={18} color={colors.brand[600]} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{it.label}</Text>
                  {!!it.hint && <Text style={styles.hint} numberOfLines={2}>{it.hint}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
              </AnimatedPressable>
            ))}
          </View>
        ))}
        {!groups.length && <Text style={styles.hint}>Nothing matches.</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.gray[900] },
  search: { marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100], fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  group: { marginTop: spacing.lg, marginBottom: 2, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[500] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[50] },
  label: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  hint: { fontSize: fontSize.xs, color: colors.gray[500], lineHeight: 16 },
});
