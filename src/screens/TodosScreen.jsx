import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/BottomSheet';
import DueDatePicker from '../components/DueDatePicker';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import ShareToChatSheet from '../components/ShareToChatSheet';
import TodoItem from '../components/todos/TodoItem';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import FiltersSheet, { FilterEditorSheet } from '../components/todos/FiltersSheet';
import ProductivitySheet from '../components/todos/ProductivitySheet';
import BoardView from '../components/todos/BoardView';
import BulkBar from '../components/todos/BulkBar';
import { useNowTick } from '../components/todos/TimeHealth';
import { PickerSheet, NameSheet } from '../components/todos/Pickers';
import { Chip, Fab, IconButton, SectionHeader, EmptyHero, ProgressRing, PRIORITY, accent } from '../components/kit';
import useWebReorder, { makeDraggable } from '../hooks/useWebReorder';
import { todayYmd, addDays, formatDayHeader, WEEKDAYS, MONTHS_SHORT, toYmd } from '../utils/dates';
import {
  BUILTIN_FILTERS, applyFilter, describeFilter, groupWithSubtasks, subtaskProgress, manualSort,
} from '../utils/todoMeta';
import { showToast, confirmDialog } from '../utils/events';

const LIST_EMOJIS = ['📋', '🏠', '💼', '🛒', '💰', '🏗️', '🍽️', '⛏️', '💻', '📞', '🎯', '⭐'];

export default function TodosScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const {
    todos, lists, sections: allSections, filters, loading, fetchTodos, toggleTodo, deleteTodo, deleteTodos, updateTodo,
    duplicateTodo, createList, updateList, deleteList, createSection, renameSection, deleteSection, saveFilter, deleteFilter,
    shareTodos, reorderTodos, fetchCompleted, mergeTodos,
  } = useTodos();

  // today | upcoming | inbox | shared | done | list:<id> | filter:<id> | label:<name>
  const [view, setView] = useState('today');
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openTodoId, setOpenTodoId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [listEditor, setListEditor] = useState(null); // null | { id?, name, color, emoji }
  const [sectionEditor, setSectionEditor] = useState(null); // null | { id?, list_id, name }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterEditor, setFilterEditor] = useState(null);
  const [productivityOpen, setProductivityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [layout, setLayout] = useState('list'); // list | board (list views only)
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkSheet, setBulkSheet] = useState(null); // 'date' | 'priority' | 'move'
  const [moveCard, setMoveCard] = useState(null); // board card being moved to another section
  const [history, setHistory] = useState({ items: [], hasMore: false, loading: false });
  const now = useNowTick(60000); // time-status colours stay live while the screen is open
  const scrollRef = useRef(null);
  const listAreaRef = useRef(null);

  // Deep link from a notification: open the to-do and flash it.
  useEffect(() => {
    const id = Number(route.params?.highlightId);
    if (!id) return;
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      setView(todo.list_id ? `list:${todo.list_id}` : todo.due_date && todo.due_date <= todayYmd() ? 'today' : 'inbox');
      setHighlightId(id);
      navigation.setParams({ highlightId: undefined });
      setTimeout(() => setHighlightId(null), 2500);
    }
  }, [route.params?.highlightId, todos, navigation]);

  const today = todayYmd();
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const open = useMemo(() => todos.filter((t) => !t.is_done), [todos]);
  const doneToday = useMemo(
    () => todos.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today),
    [todos, today]
  );

  const counts = useMemo(() => ({
    today: open.filter((t) => t.due_date && t.due_date <= today).length,
    inbox: open.filter((t) => !t.list_id).length,
    shared: open.filter((t) => (t.members || []).length > 1).length,
    lists: Object.fromEntries(lists.map((l) => [l.id, open.filter((t) => t.list_id === l.id).length])),
  }), [open, lists, today]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodos();
    if (view === 'done') await loadHistory(true);
    setRefreshing(false);
  };

  const currentList = view.startsWith('list:') ? listById.get(Number(view.slice(5))) : null;
  const listSections = useMemo(
    () => (currentList ? allSections.filter((s) => s.list_id === currentList.id) : []),
    [allSections, currentList]
  );
  const filterKey = view.startsWith('filter:') ? view.slice(7) : null;
  const activeFilter = filterKey
    ? (BUILTIN_FILTERS.find((b) => b.id === filterKey) || filters.find((f) => String(f.id) === filterKey) || null)
    : null;
  const labelName = view.startsWith('label:') ? view.slice(6) : null;
  const onBoard = !!currentList && layout === 'board' && !search;

  const viewTitle = view === 'today' ? 'Today'
    : view === 'upcoming' ? 'Upcoming'
      : view === 'inbox' ? 'Inbox'
        : view === 'shared' ? 'Shared with me'
          : view === 'done' ? 'Completed'
            : activeFilter ? activeFilter.name
              : labelName ? `+${labelName}`
                : currentList ? `${currentList.emoji ? `${currentList.emoji} ` : ''}${currentList.name}` : 'To-do';

  // ---- completed history ---------------------------------------------------
  const loadHistory = useCallback(async (reset = false) => {
    setHistory((h) => ({ ...h, loading: true }));
    try {
      const before = reset ? undefined : history.items[history.items.length - 1]?.done_at;
      const data = await fetchCompleted(before);
      mergeTodos(data.todos);
      setHistory((h) => ({ items: reset ? data.todos : [...h.items, ...data.todos], hasMore: data.has_more, loading: false }));
    } catch {
      setHistory((h) => ({ ...h, loading: false }));
    }
  }, [fetchCompleted, mergeTodos, history.items]);

  useEffect(() => {
    if (view === 'done') loadHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ---- sections for the current view ---------------------------------------
  const { sections, doneItems, visibleOpenIds, manual } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (t) => !q
      || t.title.toLowerCase().includes(q)
      || (t.notes || '').toLowerCase().includes(q)
      || (t.labels || []).some((l) => l.includes(q.replace(/^\+/, '')));
    const openItems = open.filter(match);
    let result = [];
    let done = [];
    let manualOrder = false;

    if (q) {
      result = [{ key: 'results', title: `Results for “${search.trim()}”`, items: openItems }];
      done = todos.filter((t) => t.is_done && match(t));
    } else if (view === 'today') {
      const overdue = openItems.filter((t) => t.due_date && t.due_date < today);
      const dueToday = openItems.filter((t) => t.due_date === today);
      if (overdue.length) result.push({ key: 'overdue', title: 'Overdue', items: overdue, overdue: true });
      result.push({ key: 'today', title: formatDayHeader(today), items: dueToday });
      done = doneToday;
    } else if (view === 'upcoming') {
      const byDay = new Map();
      for (let i = 0; i < 14; i++) byDay.set(addDays(today, i), []);
      const later = [];
      openItems.filter((t) => t.due_date && t.due_date >= today).forEach((t) => {
        if (byDay.has(t.due_date)) byDay.get(t.due_date).push(t);
        else later.push(t);
      });
      byDay.forEach((items, day) => {
        if (items.length || day === today || day === addDays(today, 1)) {
          result.push({ key: day, title: formatDayHeader(day), items, day });
        }
      });
      if (later.length) result.push({ key: 'later', title: 'Later', items: later });
    } else if (view === 'inbox') {
      manualOrder = true;
      result.push({ key: 'inbox', title: null, items: manualSort(openItems.filter((t) => !t.list_id)) });
      done = todos.filter((t) => t.is_done && !t.list_id);
    } else if (view === 'shared') {
      const shared = openItems.filter((t) => (t.members || []).length > 1);
      const fromOthers = shared.filter((t) => t.created_by !== user?.id);
      const mine = shared.filter((t) => t.created_by === user?.id);
      if (fromOthers.length) result.push({ key: 'from', title: 'Assigned to me by others', items: fromOthers });
      if (mine.length) result.push({ key: 'mine', title: 'I shared with others', items: mine });
      if (!result.length) result.push({ key: 'empty', title: null, items: [] });
      done = todos.filter((t) => t.is_done && (t.members || []).length > 1);
    } else if (currentList) {
      manualOrder = true;
      const inList = openItems.filter((t) => t.list_id === currentList.id);
      if (listSections.length === 0) {
        result.push({ key: 'list', title: null, items: manualSort(inList) });
      } else {
        result.push({ key: 'nosec', title: null, items: manualSort(inList.filter((t) => !t.section_id)) });
        listSections.forEach((s) => {
          result.push({ key: `sec:${s.id}`, title: s.name, section: s, items: manualSort(inList.filter((t) => t.section_id === s.id)) });
        });
      }
      done = todos.filter((t) => t.is_done && t.list_id === currentList.id);
    } else if (activeFilter) {
      result.push({ key: 'filter', title: null, items: applyFilter(openItems, activeFilter.config, { userId: user?.id, today }) });
    } else if (labelName) {
      result.push({ key: 'label', title: null, items: openItems.filter((t) => (t.labels || []).includes(labelName)) });
      done = todos.filter((t) => t.is_done && (t.labels || []).includes(labelName));
    }
    const ids = result.flatMap((s) => s.items.map((t) => t.id));
    return { sections: result, doneItems: done, visibleOpenIds: ids, manual: manualOrder && !q };
  }, [open, todos, view, today, doneToday, currentList, listSections, activeFilter, labelName, search, user?.id]);

  const totalToday = counts.today + doneToday.length;
  const todayPercent = totalToday ? Math.round((doneToday.length / totalToday) * 100) : 0;

  const rescheduleOverdue = async () => {
    const overdue = open.filter((t) => t.due_date && t.due_date < today);
    await Promise.all(overdue.map((t) => updateTodo(t.id, { due_date: today }).catch(() => null)));
    showToast({ message: `Moved ${overdue.length} to today`, tone: 'success', icon: 'calendar' });
  };

  const quickAddDefaults = view === 'today' ? { due_date: today }
    : currentList ? { list_id: currentList.id }
      : labelName ? { labels: [labelName] } : {};

  // ---- selection -----------------------------------------------------------
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);
  useEffect(() => { exitSelect(); }, [view, exitSelect]);

  const toggleSelected = useCallback((todo) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(todo.id)) next.delete(todo.id);
      else next.add(todo.id);
      return next;
    });
  }, []);
  const selectedTodos = useMemo(() => todos.filter((t) => selected.has(t.id)), [todos, selected]);

  const bulk = {
    complete: async () => {
      const targets = selectedTodos.filter((t) => !t.is_done);
      await Promise.all(targets.map((t) => toggleTodo(t, { silent: true })));
      showToast({ message: `Completed ${targets.length}`, tone: 'success', icon: 'checkmark-circle' });
      exitSelect();
    },
    patch: async (patch, message) => {
      await Promise.all(selectedTodos.map((t) => updateTodo(t.id, patch).catch(() => null)));
      showToast({ message, tone: 'success', icon: 'checkmark-circle' });
      exitSelect();
    },
    duplicate: async () => {
      await Promise.all(selectedTodos.map((t) => duplicateTodo(t, { silent: true }).catch(() => null)));
      showToast({ message: `Duplicated ${selectedTodos.length}`, tone: 'success', icon: 'copy' });
      exitSelect();
    },
    remove: async () => {
      const ok = await confirmDialog({
        title: `Delete ${selectedTodos.length} to-do${selectedTodos.length === 1 ? '' : 's'}?`,
        message: 'Ones someone else created are only removed from your list.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      await deleteTodos(selectedTodos);
      exitSelect();
    },
  };

  // ---- drag & drop ordering (desktop web) ----------------------------------
  const onReorder = useCallback((ids) => reorderTodos(ids), [reorderTodos]);
  useWebReorder(listAreaRef, { enabled: manual && !selectMode && !onBoard && !loading && view !== 'done', onReorder });

  // ---- rendering -----------------------------------------------------------
  const toggleCollapse = useCallback((todo) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(todo.id)) next.delete(todo.id);
      else next.add(todo.id);
      return next;
    });
  }, []);

  const dragHandle = Platform.OS === 'web' && manual && !selectMode ? (
    <View ref={makeDraggable} dataSet={{ dragHandle: '1' }} style={styles.dragHandle}>
      <Ionicons name="reorder-two" size={18} color={colors.gray[300]} />
    </View>
  ) : null;

  const renderRow = (t, { indent = false, parentTitle, onToggle = toggleTodo, handle = null, subtaskCount } = {}) => (
    <Animated.View key={t.id} layout={LinearTransition.springify().damping(18)} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
      <TodoItem
        todo={t}
        list={listById.get(t.list_id)}
        showList={view === 'today' || view === 'upcoming' || view === 'shared' || !!search || !!activeFilter || !!labelName}
        currentUserId={user?.id}
        highlighted={highlightId === t.id}
        onToggle={onToggle}
        onOpen={(item) => setOpenTodoId(item.id)}
        onDelete={deleteTodo}
        progress={subtaskCount === undefined ? undefined : subtaskProgress(t, todos)}
        indent={indent}
        parentTitle={parentTitle}
        selectMode={selectMode}
        selected={selected.has(t.id)}
        onSelect={toggleSelected}
        collapsed={collapsed.has(t.id)}
        onToggleCollapse={toggleCollapse}
        dragHandle={handle}
        now={now}
      />
    </Animated.View>
  );

  /** A to-do with its sub-tasks nested beneath it. */
  const renderGroup = (g, groupKey, opts = {}) => {
    const { todo, subtasks, parent } = g;
    const isCollapsed = collapsed.has(todo.id);
    return (
      <View key={todo.id} dataSet={{ todoRow: todo.id, group: groupKey }}>
        {renderRow(todo, {
          ...opts,
          parentTitle: parent?.title,
          subtaskCount: subtasks.length || todo.subtask_count || 0,
          handle: 'handle' in opts ? opts.handle : dragHandle,
        })}
        {!isCollapsed && subtasks.map((s) => renderRow(s, { indent: true, onToggle: opts.onToggle, subtaskCount: undefined }))}
      </View>
    );
  };

  const allEmpty = sections.every((s) => s.items.length === 0);
  const emptyState = (() => {
    if (search) return { icon: 'search', title: 'Nothing found', message: 'Try another word.' };
    if (view === 'today') {
      return doneToday.length
        ? { icon: 'trophy', title: 'You’re all done for today! 🎉', message: `${doneToday.length} completed. Enjoy the rest of your day.`, color: '#dc2626' }
        : { icon: 'sunny', title: 'A fresh day', message: 'Add what you want to get done today. Try “Call supplier 4pm p1”.', color: '#b91c1c' };
    }
    if (view === 'shared') return { icon: 'people', title: 'Nothing shared yet', message: 'Type @name while adding a to-do and it lands in their list too.' };
    if (view === 'upcoming') return { icon: 'calendar', title: 'Your schedule is clear', message: 'Plan ahead — add a to-do with a date.' };
    if (activeFilter) return { icon: 'funnel', title: 'No matches', message: 'Nothing open fits this filter right now.' };
    if (labelName) return { icon: 'pricetag', title: 'No open to-dos', message: `Nothing is tagged +${labelName} at the moment.` };
    return { icon: 'file-tray', title: 'All clear', message: 'Tap + to add a to-do.' };
  })();

  const shareVisibleIds = view === 'done'
    ? history.items.map((t) => t.id)
    : visibleOpenIds.length ? visibleOpenIds : doneItems.map((t) => t.id);

  // Board columns (a column per section of the current list).
  const boardColumns = useMemo(() => {
    if (!onBoard) return [];
    const tops = (items) => groupWithSubtasks(items, todos).map((g) => g.todo);
    return sections
      .filter((s) => s.section || s.items.length > 0 || listSections.length === 0)
      .map((s) => ({
      key: s.key,
      title: s.section ? s.section.name : (listSections.length ? 'No section' : currentList.name),
      section: s.section,
      sectionId: s.section ? s.section.id : null,
      items: tops(s.items),
    }));
  }, [onBoard, sections, todos, listSections.length, currentList]);

  // ---- overflow menu -------------------------------------------------------
  const menuOptions = [
    { key: 'select', label: 'Select to-dos', icon: 'checkbox-outline' },
    { key: 'productivity', label: 'Productivity & daily goal', icon: 'stats-chart-outline' },
    { key: 'share', label: 'Share this view to chat', icon: 'paper-plane-outline' },
    ...(currentList ? [
      { key: 'layout', label: layout === 'board' ? 'Show as list' : 'Show as board', icon: layout === 'board' ? 'list-outline' : 'grid-outline' },
      { key: 'section', label: 'Add section', icon: 'albums-outline' },
      { key: 'edit', label: 'Edit list', icon: 'create-outline' },
    ] : []),
    ...(typeof activeFilter?.id === 'number' ? [{ key: 'editFilter', label: 'Edit filter', icon: 'create-outline' }] : []),
  ];
  const onMenu = (key) => {
    if (key === 'select') setSelectMode(true);
    else if (key === 'productivity') setProductivityOpen(true);
    else if (key === 'share') (shareVisibleIds.length ? setShareOpen(true) : showToast({ message: 'Nothing to share here yet' }));
    else if (key === 'layout') setLayout((l) => (l === 'board' ? 'list' : 'board'));
    else if (key === 'section') setSectionEditor({ list_id: currentList.id, name: '' });
    else if (key === 'edit') setListEditor({ ...currentList });
    else if (key === 'editFilter') setFilterEditor(activeFilter);
  };

  const moveOptions = [
    { key: 'inbox', label: 'Inbox', icon: 'file-tray' },
    ...lists.map((l) => ({ key: l.id, label: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, icon: 'albums-outline' })),
  ];

  const historyGroups = useMemo(() => {
    const groups = [];
    history.items.forEach((t) => {
      const day = toYmd(new Date(t.done_at));
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(t);
      else groups.push({ day, items: [t] });
    });
    return groups;
  }, [history.items]);

  const inFilterView = !!activeFilter || !!labelName;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{selectMode ? `${selected.size} selected` : viewTitle}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {selectMode ? 'Tap to-dos to select them'
              : view === 'today'
                ? `${WEEKDAYS[new Date().getDay()]}, ${new Date().getDate()} ${MONTHS_SHORT[new Date().getMonth()]} · ${counts.today} left`
                : view === 'done' ? `${history.items.length} completed${history.hasMore ? '+' : ''}`
                  : activeFilter ? describeFilter(activeFilter.config, lists)
                    : `${visibleOpenIds.length} to-do${visibleOpenIds.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        {selectMode ? (
          <AnimatedPressable onPress={exitSelect} haptic="light" style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </AnimatedPressable>
        ) : (
          <>
            {view === 'today' && totalToday > 0 && (
              <AnimatedPressable onPress={() => setProductivityOpen(true)} haptic="light" accessibilityLabel="Productivity">
                <ProgressRing percent={todayPercent} size={40} stroke={4} color="#dc2626">
                  <Text style={styles.ringText}>{todayPercent}%</Text>
                </ProgressRing>
              </AnimatedPressable>
            )}
            <IconButton icon={searching ? 'close' : 'search'} onPress={() => { setSearching((s) => !s); setSearch(''); }} accessibilityLabel="Search to-dos" />
            <IconButton icon="ellipsis-horizontal" onPress={() => setMenuOpen(true)} accessibilityLabel="More options" />
          </>
        )}
      </View>

      {searching && !selectMode && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.gray[400]} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="Search to-dos, notes and +labels"
            placeholderTextColor={colors.gray[400]}
            style={styles.searchInput}
          />
        </Animated.View>
      )}

      {/* Views */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsWrap}>
        <ViewTab label="Today" icon="today" count={counts.today} active={view === 'today'} color="#dc2626" onPress={() => setView('today')} />
        <ViewTab label="Upcoming" icon="calendar" active={view === 'upcoming'} color="#b91c1c" onPress={() => setView('upcoming')} />
        <ViewTab label="Inbox" icon="file-tray" count={counts.inbox} active={view === 'inbox'} color="#dc2626" onPress={() => setView('inbox')} />
        <ViewTab label="Shared" icon="people" count={counts.shared} active={view === 'shared'} color="#b91c1c" onPress={() => setView('shared')} />
        <ViewTab
          label={inFilterView ? viewTitle : 'Filters'}
          icon="funnel"
          active={inFilterView}
          color="#dc2626"
          onPress={() => setFiltersOpen(true)}
        />
        <ViewTab label="Completed" icon="checkmark-done" active={view === 'done'} color="#b91c1c" onPress={() => setView('done')} />
        {lists.map((l) => (
          <ViewTab
            key={l.id}
            label={`${l.emoji ? `${l.emoji} ` : ''}${l.name}`}
            count={counts.lists[l.id]}
            active={view === `list:${l.id}`}
            color={accent(l.color)}
            onPress={() => setView(`list:${l.id}`)}
          />
        ))}
        <Chip icon="add" label="List" color={colors.gray[500]} onPress={() => setListEditor({ name: '', color: 'red', emoji: '📋' })} />
      </ScrollView>

      {loading ? (
        <SkeletonList count={6} type="notification" />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          {view === 'done' ? (
            <View>
              {historyGroups.map((g) => (
                <View key={g.day}>
                  <SectionHeader title={formatDayHeader(g.day)} count={g.items.length} />
                  {g.items.map((t) => renderGroup(
                    { todo: t, subtasks: [], parent: todos.find((p) => p.id === t.parent_id) || null },
                    `done:${g.day}`,
                    {
                      handle: null,
                      onToggle: (item) => {
                        toggleTodo(item);
                        setHistory((h) => ({ ...h, items: h.items.filter((x) => x.id !== item.id) }));
                      },
                    }
                  ))}
                </View>
              ))}
              {!history.items.length && !history.loading && (
                <EmptyHero icon="checkmark-done" title="Nothing completed yet" message="Finished to-dos show up here, newest first." />
              )}
              {history.hasMore && (
                <AnimatedPressable style={styles.loadMore} onPress={() => loadHistory(false)} haptic="light" disabled={history.loading}>
                  <Text style={styles.loadMoreText}>{history.loading ? 'Loading…' : 'Load older'}</Text>
                </AnimatedPressable>
              )}
            </View>
          ) : onBoard ? (
            <BoardView
              columns={boardColumns}
              progressOf={(t) => subtaskProgress(t, todos)}
              onOpen={(t) => setOpenTodoId(t.id)}
              onToggle={toggleTodo}
              onMove={setMoveCard}
              onAdd={(col) => setAddOpen({ list_id: currentList.id, section_id: col.sectionId })}
              onAddSection={() => setSectionEditor({ list_id: currentList.id, name: '' })}
              onEditSection={(s) => setSectionEditor({ ...s })}
            />
          ) : (
            <>
              <View ref={listAreaRef}>
                {sections.map((section) => (
                  <View key={section.key}>
                    {section.title && (
                      <SectionHeader
                        title={section.title}
                        count={section.items.length || undefined}
                        color={section.overdue ? '#dc2626' : undefined}
                        right={section.overdue ? (
                          <AnimatedPressable onPress={rescheduleOverdue} haptic="light">
                            <Text style={styles.reschedule}>Reschedule to today</Text>
                          </AnimatedPressable>
                        ) : section.day ? (
                          <AnimatedPressable onPress={() => setAddOpen({ due_date: section.day })} haptic="light" hitSlop={8}>
                            <Ionicons name="add" size={20} color={colors.gray[400]} />
                          </AnimatedPressable>
                        ) : section.section ? (
                          <View style={styles.sectionActions}>
                            <AnimatedPressable onPress={() => setAddOpen({ list_id: currentList.id, section_id: section.section.id })} haptic="light" hitSlop={8}>
                              <Ionicons name="add" size={20} color={colors.gray[400]} />
                            </AnimatedPressable>
                            <AnimatedPressable onPress={() => setSectionEditor({ ...section.section })} haptic="light" hitSlop={8}>
                              <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[400]} />
                            </AnimatedPressable>
                          </View>
                        ) : null}
                      />
                    )}
                    {groupWithSubtasks(section.items, todos).map((g) => renderGroup(g, section.key))}
                    {section.day && section.items.length === 0 && (
                      <Text style={styles.freeDay}>Nothing planned</Text>
                    )}
                  </View>
                ))}
              </View>

              {allEmpty && view !== 'upcoming' && <EmptyHero {...emptyState} />}

              {currentList && !search && (
                <AnimatedPressable style={styles.addSection} onPress={() => setSectionEditor({ list_id: currentList.id, name: '' })} haptic="light">
                  <Ionicons name="add" size={18} color={colors.brand[600]} />
                  <Text style={styles.addSectionText}>Add section</Text>
                </AnimatedPressable>
              )}

              {doneItems.length > 0 && (
                <View style={{ marginTop: spacing.lg }}>
                  <AnimatedPressable style={styles.doneToggle} onPress={() => setShowDone((v) => !v)} haptic="light">
                    <Ionicons name={showDone ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gray[500]} />
                    <Text style={styles.doneToggleText}>Completed · {doneItems.length}</Text>
                  </AnimatedPressable>
                  {showDone && doneItems.map((t) => renderRow(t, { parentTitle: todos.find((p) => p.id === t.parent_id)?.title }))}
                </View>
              )}
            </>
          )}

          {view !== 'done' && (
            <Text style={styles.tip}>
              Tip: swipe right to complete, left to delete. Type @name to add it to someone’s list, +label to tag, for 2h to estimate.
            </Text>
          )}
        </ScrollView>
      )}

      {selectMode ? (
        <BulkBar
          count={selected.size}
          onComplete={bulk.complete}
          onDate={() => setBulkSheet('date')}
          onPriority={() => setBulkSheet('priority')}
          onMove={() => setBulkSheet('move')}
          onDuplicate={bulk.duplicate}
          onDelete={bulk.remove}
        />
      ) : (
        <Fab onPress={() => setAddOpen(true)} bottom={24 + insets.bottom} />
      )}

      <QuickAddSheet
        visible={!!addOpen}
        onClose={() => setAddOpen(false)}
        defaults={typeof addOpen === 'object' ? { ...quickAddDefaults, ...addOpen } : quickAddDefaults}
      />
      <TodoDetailSheet todoId={openTodoId} onClose={() => setOpenTodoId(null)} />
      <ShareToChatSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        heading={`Share “${viewTitle}”`}
        subheading={`${shareVisibleIds.length} to-do${shareVisibleIds.length === 1 ? '' : 's'} as a checklist card`}
        onSend={({ conversationIds, note }) => shareTodos({ conversationIds, todoIds: shareVisibleIds, title: viewTitle, note })}
      />
      <PickerSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={viewTitle} options={menuOptions} onPick={onMenu} />
      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onPick={(v) => { setView(v); setFiltersOpen(false); }}
        onEdit={(f) => { setFiltersOpen(false); setFilterEditor(f); }}
      />
      <FilterEditorSheet
        value={filterEditor}
        onClose={() => setFilterEditor(null)}
        onSave={async (data) => {
          try {
            const saved = await saveFilter(data);
            setFilterEditor(null);
            setView(`filter:${saved.id}`);
          } catch (err) {
            showToast({ message: err.response?.data?.error || 'Could not save the filter', tone: 'error' });
          }
        }}
        onDelete={async (data) => {
          const ok = await confirmDialog({ title: `Delete “${data.name}”?`, confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          await deleteFilter(data.id);
          setFilterEditor(null);
          if (view === `filter:${data.id}`) setView('today');
        }}
      />
      <ProductivitySheet visible={productivityOpen} onClose={() => setProductivityOpen(false)} />
      <NameSheet
        value={sectionEditor}
        title={sectionEditor?.id ? 'Rename section' : 'New section'}
        placeholder="Section name, e.g. This week"
        onClose={() => setSectionEditor(null)}
        onSave={async (data) => {
          try {
            if (data.id) await renameSection(data.id, data.name);
            else await createSection(data.list_id, data.name);
            setSectionEditor(null);
          } catch (err) {
            showToast({ message: err.response?.data?.error || 'Could not save the section', tone: 'error' });
          }
        }}
        onDelete={async (data) => {
          const ok = await confirmDialog({
            title: `Delete “${data.name}”?`,
            message: 'Its to-dos stay in the list, without a section.',
            confirmLabel: 'Delete',
            destructive: true,
          });
          if (!ok) return;
          await deleteSection(data.id);
          setSectionEditor(null);
        }}
      />
      {/* Bulk action sheets */}
      <DueDatePicker
        visible={bulkSheet === 'date'}
        onClose={() => setBulkSheet(null)}
        onChange={({ date, time }) => bulk.patch({ due_date: date, due_time: time }, date ? 'Date updated' : 'Date cleared')}
      />
      <PickerSheet
        visible={bulkSheet === 'priority'}
        onClose={() => setBulkSheet(null)}
        title="Set priority"
        options={[1, 2, 3, 4].map((p) => ({ key: p, label: PRIORITY[p].label, icon: 'flag' }))}
        onPick={(p) => bulk.patch({ priority: p }, `Priority set to P${p}`)}
      />
      <PickerSheet
        visible={bulkSheet === 'move'}
        onClose={() => setBulkSheet(null)}
        title="Move to"
        options={moveOptions}
        onPick={(key) => bulk.patch({ list_id: key === 'inbox' ? null : key }, 'Moved')}
      />
      {/* Board: move a card to another section */}
      <PickerSheet
        visible={!!moveCard}
        onClose={() => setMoveCard(null)}
        title="Move to section"
        options={[
          { key: 'none', label: 'No section', icon: 'remove-circle-outline', active: !moveCard?.section_id },
          ...listSections.map((s) => ({ key: s.id, label: s.name, icon: 'albums-outline', active: moveCard?.section_id === s.id })),
        ]}
        onPick={(key) => moveCard && updateTodo(moveCard.id, { section_id: key === 'none' ? null : key })}
      />
      <ListEditor
        value={listEditor}
        onClose={() => setListEditor(null)}
        onSave={async (data) => {
          try {
            if (data.id) await updateList(data.id, data);
            else {
              const created = await createList(data);
              setView(`list:${created.id}`);
            }
            setListEditor(null);
          } catch (err) {
            showToast({ message: err.response?.data?.error || 'Could not save the list', tone: 'error' });
          }
        }}
        onDelete={async (data) => {
          const ok = await confirmDialog({
            title: `Delete “${data.name}”?`,
            message: 'Its to-dos move to your Inbox.',
            confirmLabel: 'Delete',
            destructive: true,
          });
          if (!ok) return;
          await deleteList(data.id);
          setListEditor(null);
          setView('inbox');
        }}
      />
    </View>
  );
}

function ViewTab({ label, icon, count, active, color, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.full,
        backgroundColor: active ? color : colors.white,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? color : colors.gray[200],
      }}
    >
      {icon && <Ionicons name={icon} size={15} color={active ? '#fff' : color} />}
      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: active ? '#fff' : colors.gray[700], maxWidth: 140 }} numberOfLines={1}>{label}</Text>
      {count > 0 && (
        <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.85)' : colors.gray[400] }}>{count}</Text>
      )}
    </AnimatedPressable>
  );
}

function ListEditor({ value, onClose, onSave, onDelete }) {
  const colors = useColors();
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (value) setDraft(value); }, [value]);
  if (!draft) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;
  return (
    <BottomSheet visible={!!value} onClose={onClose} maxHeight={520} avoidKeyboard>
      <View style={{ paddingHorizontal: spacing.sm }}>
        <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.md }}>
          {draft.id ? 'Edit list' : 'New list'}
        </Text>
        <TextInput
          autoFocus={!draft.id}
          value={draft.name}
          onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
          placeholder="List name, e.g. Site visits"
          placeholderTextColor={colors.gray[400]}
          style={{
            backgroundColor: colors.gray[100], borderRadius: radius.lg, paddingHorizontal: spacing.md,
            paddingVertical: 12, fontSize: fontSize.md, color: colors.gray[900], outlineStyle: 'none',
          }}
        />
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm }}>ICON</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {LIST_EMOJIS.map((e) => (
            <AnimatedPressable
              key={e}
              onPress={() => setDraft((d) => ({ ...d, emoji: e }))}
              style={{
                width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                backgroundColor: draft.emoji === e ? colors.brand[100] : colors.gray[100],
                borderWidth: draft.emoji === e ? 2 : 0, borderColor: colors.brand[500],
              }}
            >
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md }}>
          {draft.id && (
            <AnimatedPressable
              onPress={() => onDelete(draft)}
              style={{ paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.red[50] }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.red[600]} />
            </AnimatedPressable>
          )}
          <AnimatedPressable
            disabled={!draft.name?.trim()}
            onPress={() => onSave({ ...draft, name: draft.name.trim() })}
            haptic="medium"
            style={{
              flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center',
              backgroundColor: colors.brand[600], opacity: draft.name?.trim() ? 1 : 0.4,
            }}
          >
            <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.base }}>{draft.id ? 'Save' : 'Create list'}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  ringText: { fontSize: 10, fontWeight: '800', color: colors.gray[700] },
  cancelBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { fontSize: fontSize.base, fontWeight: '700', color: colors.brand[600] },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: fontSize.base, color: colors.gray[900], outlineStyle: 'none' },
  tabsWrap: { flexGrow: 0 },
  tabs: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  content: { paddingHorizontal: spacing.lg },
  reschedule: { fontSize: fontSize.sm, fontWeight: '700', color: '#dc2626' },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  freeDay: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: spacing.sm, paddingLeft: spacing.xs },
  addSection: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  addSectionText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  doneToggleText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] },
  loadMore: { alignItems: 'center', paddingVertical: spacing.lg },
  loadMoreText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  dragHandle: { paddingTop: 2, paddingRight: 2, cursor: 'grab' },
  tip: { fontSize: fontSize.xs, color: colors.gray[400], textAlign: 'center', marginTop: spacing.xxl },
});
