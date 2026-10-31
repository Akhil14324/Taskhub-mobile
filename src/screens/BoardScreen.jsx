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
import { AddColumnMenu, ColumnMenu, GroupMenu, BoardMoreMenu } from '../components/board/BoardMenus';
import BoardAutomate from '../components/board/BoardAutomate';
import BoardImport from '../components/board/BoardImport';
import { matchesSearch, cellText, itemWordOf, statusLabelOf } from '../components/board/model';
import BoardTabs from '../components/board/BoardTabs';
import BoardToolbar from '../components/board/BoardToolbar';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import BoardItemSheet from '../components/board/BoardItemSheet';
import useShortcuts from '../hooks/useShortcuts';
import { showToast, confirmDialog } from '../utils/events';
import { toCsv, downloadText } from '../utils/csv';

// The views a board can show (F-VIW-00 .. F-VIW-13). Map, form and gallery come with their own steps.
const VIEW_KINDS = [
  ['table', 'Main table', 'grid-outline'], ['kanban', 'Kanban', 'albums-outline'], ['calendar', 'Calendar', 'calendar-outline'],
  ['timeline', 'Timeline', 'git-commit-outline'], ['gantt', 'Gantt', 'git-network-outline'], ['chart', 'Chart', 'bar-chart-outline'],
  ['workload', 'Workload', 'people-outline'], ['summary', 'Summary', 'list-outline'], ['activity', 'Activity', 'pulse-outline'],
];
const DRAWN_VIEWS = new Set(VIEW_KINDS.map((v) => v[0]));
const VIEW_ICONS = Object.fromEntries(VIEW_KINDS.map(([k, , i]) => [k, i]));

// Quick filters, saved with the view (F-FLT-04).
function applyQuick(items, f, meId) {
  if (!f) return items;
  const today = todayYmd();
  const week = addDays(today, 7);
  const due = (t) => t.due_date || t.deadline_date;
  const keep = (t) => (!f.mine || t.assignee_id === meId || (t.members || []).some((m) => m.id === meId))
    && (!f.people?.length || f.people.includes(t.assignee_id) || (t.members || []).some((m) => f.people.includes(m.id)))
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
  const [automate, setAutomate] = useState(false);
  const [importing, setImporting] = useState(false);
  // What the person set on each tab (sort, hidden columns, group by, filters). Shown at once; saved with the
  // tab when they may change it, otherwise it lasts until they leave.
  const [localVs, setLocalVs] = useState({});

  // Ctrl+Z puts back the last cell change; inside a text box the box keeps its own undo.
  useShortcuts({
    'board.undo': () => {
      const tag = typeof document !== 'undefined' ? document.activeElement?.tagName : null;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
      board.undo();
      return true;
    },
  }, desktop && !!data);

  /** The board as a spreadsheet: every item the viewer sees, each column as text. */
  const exportCsv = useCallback(() => {
    if (!data) return;
    const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
    const byId = new Map(data.items.map((t) => [t.id, t]));
    const rows = [['Name', 'Group', 'Subtask of', ...data.columns.map((c) => c.title)]];
    for (const t of data.items) {
      rows.push([t.title, groupName.get(t.business_section_id) || '', t.parent_id ? byId.get(t.parent_id)?.title || '' : '',
        ...data.columns.map((c) => cellText(t, c, data.values, people))]);
    }
    downloadText(`${data.board.name.replace(/[^\w\- ]+/g, '').trim() || 'board'} ${todayYmd()}.csv`, toCsv(rows));
  }, [data, people]);

  const views = useMemo(() => (data?.views || []).filter((v) => DRAWN_VIEWS.has(v.kind)), [data]);
  const view = views.find((v) => v.id === viewId) || views[0] || { kind: 'table' };
  const word = itemWordOf(data);
  const canSaveView = !!view.id && !!(view.owner_id || data?.access?.manage);

  const vs = useMemo(() => {
    const st = { ...(view.settings || {}), ...(localVs[view.id] || {}) };
    return {
      filters: st.filters || {},
      people: st.filters?.people || [],
      sort: st.sort?.column_id ? st.sort : null,
      hidden: st.hidden_columns || [],
      group_by: st.group_by || null,
    };
  }, [view, localVs]);

  const changeVs = useCallback((patch) => {
    const set = {};
    if ('filters' in patch) set.filters = { ...patch.filters, people: vs.people };
    if ('people' in patch) set.filters = { ...vs.filters, people: patch.people };
    if ('sort' in patch) set.sort = patch.sort || {};
    if ('hidden' in patch) set.hidden_columns = patch.hidden;
    if ('group_by' in patch) set.group_by = patch.group_by || '';
    setLocalVs((cur) => ({ ...cur, [view.id]: { ...(cur[view.id] || {}), ...set } }));
    if (canSaveView) board.updateView(view, { settings: set });
  }, [view, vs, canSaveView, board]);

  const filters = vs.filters;
  const items = useMemo(() => {
    if (!data) return [];
    let base = applyQuick(data.items, filters, user?.id);
    if (search.trim()) {
      const hit = new Set(base.filter((t) => matchesSearch(t, search, data.columns, data.values, people)).map((t) => t.id));
      base = base.filter((t) => hit.has(t.id) || (t.parent_id && hit.has(t.parent_id)) || base.some((c) => c.parent_id === t.id && hit.has(c.id)));
    }
    const col = vs.sort && data.columns.find((c) => c.id === vs.sort.column_id);
    if (col) {
      const dir = vs.sort.dir === 'desc' ? -1 : 1;
      const key = (t) => cellText(t, col, data.values, people);
      base = [...base].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        if (!x && !y) return 0;
        if (!x) return 1; // empty cells always last
        if (!y) return -1;
        return dir * (col.kind === 'numbers' ? Number(x) - Number(y) : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }));
      });
    }
    return base;
  }, [data, search, people, filters, user, vs.sort]);

  // The table can show the tasks grouped by status or owner instead of by the board's own groups. Those
  // groups only exist on screen (their ids are text), so they cannot be renamed, moved or added to.
  const shown = useMemo(() => {
    if (!data) return null;
    const columns = data.columns.filter((c) => !vs.hidden.includes(c.id));
    const statusCol = data.columns.find((c) => c.system_key === 'status') || data.columns.find((c) => c.kind === 'status');
    if (vs.group_by === 'status' && statusCol) {
      const groups = (statusCol.labels || []).map((l) => ({ id: `s:${l.id}`, name: l.label, color: l.color }));
      const rows = items.map((t) => {
        const l = !t.parent_id ? statusLabelOf(t, statusCol, data.values) : null;
        return !t.parent_id ? { ...t, business_section_id: l?.id ? `s:${l.id}` : null } : t;
      });
      return { data: { ...data, columns, groups }, items: rows };
    }
    if (vs.group_by === 'owner') {
      const seen = new Map();
      for (const t of items) if (!t.parent_id && t.assignee_id && !seen.has(t.assignee_id)) seen.set(t.assignee_id, t.assignee_name || 'Someone');
      const palette = ['blue', 'green', 'orange', 'purple', 'pink', 'aquamarine', 'red', 'yellow'];
      const groups = [...seen].map(([id, name], i) => ({ id: `o:${id}`, name, color: palette[i % palette.length] }));
      const rows = items.map((t) => (!t.parent_id ? { ...t, business_section_id: t.assignee_id ? `o:${t.assignee_id}` : null } : t));
      return { data: { ...data, columns, groups }, items: rows };
    }
    return { data: { ...data, columns }, items };
  }, [data, items, vs.hidden, vs.group_by]);

  const toggleGroup = useCallback((id) => setCollapsed((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const openCell = useCallback((anchor, item, column) => setEditing({ item, column, anchor }), []);
  const openName = useCallback((anchor, item) => setEditing({ item, column: null, anchor }), []);
  // A task opens in the board's own task window; "More options" there opens the full to-do window.
  const [sheetId, setSheetId] = useState(null);
  const openItem = useCallback((id) => setSheetId(id), []);
  const openFull = useCallback((id) => {
    if (todos.some((t) => t.id === id)) { setSheetId(null); setOpenTodoId(id); }
    else showToast({ message: 'Open it from To-do: it is not in your lists yet', icon: 'information-circle' });
  }, [todos]);
  const toggleValue = useCallback((item, column, value) => (column.kind === 'vote' ? board.vote(item, column, value) : board.setValue(item, column, value)), [board]);
  // A group made up on screen (grouped by status or owner) has a text id: the task goes to no group.
  const addItem = useCallback((title, groupId, fields) => board.addItem(title, { groupId: typeof groupId === 'number' ? groupId : null, fields }), [board]);
  // A view's quick filters: saved with the view when the person may change it (their own view, or they run the board).
  const newTask = useCallback((anchor) => setMenu({ type: 'newItem', anchor: anchor && 'x' in anchor ? anchor : anchorOf(anchor) }), []);
  const closeView = useCallback(async (v) => {
    const ok = await confirmDialog({ title: `Close the ${v.name} tab?`, message: 'Only this view goes. The tasks are not touched, and you can add the tab again with +.', confirmLabel: 'Close tab', destructive: true });
    if (!ok) return;
    await board.removeView(v);
    if (v.id === view.id) setViewId(null);
  }, [board, view]);

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
      <View {...glass('bar')} style={{ backgroundColor: colors.white, paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingTop: spacing.md, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {navigation.canGoBack() && (
            <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={colors.gray[700]} />
            </Pressable>
          )}
          <Pressable
            disabled={!data.access.manage}
            onPress={(e) => setMenu({ type: 'rename', anchor: anchorOf(e) })}
            accessibilityLabel={data.access.manage ? 'Rename this board' : undefined}
            style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text numberOfLines={1} style={{ fontSize: desktop ? 24 : 20, fontWeight: '700', color: colors.gray[900] }}>{b.name}</Text>
            {data.access.manage && <Ionicons name="chevron-down" size={16} color={colors.gray[500]} />}
          </Pressable>
          <View style={{ flex: 1 }} />
          {desktop && (
            <Pressable onPress={() => setAutomate(true)} accessibilityLabel="Automate. Rules that act for you, like notifying someone when a task is late." style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="flash-outline" size={16} color={colors.gray[700]} />
              <Text style={{ fontSize: 14, color: colors.gray[800] }}>Automate</Text>
            </Pressable>
          )}
          <Pressable onPress={(e) => setMenu({ type: 'more', anchor: anchorOf(e) })} accessibilityLabel="More board actions" hitSlop={6} style={({ hovered }) => ({ padding: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[700]} />
          </Pressable>
        </View>
        {!!b.description && <Text numberOfLines={2} style={{ fontSize: 13, color: colors.gray[600] }}>{b.description}</Text>}
        <BoardTabs
          views={views} activeId={view.id} icons={VIEW_ICONS}
          onSelect={setViewId}
          onAdd={(anchor) => setMenu({ type: 'addView', anchor })}
          onRename={(v, name) => board.updateView(v, { name })}
          onClose={closeView}
          canChange={(v) => !!(v.owner_id || data.access.manage)}
          canClose={(v) => !!v.owner_id || views.filter((x) => !x.owner_id).length > 1}
        />
      </View>
      {view.kind !== 'activity' && (
        <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingTop: spacing.sm, borderBottomWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white }}>
          <BoardToolbar
            data={data} vs={vs} onChange={changeVs} people={people} search={search} onSearch={setSearch} word={word} desktop={desktop}
            canAdd={data.access.add} kind={view.kind}
            onNew={newTask}
            onNewGroup={() => setMenu({ type: 'newGroup', anchor: null })}
            onImport={() => setImporting(true)}
          />
        </View>
      )}

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: desktop && view.kind === 'table' ? spacing.xl : 0, paddingTop: desktop ? spacing.lg : 0 }}>
        {view.kind === 'kanban' ? (
          <BoardKanban board={data} items={items} onMove={board.setStatus} onSetValue={board.setValue} people={people} onOpenItem={openItem} onOpenCell={openCell} />
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
            board={shown.data} items={shown.items} people={people} collapsed={collapsed} onToggleGroup={toggleGroup}
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
            board={shown.data} items={shown.items} people={people} collapsed={collapsed} onToggleGroup={toggleGroup}
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
          anchor={menu.anchor} group={menu.group} canManage={data.access.manage && data.board.kind !== 'my_todos'} onClose={() => setMenu(null)}
          onRename={(name) => board.updateGroup(menu.group, { name })}
          onColor={(color) => board.updateGroup(menu.group, { color })}
          onArchive={() => board.updateGroup(menu.group, { archived: true })}
          onDuplicate={data.access.add && data.board.kind !== 'my_todos' ? () => board.duplicateGroup(menu.group) : null}
        />
      )}
      {menu?.type === 'more' && (
        <BoardMoreMenu
          anchor={menu.anchor} data={data} onClose={() => setMenu(null)}
          onAutomate={() => setAutomate(true)}
          onImport={() => setImporting(true)}
          onExport={exportCsv}
          onDuplicated={(copy) => navigation.push('Board', { id: copy.id })}
          onArchive={async () => { await board.updateBoard({ archived: true }); navigation.goBack(); }}
        />
      )}
      <BoardAutomate visible={automate} board={b} onClose={() => setAutomate(false)} />
      <BoardImport visible={importing} board={data} onClose={() => setImporting(false)} onDone={board.reload} />
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
          <TextEditor initial="" placeholder={`New ${word.toLowerCase()} name`} onDone={(t) => { if (t.trim()) addItem(t, firstGroup, menu.fields); setMenu(null); }} />
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

      <BoardItemSheet
        item={sheetId ? data.items.find((t) => t.id === sheetId) : null}
        board={data} people={people} actions={board}
        onClose={() => setSheetId(null)} onOpenCell={openCell} onOpenFull={openFull}
      />
      <TodoDetailSheet todoId={openTodoId} onClose={() => { setOpenTodoId(null); board.reload(); }} />
    </View>
    </BoardMeta.Provider>
  );
}
