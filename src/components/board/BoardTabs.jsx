import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import Popover, { anchorOf } from './Popover';
import { TextEditor } from './Cells';

/**
 * The view tabs of a board (Main table, Gantt, Kanban, Calendar ...). The open tab has a "..." menu to rename or
 * close it, and "+" adds another view. Closing a tab only removes the view, never the tasks.
 */
export default function BoardTabs({ views, activeId, icons, onSelect, onAdd, onRename, onClose, canChange, canClose }) {
  const colors = useColors();
  const [menu, setMenu] = useState(null); // { view, anchor, mode: 'menu' | 'rename' }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2 }}>
        {views.map((v) => {
          const active = v.id === activeId;
          return (
            <Pressable
              key={v.id}
              onPress={() => onSelect(v.id)}
              accessibilityLabel={`${v.name} tab`}
              style={({ hovered }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingLeft: spacing.md, paddingRight: active ? 6 : spacing.md,
                borderBottomWidth: 2, borderBottomColor: active ? BRAND : 'transparent', borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md,
                backgroundColor: hovered && !active ? colors.gray[100] : 'transparent',
              })}
            >
              <Ionicons name={icons[v.kind]} size={15} color={active ? BRAND : colors.gray[500]} />
              <Text style={{ fontSize: 14, color: active ? colors.gray[900] : colors.gray[600], fontWeight: active ? '600' : '400' }}>{v.name}</Text>
              {active && canChange(v) && (
                <Pressable
                  onPress={(e) => setMenu({ view: v, anchor: anchorOf(e), mode: 'menu' })}
                  hitSlop={6}
                  accessibilityLabel={`${v.name} tab options`}
                  style={({ hovered }) => ({ padding: 3, borderRadius: radius.sm, backgroundColor: hovered ? colors.gray[200] : 'transparent' })}
                >
                  <Ionicons name="ellipsis-horizontal" size={15} color={colors.gray[600]} />
                </Pressable>
              )}
            </Pressable>
          );
        })}
        <Pressable onPress={(e) => onAdd(anchorOf(e))} accessibilityLabel="Add a view" style={({ hovered }) => ({ padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
          <Ionicons name="add" size={18} color={colors.gray[600]} />
        </Pressable>
      </ScrollView>
      {menu?.mode === 'menu' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={220}>
          <Pressable onPress={() => setMenu({ ...menu, mode: 'rename' })} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="pencil-outline" size={16} color={colors.gray[600]} />
            <Text style={{ fontSize: 14, color: colors.gray[900] }}>Rename</Text>
          </Pressable>
          {canClose(menu.view) ? (
            <Pressable onPress={() => { const v = menu.view; setMenu(null); onClose(v); }} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="close-circle-outline" size={16} color={colors.red[600]} />
              <Text style={{ fontSize: 14, color: colors.red[600] }}>Close this tab</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 12, color: colors.gray[500], padding: 8 }}>A board keeps at least one shared tab.</Text>
          )}
        </Popover>
      )}
      {menu?.mode === 'rename' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={260}>
          <TextEditor initial={menu.view.name} placeholder="Tab name" onDone={(t) => { const v = menu.view; setMenu(null); if (t.trim() && t.trim() !== v.name) onRename(v, t.trim()); }} />
        </Popover>
      )}
    </View>
  );
}
