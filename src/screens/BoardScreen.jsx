import { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import useBoard from '../hooks/useBoard';
import { useCatalog } from '../hooks/useBoards';
import useDirectory from '../hooks/useDirectory';
import { useTodos } from '../context/TodoContext';
import BoardTable, { anchorOf } from '../components/board/BoardTable';
import BoardCards from '../components/board/BoardCards';
import BoardKanban from '../components/board/BoardKanban';
import CellEditorHost from '../components/board/CellEditorHost';
import Popover from '../components/board/Popover';
import { TextEditor } from '../components/board/Cells';
import { AddColumnMenu, ColumnMenu, GroupMenu } from '../components/board/BoardMenus';
import { matchesSearch } from '../components/board/model';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { showToast } from '../utils/events';

// Views this step draws; the other kinds (calendar, timeline, gantt, chart, ...) arrive with M7.
const DRAWN_VIEWS = new Set(['table', 'kanban']);
const VIEW_ICONS = { table: 'grid-outline', kanban: 'albums-outline' };

/**
 * One board (MONDAY_FEATURE_SPEC.md F-BRD-02, F-VIW-01, F-VIW-02). Desktop draws the main table (or Kanban);
 * a phone draws its own card layout. Cells edit in place; the item window is the existing TodoDetailSheet.
 */
export default function BoardScreen({ route }) {
  const boardId = route?.params?.id;
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const catalog = useCatalog();
  const { people } = useDirectory();
  const { todos } = useTodos();
  const board = useBoard(boardId);
  const { data } = board;

  const [viewId, setViewId] = useState(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null); // { type: 'addColumn' | 'column' | 'group' | 'rename' | 'newItem' | 'newGroup', anchor, ... }
  const [openTodoId, setOpenTodoId] = useState(null);

  const views = useMemo(() => (data?.views || []).filter((v) => DRAWN_VIEWS.has(v.kind)), [data]);
  const view = views.find((v) => v.id === viewId) || views[0] || { kind: 'table' };

  const items = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.items;
    const hit = new Set(data.items.filter((t) => matchesSearch(t, search, data.columns, data.values, people)).map((t) => t.id));
    return data.items.filter((t) => hit.has(t.id) || (t.parent_id && hit.has(t.parent_id)) || data.items.some((c) => c.parent_id === t.id && hit.has(c.id)));
  }, [data, search, people]);

  const toggleGroup = useCallback((id) => setCollapsed((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const openCell = useCallback((anchor, item, column) => setEditing({ item, column, anchor }), []);
  const openName = useCallback((anchor, item) => setEditing({ item, column: null, anchor }), []);
  const openItem = useCallback((id) => {
    if (todos.some((t) => t.id === id)) setOpenTodoId(id);
    else showToast({ message: 'Open it from To-do: it is not in your lists yet', icon: 'information-circle' });
  }, [todos]);
  const toggleValue = useCallback((item, column, value) => board.setValue(item, column, value), [board]);
  const addItem = useCallback((title, groupId) => board.addItem(title, { groupId }), [board]);

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page, padding: spacing.xl }}>
        {board.error ? <Text style={{ color: colors.gray[600] }}>{board.error}</Text> : <ActivityIndicator color={BRAND} />}
      </View>
    );
  }

  const b = data.board;
  const firstGroup = data.groups[0]?.id ?? null;
  const columnsById = data.columns;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      {/* Header */}
      <View {...glass('bar')} style={{ backgroundColor: colors.white, paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingTop: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {navigation.canGoBack() && (
            <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={colors.gray[700]} />
            </Pressable>
          )}
          <Pressable
            disabled={!data.access.manage}
            onPress={(e) => setMenu({ type: 'rename', anchor: anchorOf(e) })}
            style={{ flexShrink: 1 }}
          >
            <Text numberOfLines={1} style={{ fontSize: desktop ? 24 : 20, fontWeight: '700', color: colors.gray[900] }}>{b.name}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {desktop && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, width: 240 }}>
              <Ionicons name="search" size={15} color={colors.gray[500]} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Search this board" placeholderTextColor={colors.gray[400]}
                style={{ flex: 1, paddingVertical: 6, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
            </View>
          )}
          {data.access.add && (
            <Pressable
              {...glass('accent')}
              onPress={(e) => setMenu({ type: 'newItem', anchor: anchorOf(e) })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md }}
            >
              <Ionicons name="add" size={17} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>New {b.item_word.toLowerCase()}</Text>
            </Pressable>
          )}
        </View>
        {!!b.description && <Text numberOfLines={2} style={{ fontSize: 13, color: colors.gray[600] }}>{b.description}</Text>}
        {!desktop && (
          <TextInput value={search} onChangeText={setSearch} placeholder="Search this board" placeholderTextColor={colors.gray[400]}
            style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 15, color: colors.gray[900], outlineStyle: 'none' }} />
        )}
        {/* View tabs */}
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {views.map((v) => {
            const active = v.id === view.id;
            return (
              <Pressable key={v.id} onPress={() => setViewId(v.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: active ? BRAND : 'transparent' }}>
                <Ionicons name={VIEW_ICONS[v.kind]} size={15} color={active ? BRAND : colors.gray[500]} />
                <Text style={{ fontSize: 14, color: active ? colors.gray[900] : colors.gray[600], fontWeight: active ? '600' : '400' }}>{v.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: desktop && view.kind === 'table' ? spacing.xl : 0, paddingTop: desktop ? spacing.lg : 0 }}>
        {view.kind === 'kanban' ? (
          <BoardKanban board={data} items={items} people={people} onOpenItem={openItem} onOpenCell={openCell} />
        ) : desktop ? (
          <BoardTable
            board={data} items={items} people={people} collapsed={collapsed} onToggleGroup={toggleGroup}
            onOpenCell={openCell} onOpenName={openName} onOpenItem={openItem} onToggleValue={toggleValue}
            onColumnMenu={(anchor, column) => setMenu({ type: 'column', anchor, column })}
            onAddColumn={(anchor) => setMenu({ type: 'addColumn', anchor })}
            onGroupMenu={(anchor, group) => setMenu({ type: 'group', anchor, group })}
            onAddItem={addItem}
            onAddGroup={() => setMenu({ type: 'newGroup', anchor: null })}
            focus={focus} setFocus={setFocus}
          />
        ) : (
          <BoardCards
            board={data} items={items} people={people} collapsed={collapsed} onToggleGroup={toggleGroup}
            onOpenItem={openItem} onOpenCell={openCell} onAddItem={addItem}
            onAddGroup={() => setMenu({ type: 'newGroup', anchor: null })}
          />
        )}
      </View>

      <CellEditorHost editing={editing} onClose={() => setEditing(null)} board={data} people={people} actions={board} />

      {menu?.type === 'addColumn' && (
        <AddColumnMenu anchor={menu.anchor} catalog={catalog} columns={columnsById} onPick={(spec) => board.addColumn(spec)} onClose={() => setMenu(null)} />
      )}
      {menu?.type === 'column' && (
        <ColumnMenu
          anchor={menu.anchor} column={menu.column} columns={columnsById} onClose={() => setMenu(null)}
          onRename={(title) => board.updateColumn(menu.column, { title })}
          onRemove={() => board.removeColumn(menu.column)}
          onToggleMobile={() => board.updateColumn(menu.column, { settings: { show_on_mobile: !menu.column.settings?.show_on_mobile } })}
          onMove={(dir) => {
            const ids = columnsById.map((c) => c.id);
            const i = ids.indexOf(menu.column.id);
            const j = i + dir;
            if (j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j], ids[i]];
            board.orderColumns(ids);
          }}
        />
      )}
      {menu?.type === 'group' && (
        <GroupMenu
          anchor={menu.anchor} group={menu.group} canManage={data.access.manage} onClose={() => setMenu(null)}
          onRename={(name) => board.updateGroup(menu.group, { name })}
          onColor={(color) => board.updateGroup(menu.group, { color })}
          onArchive={() => board.updateGroup(menu.group, { archived: true })}
        />
      )}
      {menu?.type === 'rename' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={320}>
          <TextEditor initial={b.name} placeholder="Board name" onDone={(t) => { if (t.trim()) board.rename(t.trim()); setMenu(null); }} />
        </Popover>
      )}
      {menu?.type === 'newItem' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={340}>
          <TextEditor initial="" placeholder={`New ${b.item_word.toLowerCase()} name`} onDone={(t) => { if (t.trim()) addItem(t, firstGroup); setMenu(null); }} />
        </Popover>
      )}
      {menu?.type === 'newGroup' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={320}>
          <TextEditor initial="" placeholder="Group name" onDone={(t) => {
            if (t.trim()) board.addGroup({ name: t.trim(), color: ['blue', 'green', 'orange', 'purple', 'pink', 'aquamarine', 'red', 'yellow'][data.groups.length % 8] });
            setMenu(null);
          }} />
        </Popover>
      )}

      <TodoDetailSheet todoId={openTodoId} onClose={() => { setOpenTodoId(null); board.reload(); }} />
    </View>
  );
}
