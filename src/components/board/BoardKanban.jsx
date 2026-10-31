import { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { ItemCard } from './BoardCards';
import { statusLabelOf, paletteHex, paletteInk } from './model';
import { makeDraggable } from '../../hooks/useWebReorder';
import Hint from './Hint';
import { mayEdit } from './CellEditorHost';
import { anchorOf } from './Popover';

const DROP_OUTLINE = '2px dashed #0073ea';

/**
 * Kanban: one column per label of the board's status column (top-level tasks only). On a computer, drag a
 * card into another column to change its status; on a touch screen the arrows button on a card picks the column.
 * The move goes through the same rules as the status cell (a finished task is ticked, "Stuck" asks why on the table).
 */
export default function BoardKanban({ board, items, people, onOpenItem, onOpenCell, onMove, onSetValue }) {
  const colors = useColors();
  const rootRef = useRef(null);
  const statusCol = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
  const lanes = useMemo(() => {
    if (!statusCol) return [];
    const top = items.filter((t) => !t.parent_id);
    return (statusCol.labels || []).map((l) => ({
      label: l,
      items: top.filter((t) => statusLabelOf(t, statusCol, board.values)?.id === l.id),
    }));
  }, [items, statusCol, board.values]);

  // Latest data for the DOM listeners, which are attached once.
  const live = useRef({});
  live.current = { statusCol, items, onMove, onSetValue, lanes };

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;
    let dragId = null;
    let hover = null;
    const cardOf = (el) => (el && el.closest ? el.closest('[data-board-card]') : null);
    const colOf = (el) => (el && el.closest ? el.closest('[data-board-col]') : null);
    const clear = () => { if (hover) { hover.style.outline = ''; hover.style.outlineOffset = ''; } hover = null; };
    const onDragStart = (e) => {
      const card = cardOf(e.target);
      if (!card) return;
      dragId = Number(card.dataset.boardCard);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
      card.style.opacity = '0.45';
    };
    const onDragOver = (e) => {
      if (dragId == null) return;
      const col = colOf(e.target);
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (hover !== col) { clear(); hover = col; col.style.outline = DROP_OUTLINE; col.style.outlineOffset = '-2px'; }
    };
    const onDrop = (e) => {
      if (dragId == null) return;
      const col = colOf(e.target);
      clear();
      if (!col) return;
      e.preventDefault();
      const { statusCol: sc, items: all, onMove: move, onSetValue: setValue, lanes: ls } = live.current;
      const item = all.find((t) => t.id === dragId);
      const lane = ls.find((l) => String(l.label.id) === col.dataset.boardCol);
      dragId = null;
      if (!item || !lane || !sc) return;
      if (lane.items.some((t) => t.id === item.id)) return; // dropped where it already is
      if (!mayEdit(item, sc)) { return; }
      if (sc.system_key === 'status') move?.(item, lane.label.maps_to);
      else setValue?.(item, sc, { label_id: lane.label.id });
    };
    const onDragEnd = (e) => {
      const card = cardOf(e.target);
      if (card) card.style.opacity = '';
      clear();
      dragId = null;
    };
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);
    return () => {
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  if (!statusCol) {
    return <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>Add a Status column to see this board as a Kanban.</Text>;
  }

  return (
    <View ref={rootRef} style={{ flex: 1 }}>
      <ScrollView horizontal contentContainerStyle={{ padding: spacing.md, gap: spacing.md, alignItems: 'flex-start' }} style={{ flex: 1 }}>
        {lanes.map(({ label, items: laneItems }) => (
          <View
            key={label.id}
            dataSet={{ boardCol: String(label.id) }}
            style={{ width: 290, backgroundColor: colors.gray[100], borderRadius: radius.lg, padding: spacing.sm, gap: spacing.sm, maxHeight: '100%' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: paletteHex(label.color), borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6 }}>
              <Text style={{ color: paletteInk(label.color), fontWeight: '600' }}>{label.label}</Text>
              <Text style={{ color: paletteInk(label.color) }}>{laneItems.length}</Text>
            </View>
            <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ gap: spacing.sm, minHeight: 60 }}>
              {laneItems.map((t) => (
                <View key={t.id} ref={mayEdit(t, statusCol) ? makeDraggable : undefined} dataSet={{ boardCard: String(t.id) }}>
                  <ItemCard item={t} board={board} people={people} groupColor={label.color} showStatus={false} onOpenItem={onOpenItem} onOpenCell={onOpenCell} />
                  {mayEdit(t, statusCol) && (
                    <Pressable
                      onPress={(e) => onOpenCell(anchorOf(e), t, statusCol)}
                      accessibilityLabel="Move to another column"
                      style={{ position: 'absolute', right: 8, bottom: 8, padding: 2 }}
                    >
                      <Ionicons name="swap-horizontal" size={15} color={colors.gray[500]} />
                    </Pressable>
                  )}
                </View>
              ))}
              {!laneItems.length && <Text style={{ color: colors.gray[500], fontSize: 13, textAlign: 'center', paddingVertical: spacing.md }}>Drop a task here</Text>}
            </ScrollView>
          </View>
        ))}
        <View style={{ paddingTop: 8 }}>
          <Hint text="Each column is a status. Drag a card into another column to change its status, or tap the arrows on a card." size={17} />
        </View>
      </ScrollView>
    </View>
  );
}
