import { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { SHORTCUT_GROUPS } from '../hooks/useShortcuts';

function Key({ children }) {
  const colors = useColors();
  return (
    <View style={{
      minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignItems: 'center',
      backgroundColor: colors.gray[100], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[300],
    }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[700] }}>{children}</Text>
    </View>
  );
}

/** Desktop: the list of keyboard shortcuts, opened with "?". */
export default function ShortcutsSheet({ visible, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>Keyboard shortcuts</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.gray[500]} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {SHORTCUT_GROUPS.map((group) => (
              <View key={group.title} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.items.map((item) => (
                  <View key={item.label} style={styles.row}>
                    <Text style={styles.label}>{item.label}</Text>
                    <View style={styles.keys}>
                      {item.keys.map((k, i) => (
                        <View key={k} style={styles.keys}>
                          {i > 0 && <Text style={styles.then}>then</Text>}
                          <Key>{k}</Key>
                        </View>
                      ))}
                      {item.altKeys?.map((k) => (
                        <View key={k} style={styles.keys}>
                          <Text style={styles.then}>/</Text>
                          <Key>{k}</Key>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%', maxWidth: 560, maxHeight: '86%', backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900] },
  body: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: 2 },
  groupTitle: { fontSize: 11, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: fontSize.base, color: colors.gray[800] },
  keys: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  then: { fontSize: 11, color: colors.gray[400] },
});
