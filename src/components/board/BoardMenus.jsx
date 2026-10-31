import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Popover from './Popover';
import { TextEditor, PaletteGrid } from './Cells';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { confirmDialog } from '../../utils/events';

// Column types offered in "+ Add column", in the order people reach for them. Built-in ones (a to-do field)
// are listed separately and only while the board does not show them yet.
const COMMON = ['status', 'person', 'date', 'timeline', 'text', 'numbers', 'dropdown', 'tags', 'checkbox', 'long_text',
  'link', 'email', 'phone', 'rating', 'progress', 'color', 'location', 'country', 'hour', 'week'];
const BUILT_IN = ['priority', 'deadline', 'timeline', 'estimate', 'labels', 'created', 'updated', 'item_id', 'dependency', 'sprint', 'points', 'item_type'];

function MenuRow({ icon, label, onPress, danger, sub }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
    >
      <Ionicons name={icon} size={16} color={danger ? colors.red[600] : colors.gray[600]} />
      <Text style={{ flex: 1, fontSize: 14, color: danger ? colors.red[600] : colors.gray[800] }}>{label}</Text>
      {!!sub && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{sub}</Text>}
    </Pressable>
  );
}

export function AddColumnMenu({ anchor, catalog, columns, onPick, onClose }) {
  const colors = useColors();
  if (!catalog) return null;
  const shown = new Set(columns.map((c) => c.system_key).filter(Boolean));
  const builtIns = BUILT_IN.filter((k) => catalog.system_columns[k] && !shown.has(k));
  return (
    <Popover visible anchor={anchor} onClose={onClose} width={420}>
      <ScrollView style={{ maxHeight: 460 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], padding: spacing.xs }}>COLUMN TYPES</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {COMMON.filter((k) => catalog.kinds[k]).map((k) => (
            <Pressable
              key={k}
              onPress={() => { onPick({ kind: k, title: catalog.kinds[k].label }); onClose(); }}
              style={({ hovered }) => ({ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name={catalog.kinds[k].icon} size={17} color={colors.brand[600]} />
              <Text style={{ fontSize: 14, color: colors.gray[800] }}>{catalog.kinds[k].label}</Text>
            </Pressable>
          ))}
        </View>
        {builtIns.length > 0 && (
          <>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], padding: spacing.xs, marginTop: spacing.sm }}>FROM THE ITEM ITSELF</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {builtIns.map((k) => {
                const def = catalog.system_columns[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => { onPick({ system_key: k }); onClose(); }}
                    style={({ hovered }) => ({ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
                  >
                    <Ionicons name={catalog.kinds[def.kind]?.icon || 'ellipse-outline'} size={17} color={colors.gray[600]} />
                    <Text style={{ fontSize: 14, color: colors.gray[800] }}>{def.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </Popover>
  );
}

export function ColumnMenu({ anchor, column, columns, onRename, onRemove, onMove, onToggleMobile, onClose }) {
  const [renaming, setRenaming] = useState(false);
  const idx = columns.findIndex((c) => c.id === column.id);
  return (
    <Popover visible anchor={anchor} onClose={onClose} width={240}>
      {renaming ? (
        <TextEditor initial={column.title} placeholder="Column name" onDone={(t) => { if (t.trim()) onRename(t.trim()); onClose(); }} />
      ) : (
        <View>
          <MenuRow icon="create-outline" label="Rename" onPress={() => setRenaming(true)} />
          {idx > 0 && <MenuRow icon="arrow-back" label="Move left" onPress={() => { onMove(-1); onClose(); }} />}
          {idx < columns.length - 1 && <MenuRow icon="arrow-forward" label="Move right" onPress={() => { onMove(1); onClose(); }} />}
          <MenuRow icon="phone-portrait-outline" label={column.settings?.show_on_mobile ? 'Hide on phone cards' : 'Show on phone cards'} onPress={() => { onToggleMobile(); onClose(); }} />
          <MenuRow
            icon="trash-outline"
            label="Remove column"
            danger
            onPress={async () => {
              onClose();
              const ok = await confirmDialog({ title: `Remove "${column.title}"?`, message: 'Its values are kept and come back if the column is restored.', confirmLabel: 'Remove', destructive: true });
              if (ok) onRemove();
            }}
          />
        </View>
      )}
    </Popover>
  );
}

export function GroupMenu({ anchor, group, canManage, onRename, onColor, onArchive, onClose }) {
  const [stage, setStage] = useState('menu');
  return (
    <Popover visible anchor={anchor} onClose={onClose} width={260}>
      {stage === 'rename' && <TextEditor initial={group.name} placeholder="Group name" onDone={(t) => { if (t.trim()) onRename(t.trim()); onClose(); }} />}
      {stage === 'color' && <PaletteGrid value={group.color} onPick={(c) => { onColor(c); onClose(); }} />}
      {stage === 'menu' && (
        <View>
          <MenuRow icon="create-outline" label="Rename group" onPress={() => setStage('rename')} />
          <MenuRow icon="color-palette-outline" label="Change colour" onPress={() => setStage('color')} />
          {canManage && (
            <MenuRow
              icon="archive-outline"
              label="Archive group"
              onPress={async () => {
                onClose();
                const ok = await confirmDialog({ title: `Archive "${group.name}"?`, message: 'The group is hidden. Its items stay where they are and nothing is deleted.', confirmLabel: 'Archive' });
                if (ok) onArchive();
              }}
            />
          )}
        </View>
      )}
    </Popover>
  );
}
