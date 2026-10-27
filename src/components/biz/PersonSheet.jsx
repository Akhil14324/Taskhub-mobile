import { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import { Avatar } from '../kit';
import useDirectory from '../../hooks/useDirectory';
import { glass } from '../../theme/glass';

/** Choose one person from a business. `onPick(person)` gets the directory entry. */
export default function PersonSheet({ visible, onClose, businessId, title = 'Choose a person', excludeIds = [], onPick }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { people } = useDirectory();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const skip = new Set(excludeIds.map(Number));
    return people
      .filter((p) => (p.businesses || []).some((b) => b.id === businessId) && !skip.has(Number(p.id)))
      .filter((p) => !q || p.name?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q));
  }, [people, businessId, query, excludeIds]);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard maxHeight={560}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{title}</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.gray[400]} {...glass('inset')} style={styles.input} />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {list.map((p) => (
            <AnimatedPressable key={p.id} haptic="light" onPress={() => { onPick(p); onClose(); }} style={styles.row}>
              <Avatar name={p.name} uri={p.profile_picture} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.hint} numberOfLines={1}>@{p.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
            </AnimatedPressable>
          ))}
          {!list.length && <Text style={styles.hint}>Nobody else in this business.</Text>}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.gray[900] },
  input: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.gray[100], fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9 },
  name: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  hint: { fontSize: 11, color: colors.gray[500] },
});
