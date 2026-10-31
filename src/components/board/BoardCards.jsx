import { memo, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { glass } from '../../theme/glass';
import { spacing, radius } from '../../theme/theme';
import { CellView } from './Cells';
import { groupBlocks, paletteHex, canEditColumn, statusLabelOf, cellValue } from './model';
import { mayEdit } from './CellEditorHost';
import { anchorOf } from './BoardTable';

/** Columns a card shows besides status, person and date: those marked "show on mobile", else the next two. */
export function cardColumns(columns) {
  const main = new Set(['status', 'person', 'date']);
  const marked = columns.filter((c) => c.settings?.show_on_mobile);
  const extra = marked.length ? marked : columns.filter((c) => !main.has(c.system_key) && c.kind !== 'long_text').slice(0, 2);
  return {
    status: columns.find((c) => c.system_key === 'status') || columns.find((c) => c.kind === 'status'),
    person: columns.find((c) => c.system_key === 'person'),
    date: columns.find((c) => c.system_key === 'date'),
    extra,
  };
}

/** One item as a card (phone list and Kanban). Tapping the card opens it; tapping a field edits that field. */
export const ItemCard = memo(function ItemCard({ item, board, people, onOpenItem, onOpenCell, groupColor, showStatus = true }) {
  const colors = useColors();
  const cols = useMemo(() => cardColumns(board.columns), [board.columns]);
  const tap = (column) => (e) => {
    if (canEditColumn(column) && mayEdit(item, column)) onOpenCell(anchorOf(e), item, column);
  };
  const status = showStatus && cols.status ? statusLabelOf(item, cols.status, board.values) : null;
  return (
    <Pressable
      {...glass('card')}
      onPress={() => onOpenItem(item.id)}
      accessibilityLabel={item.title}
      style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 8, borderLeftWidth: 4, borderLeftColor: paletteHex(groupColor) }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: item.is_done ? colors.gray[400] : colors.gray[900], textDecorationLine: item.is_done ? 'line-through' : 'none' }}>
          {item.title}
        </Text>
        {cols.person && (
          <Pressable onPress={tap(cols.person)} hitSlop={6}>
            <CellView item={item} column={cols.person} values={board.values} people={people} compact />
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {status && (
          <Pressable onPress={tap(cols.status)} hitSlop={4}>
            <CellView item={item} column={cols.status} values={board.values} people={people} compact />
          </Pressable>
        )}
        {cols.date && item.due_date && (
          <Pressable onPress={tap(cols.date)} hitSlop={4}>
            <CellView item={item} column={cols.date} values={board.values} people={people} compact />
          </Pressable>
        )}
        {cols.extra.filter((c) => { const v = cellValue(item, c, board.values); return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.every((x) => x === null)); }).map((c) => (
          <Pressable key={c.id} onPress={tap(c)} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 180 }}>
            <Text style={{ fontSize: 11, color: colors.gray[500] }}>{c.title}</Text>
            <CellView item={item} column={c} values={board.values} people={people} compact />
          </Pressable>
        ))}
        {item.subtask_count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="git-branch-outline" size={12} color={colors.gray[500]} />
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>{item.subtask_done_count}/{item.subtask_count}</Text>
          </View>
        )}
        {item.comment_count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="chatbubble-outline" size={12} color={colors.gray[500]} />
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>{item.comment_count}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

function AddLine({ word, onAdd }) {
  const colors = useColors();
  const [text, setText] = useState('');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[300] }}>
      <Ionicons name="add" size={18} color={colors.gray[500]} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={`Add ${word.toLowerCase()}`}
        placeholderTextColor={colors.gray[400]}
        onSubmitEditing={() => { if (text.trim()) { onAdd(text); setText(''); } }}
        blurOnSubmit={false}
        style={{ flex: 1, fontSize: 15, color: colors.gray[900], outlineStyle: 'none' }}
      />
    </View>
  );
}

/** The board on a phone: each group is a titled section of cards, collapsible, with an add line. */
export default function BoardCards({ board, items, people, collapsed, onToggleGroup, onOpenItem, onOpenCell, onAddItem, onAddGroup }) {
  const colors = useColors();
  const blocks = useMemo(() => groupBlocks(board.groups, items), [board.groups, items]);
  const word = board.board.item_word;
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 140, gap: spacing.lg }}>
      {blocks.map((b) => {
        const shut = collapsed.has(b.group.id);
        return (
          <View key={b.group.id ?? 'none'} style={{ gap: spacing.sm }}>
            <Pressable onPress={() => onToggleGroup(b.group.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
              <Ionicons name={shut ? 'chevron-forward' : 'chevron-down'} size={18} color={paletteHex(b.group.color)} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: b.group.color === 'grey' ? colors.gray[600] : paletteHex(b.group.color) }}>{b.group.name}</Text>
              <Text style={{ fontSize: 13, color: colors.gray[500] }}>{b.top.length}</Text>
            </Pressable>
            {!shut && b.top.map((t) => (
              <ItemCard key={t.id} item={t} board={board} people={people} groupColor={b.group.color} onOpenItem={onOpenItem} onOpenCell={onOpenCell} />
            ))}
            {!shut && board.access?.add && <AddLine word={word} onAdd={(title) => onAddItem(title, b.group.id)} />}
          </View>
        );
      })}
      {board.access?.add && (
        <Pressable onPress={onAddGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }}>
          <Ionicons name="add-circle-outline" size={18} color={colors.brand[600]} />
          <Text style={{ fontSize: 15, color: colors.brand[600], fontWeight: '500' }}>Add new group</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
