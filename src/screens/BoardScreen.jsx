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
import { BoardCalendar, BoardTimeline, BoardChart, BoardWorkload, BoardSummary, BoardActivity } from '../components/board/BoardViews';
import { todayYmd, addDays } from '../utils/dates';
import CellEditorHost from '../components/board/CellEditorHost';
import Popover from '../components/board/Popover';
import { TextEditor, BoardMeta } from '../components/board/Cells';
import { useAuth } from '../context/AuthContext';
import { AddColumnMenu, ColumnMenu, GroupMenu } from '../components/board/BoardMenus';
import { matchesSearch } from '../components/board/model';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { showToast } from '../utils/events';

// The views a board can show (F-VIW-00 .. F-VIW-13). Map, form and gallery come with their own steps.
const VIEW_KINDS = [
  ['table', 'Main table', 'grid-outline'], ['kanban', 'Kanban', 'albums-outline'], ['calendar', 'Calendar', 'calendar-outline'],
  ['timeline', 'Timeline', 'git-commit-outline'], ['gantt', 'Gantt', 'git-network-outline'], ['chart', 'Chart', 'bar-chart-outline'],
  ['workload', 'Workload', 'people-outline'], ['summary', 'Summary', 'list-outline'], ['activity', 'Activity', 'pulse-outline'],
];
const DRAWN_VIEWS = new Set(VIEW_KINDS.map((v) => v[0]));
const VIEW_ICONS = Object.fromEntries(VIEW_KINDS.map(([k, , i]) => [k, i]));

// Quick filters, saved with the view (F-FLT-04).
const QUICK = [['mine', 'Mine'], ['overdue', 'Overdue'], ['week', 'This week'], ['hide_done', 'Hide done']];
function applyQuick(items, f, meId) {
  if (!f) return items;
  const today = todayYmd();
  const week = addDays(today, 7);
  const due = (t) => t.due_date || t.deadline_date;
  const keep = (t) => (!f.mine || t.assignee_id === meId || (t.members || []).some((m) => m.id === meId))
    && (!f.overdue || (!t.is_done && due(t) && due(t) < today))
    && (!f.week || (due(t) && due(t) >= today && due(t) <= week))
    && (!f.hide_done || !t.is_done);
  const ok = new Set(items.filter(keep).map((t) => t.id));
  // Sub-items stay with a parent that is shown.
  return items.filter((t) => ok.has(t.id) || (t.parent_id && ok.has(t.parent_id)));
}

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
  const { user } = useAuth();

  const [viewId, setViewId] = useState(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null); // { type: 'addColumn' | 'column' | 'group' | 'rename' | 'newItem' | 'newGroup', anchor, ... }
  const [openTodoId, setOpenTodoId] = useState(null);

  const views = useMemo(() => (data?.views || []).filter((v) => DRAWN_VIEWS.has(v.kind)), [data]);
  const view = views.find((v) => v.id === viewId) || views[0] || { kind: 'table' };

  const filters = view.settings?.filters || null;
  const items = useMemo(() => {
    if (!data) return [];
    const base = applyQuick(data.items, filters, user?.id);
    if (!search.trim()) return base;
    const hit = new Set(base.filter((t) => matchesSearch(t, search, data.columns, data.values, people)).map((t) => t.id));
    return base.filter((t) => hit.has(t.id) || (t.parent_id && hit.has(t.parent_id)) || base.some((c) => c.parent_id === t.id && hit.has(c.id)));
  }, [data, search, people, filters, user]);

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
  const toggleValue = useCallback((item, column, value) => (column.kind === 'vote' ? board.vote(item, column, value) : board.setValue(item, column, value)), [board]);
  const addItem = useCallback((title, groupId, fields) => board.addItem(title, { groupId, fields }), [board]);
  // A view's quick filters: saved with the view when the person may change it (their own view, or they run the board).
  const toggleQuick = useCallback((key) => {
    const next = { ...(view.settings?.filters || {}), [key]: !view.settings?.filters?.[key] };
    if (view.id && (view.owner_id || data?.access?.manage)) board.updateView(view, { settings: { filters: next } });
  }, [view, data, board]);

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
    <BoardMeta.Provider value={{ linked: data.linked || {}, attachments: data.attachments || {}, meId: user?.id, aiEnabled: !!data.ai_enabled }}>
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
          <Pressable onPress={(e) => setMenu({ type: 'addView', anchor: anchorOf(e) })} accessibilityLabel="Add a view" style={{ paddingVertical: 8, paddingHorizontal: spacing.sm }}>
            <Ionicons name="add" size={18} color={colors.gray[600]} />
          </Pressable>
        </View>
        {view.kind !== 'activity' && (
          <View style={{ flexDirection: 'row', gap: 6, paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
            {QUICK.map(([k, l]) => {
              const on = !!filters?.[k];
              return (
                <Pressable key={k} onPress={() => toggleQuick(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: on ? BRAND : colors.gray[300], backgroundColor: on ? colors.brand[50] : 'transparent' }}>
                  {on && <Ionicons name="checkmark" size={13} color={BRAND} />}
                  <Text style={{ fontSize: 13, color: on ? BRAND : colors.gray[700] }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: desktop && view.kind === 'table' ? spacing.xl : 0, paddingTop: desktop ? spacing.lg : 0 }}>
        {view.kind === 'kanban' ? (
          <BoardKanban board={data} items={items} people={people} onOpenItem={openItem} onOpenCell={openCell} />
        ) : view.kind === 'calendar' ? (
          <BoardCalendar board={data} items={items} onOpenItem={openItem} onAddOnDay={data.access.add ? (e, day) => setMenu({ type: 'newItem', anchor: anchorOf(e), fields: { due_date: day } }) : null} />
        ) : view.kind === 'timeline' || view.kind === 'gantt' ? (
          <BoardTimeline board={data} items={items} onOpenItem={openItem} gantt={view.kind === 'gantt'} />
        ) : view.kind === 'chart' ? (
          <BoardChart board={data} items={items} people={people} />
        ) : view.kind === 'workload' ? (
          <BoardWorkload board={data} items={items} people={people} onOpenItem={openItem} />
        ) : view.kind === 'summary' ? (
          <BoardSummary board={data} items={items} />
        ) : view.kind === 'activity' ? (
          <BoardActivity board={data} onOpenItem={openItem} />
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
          onSettings={(settings) => board.updateColumn(menu.column, { settings })}
          aiEnabled={!!data.ai_enabled}
          onAiFillAll={() => board.aiFill(menu.column, data.items.filter((t) => !t.parent_id).map((t) => t.id).slice(0, 50))}
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
      {menu?.type === 'addView' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={260}>
          {VIEW_KINDS.map(([k, label, icon]) => (
            <Pressable
              key={k}
              onPress={async () => {
                setMenu(null);
                const made = await board.addView({ kind: k, name: label, personal: !data.access.manage });
                if (made?.view) setViewId(made.view.id);
              }}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name={icon} size={16} color={colors.brand[600]} />
              <Text style={{ fontSize: 14, color: colors.gray[800] }}>{label}</Text>
            </Pressable>
          ))}
          <Text style={{ fontSize: 11, color: colors.gray[500], padding: 6 }}>{data.access.manage ? 'Everyone on the board sees views you add.' : 'Views you add are yours only.'}</Text>
        </Popover>
      )}
      {menu?.type === 'rename' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={320}>
          <TextEditor initial={b.name} placeholder="Board name" onDone={(t) => { if (t.trim()) board.rename(t.trim()); setMenu(null); }} />
        </Popover>
      )}
      {menu?.type === 'newItem' && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={340}>
          <TextEditor initial="" placeholder={`New ${b.item_word.toLowerCase()} name`} onDone={(t) => { if (t.trim()) addItem(t, firstGroup, menu.fields); setMenu(null); }} />
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
    </BoardMeta.Provider>
  );
}
