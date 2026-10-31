import { useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { ItemCard } from './BoardCards';
import { statusLabelOf, paletteHex, paletteInk } from './model';

import { mayEdit } from './CellEditorHost';
import { anchorOf } from './BoardTable';

/**
 * Kanban: one column per label of the board's status column (top-level items only). The arrows button on a
 * card picks its new column (dragging between columns comes with the views step, M7).
 */
export default function BoardKanban({ board, items, people, onOpenItem, onOpenCell }) {
  const colors = useColors();
  const statusCol = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
  const lanes = useMemo(() => {
    if (!statusCol) return [];
    const top = items.filter((t) => !t.parent_id);
    return (statusCol.labels || []).map((l) => ({
      label: l,
      items: top.filter((t) => statusLabelOf(t, statusCol, board.values)?.id === l.id),
    }));
  }, [items, statusCol, board.values]);

  if (!statusCol) {
    return <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>Add a Status column to see this board as a Kanban.</Text>;
  }

  return (
    <ScrollView horizontal contentContainerStyle={{ padding: spacing.md, gap: spacing.md, alignItems: 'flex-start' }}>
      {lanes.map(({ label, items: laneItems }) => (
        <View
          key={label.id}
          style={{ width: 290, backgroundColor: colors.gray[100], borderRadius: radius.lg, padding: spacing.sm, gap: spacing.sm, maxHeight: '100%' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: paletteHex(label.color), borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6 }}>
            <Text style={{ color: paletteInk(label.color), fontWeight: '600' }}>{label.label}</Text>
            <Text style={{ color: paletteInk(label.color) }}>{laneItems.length}</Text>
          </View>
          <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ gap: spacing.sm }}>
            {laneItems.map((t) => (
              <View key={t.id}>
                <ItemCard item={t} board={board} people={people} groupColor={label.color} showStatus={false} onOpenItem={onOpenItem} onOpenCell={onOpenCell} />
                {mayEdit(t, statusCol) && (
                  <Pressable
                    onPress={(e) => onOpenCell(anchorOf(e), t, statusCol)}
                    accessibilityLabel="Move to"
                    style={{ position: 'absolute', right: 8, bottom: 8, padding: 2 }}
                  >
                    <Ionicons name="swap-horizontal" size={15} color={colors.gray[500]} />
                  </Pressable>
                )}
              </View>
            ))}
            {!laneItems.length && <Text style={{ color: colors.gray[500], fontSize: 13, textAlign: 'center', paddingVertical: spacing.md }}>Nothing here</Text>}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}
