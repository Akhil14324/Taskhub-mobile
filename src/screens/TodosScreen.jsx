import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Platform, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { useNotifications } from '../context/NotificationContext';
import { spacing, radius, fontSize } from '../theme/theme';
import api from '../api/client';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/BottomSheet';
import DueDatePicker from '../components/DueDatePicker';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import ShareToChatSheet from '../components/ShareToChatSheet';
import TodoTreeList from '../components/todos/TodoTreeList';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet, { TodoDetailBody } from '../components/todos/TodoDetailSheet';
import InlineQuickAdd from '../components/todos/InlineQuickAdd';
import FiltersSheet, { FilterEditorSheet } from '../components/todos/FiltersSheet';
import ProductivitySheet from '../components/todos/ProductivitySheet';
import BoardView from '../components/todos/BoardView';
import CalendarView from '../components/todos/CalendarView';
import TimelineChart from '../components/todos/TimelineChart';
import { openTemplates } from '../utils/events';
import BulkBar from '../components/todos/BulkBar';
import WorkSidebar from '../components/todos/WorkSidebar';
import PromptSheet from '../components/todos/PromptSheet';
import { useNowTick } from '../components/todos/TimeHealth';
import { PickerSheet, NameSheet } from '../components/todos/Pickers';
import { Chip, IconButton, EmptyHero, ProgressRing, ListGlyph, LIST_ICONS, PRIORITY } from '../components/kit';
import useWebReorder, { makeDraggable } from '../hooks/useWebReorder';
import useShortcuts from '../hooks/useShortcuts';
import * as SecureStore from '../utils/secureStorage';
import useIsDesktop, { useIsWide } from '../hooks/useBreakpoint';
import { todayYmd, addDays, formatDayHeader, WEEKDAYS, MONTHS_SHORT, toYmd, formatTime } from '../utils/dates';
import {
  BUILTIN_FILTERS, applyFilter, describeFilter, subtaskProgress, manualSort, descendantsOf,
} from '../utils/todoMeta';
import { STATUS } from '../utils/timeline';
import { showToast, confirmDialog } from '../utils/events';
import { glass } from '../theme/glass';

const BOARD_GROUPS = [
  { key: 'status', label: 'Status', icon: 'git-commit-outline' },
  { key: 'assignee', label: 'Person', icon: 'person-outline' },
  { key: 'priority', label: 'Priority', icon: 'flag-outline' },
];
const BOARD_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'on_hold', 'done'];

/** Open first, then finished; each keeps its existing (due date, priority) order. */
const openFirst = (items) => [...items.filter((t) => !t.is_done), ...items.filter((t) => t.is_done)];
const byBoardPos = (items) => [...items].sort((a, b) => {
  const ap = a.board_pos ?? 1e9;
  const bp = b.board_pos ?? 1e9;
  return ap - bp;
});

const LAYOUT_KEY = 'todos.layout';
const LAYOUTS = ['list', 'board', 'calendar', 'timeline'];

export default function TodosScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { approvalCount } = useNotifications();
  const desktop = useIsDesktop();
  const wide = useIsWide();
  const { width: windowWidth } = useWindowDimensions();
  const {
    todos, lists, sections: allSections, filters, businesses, labels, loading, fetchTodos, toggleTodo, deleteTodo, deleteTodos,
    updateTodo, duplicateTodo, createList, updateList, deleteList, createSection, renameSection, deleteSection, saveFilter,
    deleteFilter, shareTodos, reorderTodos, fetchCompleted, mergeTodos, setTodoStatus, assignTodoTo, requestDelete,
    saveBoardOrder,
  } = useTodos();

  // today | upcoming | inbox | shared | done | list:<id> | filter:<id> | label:<name> | biz:<id>
  const [view, setView] = useState(() => (route.params?.business_id ? `biz:${route.params.business_id}` : (user?.preferences?.defaultView || 'today')));
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openTodoId, setOpenTodoId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [listEditor, setListEditor] = useState(null);
  const [sectionEditor, setSectionEditor] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterEditor, setFilterEditor] = useState(null);
  const [productivityOpen, setProductivityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [layout, setLayout] = useState('list'); // list | board | calendar | timeline
  // The person's own choice, remembered on this device. A view that cannot show it falls back to the
  // list for now without forgetting the choice.
  useEffect(() => {
    SecureStore.getItemAsync(LAYOUT_KEY).then((v) => { if (LAYOUTS.includes(v)) setLayout(v); }).catch(() => {});
  }, []);
  const chooseLayout = useCallback((key) => {
    setLayout(key);
    SecureStore.setItemAsync(LAYOUT_KEY, key).catch(() => {});
  }, []);
  const [boardGroup, setBoardGroup] = useState('status');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkSheet, setBulkSheet] = useState(null); // 'date' | 'priority' | 'move'
  const [moveCard, setMoveCard] = useState(null);
  const [history, setHistory] = useState({ items: [], hasMore: false, loading: false });
  const [gantt, setGantt] = useState({ data: null, loading: false });
  const [weeks, setWeeks] = useState(6);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [priorityFor, setPriorityFor] = useState(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [scope, setScope] = useState(() => (route.params?.business_id ? 'business' : 'mine'));
  const now = useNowTick(60000);
  const scrollRef = useRef(null);
  const inlineAddRef = useRef(null);
  const simpleView = user?.preferences?.viewMode === 'simple';
  const listAreaRef = useRef(null);
  const meId = user?.id;
  const today = todayYmd();

  const bizId = view.startsWith('biz:') ? Number(view.slice(4)) : null;
  const business = bizId ? businesses.find((b) => b.id === bizId) || null : null;

  // Deep links: from a notification (highlightId), from a business or person card (business_id, create).
  useEffect(() => {
    const id = Number(route.params?.highlightId);
    if (!id) return;
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      setView(todo.business_id ? `biz:${todo.business_id}`
        : todo.list_id ? `list:${todo.list_id}`
          : todo.due_date && todo.due_date <= today ? 'today' : 'inbox');
      setScope(todo.business_id ? 'business' : 'mine');
      setHighlightId(id);
      setFocusId(id);
      setOpenTodoId(id);
      navigation.setParams({ highlightId: undefined });
      setTimeout(() => setHighlightId(null), 2500);
    }
  }, [route.params?.highlightId, todos, navigation, today, desktop]);

  useEffect(() => {
    const id = Number(route.params?.business_id);
    if (!id) return;
    setView(`biz:${id}`);
    setScope('business');
    navigation.setParams({ business_id: undefined });
  }, [route.params?.business_id, navigation]);

  useEffect(() => {
    const create = route.params?.create;
    if (!create) return;
    setAddOpen(typeof create === 'object' ? { business_id: create.business_id, assign_to: create.assigned_user_id } : true);
    navigation.setParams({ create: undefined });
  }, [route.params?.create, navigation]);

  // ---- derived collections -------------------------------------------------
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const personal = useMemo(() => todos.filter((t) => !t.business_id), [todos]);
  // What lands in my own date views: my personal to-dos plus business work given to me.
  const mine = useMemo(() => todos.filter((t) => !t.business_id || (t.assignee_id === meId && t.review_state === 'accepted')), [todos, meId]);
  const open = useMemo(() => mine.filter((t) => !t.is_done), [mine]);
  const openPersonal = useMemo(() => personal.filter((t) => !t.is_done), [personal]);

  const counts = useMemo(() => ({
    today: open.filter((t) => t.due_date && t.due_date <= today).length,
    inbox: openPersonal.filter((t) => !t.list_id && !t.parent_id).length,
    shared: openPersonal.filter((t) => (t.members || []).length > 1).length,
    assigned: openPersonal.filter((t) => t.created_by !== meId && !t.parent_id).length,
    lists: Object.fromEntries(lists.map((l) => [l.id, openPersonal.filter((t) => t.list_id === l.id && !t.parent_id).length])),
  }), [open, openPersonal, lists, today, meId]);

  const bizCounts = useMemo(() => {
    const out = {};
    businesses.forEach((b) => {
      out[b.id] = todos.filter((t) => t.business_id === b.id && !t.parent_id && !t.is_done && t.review_state !== 'rejected').length;
    });
    return out;
  }, [businesses, todos]);

  const hasBusiness = businesses.length > 0;
  const currentList = view.startsWith('list:') ? listById.get(Number(view.slice(5))) : null;
  const listSections = useMemo(
    () => (currentList ? allSections.filter((s) => s.list_id === currentList.id) : []),
    [allSections, currentList]
  );
  const inboxSections = useMemo(() => allSections.filter((s) => !s.list_id), [allSections]);
  // Sections of the place being shown: a list's own, or the Inbox's.
  const placeSections = view === 'inbox' ? inboxSections : listSections;
  const sectioned = !!currentList || view === 'inbox';
  const filterKey = view.startsWith('filter:') ? view.slice(7) : null;
  const activeFilter = filterKey
    ? (BUILTIN_FILTERS.find((b) => b.id === filterKey) || filters.find((f) => String(f.id) === filterKey) || null)
    : null;
  const labelName = view.startsWith('label:') ? view.slice(6) : null;

  // Layouts a view can be shown in.
  const canBoard = view !== 'done';
  const canCalendar = view !== 'done' && !simpleView;
  const canTimeline = !simpleView && (!!business || view === 'today' || view === 'upcoming' || !!currentList);
  const effectiveLayout = layout === 'board' && canBoard ? 'board'
    : layout === 'calendar' && canCalendar ? 'calendar'
      : layout === 'timeline' && canTimeline ? 'timeline' : 'list';
  const onBoard = effectiveLayout === 'board' && !search;
  const onCalendar = effectiveLayout === 'calendar' && !search;
  const onTimeline = effectiveLayout === 'timeline';

  const viewTitle = business ? business.name
    : view === 'today' ? 'Today'
      : view === 'upcoming' ? 'Upcoming'
        : view === 'inbox' ? 'Inbox'
          : view === 'shared' ? 'Shared with me'
            : view === 'assigned' ? 'Assigned to me'
            : view === 'done' ? 'Completed'
              : activeFilter ? activeFilter.name
                : labelName ? `+${labelName}`
                  : currentList ? currentList.name : 'To-do';

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodos();
    if (view === 'done') await loadHistory(true);
    setRefreshing(false);
  };

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

  // ---- timeline data -------------------------------------------------------
  const loadGantt = useCallback(async () => {
    setGantt((g) => ({ ...g, loading: true }));
    try {
      const to = addDays(today, weeks * 7 * 0.4 | 0);
      const from = addDays(today, -Math.round(weeks * 7 * 0.6));
      const res = await api.get('/todos/gantt', {
        params: { from, to, ...(bizId ? { business_id: bizId } : {}) },
        __skipOops: true,
      });
      setGantt({ data: res.data, loading: false });
    } catch {
      setGantt((g) => ({ ...g, loading: false }));
    }
  }, [bizId, weeks, today]);

  useEffect(() => {
    if (onTimeline) loadGantt();
  }, [onTimeline, loadGantt, todos.length]);

  // ---- the rows of the current view ----------------------------------------
  const { sections, doneItems, visibleIds, manual } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (t) => !q
      || t.title.toLowerCase().includes(q)
      || (t.notes || '').toLowerCase().includes(q)
      || (t.assignee_name || '').toLowerCase().includes(q)
      || (t.labels || []).some((l) => l.includes(q.replace(/^\+/, '')));
    const sectionsOut = [];
    let done = [];
    let manualOrder = false;

    if (q) {
      const pool = bizId ? todos.filter((t) => t.business_id === bizId) : todos;
      sectionsOut.push({ key: 'results', title: `Results for “${search.trim()}”`, items: pool.filter((t) => !t.is_done && match(t)) });
      done = pool.filter((t) => t.is_done && match(t));
    } else if (business) {
      const items = todos.filter((t) => t.business_id === bizId);
      const roots = items.filter((t) => !t.parent_id);
      const proposed = roots.filter((t) => t.review_state !== 'accepted');
      const live = roots.filter((t) => t.review_state === 'accepted');
      const withKids = (list) => {
        const out = [];
        list.forEach((r) => { out.push(r, ...descendantsOf(r.id, items)); });
        return out;
      };
      if (proposed.length) {
        sectionsOut.push({ key: 'proposed', title: 'Awaiting review', items: withKids(proposed), count: proposed.length });
      }
      const overdue = live.filter((t) => !t.is_done && t.due_date && t.due_date < today);
      if (overdue.length) sectionsOut.push({ key: 'overdue', title: 'Overdue', items: withKids(overdue), count: overdue.length, overdue: true });
      const dates = [...new Set(live.filter((t) => t.due_date && t.due_date >= today).map((t) => t.due_date))].sort();
      if (!dates.includes(today)) dates.unshift(today);
      dates.forEach((d) => {
        const dayItems = openFirst(live.filter((t) => t.due_date === d));
        if (dayItems.length || d === today) {
          sectionsOut.push({ key: `d:${d}`, title: formatDayHeader(d), items: withKids(dayItems), count: dayItems.length, day: d, empty: d === today ? 'Nothing planned for today' : undefined });
        }
      });
      const undated = openFirst(live.filter((t) => !t.due_date && (!t.is_done || (t.done_at && toYmd(new Date(t.done_at)) >= addDays(today, -7)))));
      if (undated.length) sectionsOut.push({ key: 'nodate', title: 'No date', items: withKids(undated), count: undated.length });
      done = live.filter((t) => t.is_done && ((t.due_date && t.due_date < today) || (!t.due_date && t.done_at && toYmd(new Date(t.done_at)) < addDays(today, -7))));
    } else if (view === 'today') {
      const overdue = open.filter((t) => t.due_date && t.due_date < today && match(t));
      const todayItems = openFirst(mine.filter((t) => match(t) && (
        (t.due_date === today) || (t.is_done && !t.due_date && t.done_at && toYmd(new Date(t.done_at)) === today)
      )));
      if (overdue.length) sectionsOut.push({ key: 'overdue', title: 'Overdue', items: overdue, overdue: true });
      sectionsOut.push({ key: 'today', title: formatDayHeader(today), items: todayItems, day: today });
    } else if (view === 'upcoming') {
      const byDay = new Map();
      for (let i = 0; i < 14; i++) byDay.set(addDays(today, i), []);
      const later = [];
      mine.filter((t) => match(t) && t.due_date && t.due_date >= today).forEach((t) => {
        if (byDay.has(t.due_date)) byDay.get(t.due_date).push(t);
        else if (!t.is_done) later.push(t);
      });
      byDay.forEach((items, day) => {
        if (items.length || day === today || day === addDays(today, 1)) {
          sectionsOut.push({ key: day, title: formatDayHeader(day), items: openFirst(items), day });
        }
      });
      if (later.length) sectionsOut.push({ key: 'later', title: 'Later', items: later });
    } else if (view === 'inbox') {
      manualOrder = true;
      const inInbox = openPersonal.filter((t) => !t.list_id && match(t));
      if (inboxSections.length === 0) {
        sectionsOut.push({ key: 'inbox', title: null, items: manualSort(inInbox) });
      } else {
        sectionsOut.push({ key: 'nosec', title: null, items: manualSort(inInbox.filter((t) => !t.section_id)) });
        inboxSections.forEach((sec) => {
          sectionsOut.push({ key: `sec:${sec.id}`, title: sec.name, section: sec, items: manualSort(inInbox.filter((t) => t.section_id === sec.id)) });
        });
      }
      done = personal.filter((t) => t.is_done && !t.list_id);
    } else if (view === 'shared') {
      const shared = openPersonal.filter((t) => (t.members || []).length > 1 && match(t));
      const fromOthers = shared.filter((t) => t.created_by !== meId);
      const mineShared = shared.filter((t) => t.created_by === meId);
      if (fromOthers.length) sectionsOut.push({ key: 'from', title: 'Assigned to me by others', items: fromOthers });
      if (mineShared.length) sectionsOut.push({ key: 'mine', title: 'I shared with others', items: mineShared });
      if (!sectionsOut.length) sectionsOut.push({ key: 'empty', title: null, items: [] });
      done = personal.filter((t) => t.is_done && (t.members || []).length > 1);
    } else if (view === 'assigned') {
      const fromOthers = openPersonal.filter((t) => t.created_by !== meId && match(t));
      const byPerson = new Map();
      fromOthers.forEach((t) => {
        const key = t.created_by_name || 'Someone';
        if (!byPerson.has(key)) byPerson.set(key, []);
        byPerson.get(key).push(t);
      });
      byPerson.forEach((items, name) => sectionsOut.push({ key: `from:${name}`, title: `From ${name}`, items }));
      if (!sectionsOut.length) sectionsOut.push({ key: 'empty', title: null, items: [] });
      done = personal.filter((t) => t.is_done && t.created_by !== meId);
    } else if (currentList) {
      manualOrder = true;
      const inList = openPersonal.filter((t) => t.list_id === currentList.id && match(t));
      if (listSections.length === 0) {
        sectionsOut.push({ key: 'list', title: null, items: manualSort(inList) });
      } else {
        sectionsOut.push({ key: 'nosec', title: null, items: manualSort(inList.filter((t) => !t.section_id)) });
        listSections.forEach((s) => {
          sectionsOut.push({ key: `sec:${s.id}`, title: s.name, section: s, items: manualSort(inList.filter((t) => t.section_id === s.id)) });
        });
      }
      done = personal.filter((t) => t.is_done && t.list_id === currentList.id);
    } else if (activeFilter) {
      sectionsOut.push({ key: 'filter', title: null, items: applyFilter(open.filter(match), activeFilter.config, { userId: meId, today }) });
    } else if (labelName) {
      sectionsOut.push({ key: 'label', title: null, items: open.filter((t) => (t.labels || []).includes(labelName) && match(t)) });
      done = mine.filter((t) => t.is_done && (t.labels || []).includes(labelName));
    }
    const ids = sectionsOut.flatMap((s) => s.items.filter((t) => !t.parent_id || !s.items.some((p) => p.id === t.parent_id)).map((t) => t.id));
    return { sections: sectionsOut, doneItems: done, visibleIds: ids, manual: manualOrder && !q };
  }, [todos, mine, open, openPersonal, personal, view, today, currentList, listSections, inboxSections, activeFilter, labelName, search, meId, business, bizId]);

  const todayItems = useMemo(() => mine.filter((t) => t.due_date === today), [mine, today]);
  const todayDone = todayItems.filter((t) => t.is_done).length;
  const todayPercent = todayItems.length ? Math.round((todayDone / todayItems.length) * 100) : 0;

  const rescheduleOverdue = async () => {
    const overdue = open.filter((t) => t.due_date && t.due_date < today && (t.permissions?.can_edit ?? true));
    await Promise.all(overdue.map((t) => updateTodo(t.id, { due_date: today }).catch(() => null)));
    showToast({ message: `Moved ${overdue.length} to today`, tone: 'success', icon: 'calendar' });
  };

  const quickAddDefaults = business ? { business_id: business.id, due_date: undefined }
    : view === 'today' ? { due_date: today }
      : currentList ? { list_id: currentList.id }
        : labelName ? { labels: [labelName] } : {};

  // ---- selection (bulk actions) --------------------------------------------
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
      await Promise.all(selectedTodos.filter((t) => !t.business_id).map((t) => duplicateTodo(t, { silent: true }).catch(() => null)));
      showToast({ message: 'Duplicated', tone: 'success', icon: 'copy' });
      exitSelect();
    },
    remove: async () => {
      const deletable = selectedTodos.filter((t) => !t.business_id || t.permissions?.can_delete);
      const ok = await confirmDialog({
        title: `Delete ${deletable.length} item${deletable.length === 1 ? '' : 's'}?`,
        message: 'Personal ones someone else created are only removed from your list. Business tasks you cannot delete are skipped.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      await deleteTodos(deletable);
      exitSelect();
    },
  };

  // ---- ordering by drag (desktop web) --------------------------------------
  const onReorder = useCallback((ids) => reorderTodos(ids), [reorderTodos]);
  useWebReorder(listAreaRef, { enabled: manual && !selectMode && !onBoard && !onTimeline && !loading && view !== 'done', onReorder });

  const toggleCollapse = useCallback((todo) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(todo.id)) next.delete(todo.id);
      else next.add(todo.id);
      return next;
    });
  }, []);

  const requestRowDelete = useCallback((todo) => {
    if (todo.business_id && !todo.permissions?.can_delete) {
      if (todo.permissions?.can_request_delete) {
        setDeletePrompt({
          todo, title: 'Ask for this to be deleted', hint: 'It goes up the chain of command for a decision.',
          placeholder: 'Why should it be deleted?', confirmLabel: 'Send request',
        });
      } else {
        showToast({ message: 'You cannot delete this', tone: 'error' });
      }
      return;
    }
    deleteTodo(todo);
    if (openTodoId === todo.id) setOpenTodoId(null);
  }, [deleteTodo, openTodoId]);

  const openTodo = useCallback((item) => {
    setOpenTodoId(item.id);
    setFocusId(item.id);
  }, []);

  const dragHandle = Platform.OS === 'web' && manual && !selectMode ? (
    <View ref={makeDraggable} dataSet={{ dragHandle: '1' }} style={styles.dragHandle}>
      <Ionicons name="reorder-two" size={18} color={colors.gray[300]} />
    </View>
  ) : null;

  const rowProps = useMemo(() => ({
    showList: view === 'today' || view === 'upcoming' || view === 'shared' || view === 'assigned' || !!search || !!activeFilter || !!labelName,
    showBusiness: !business,
    currentUserId: meId,
    highlightId,
    activeId: openTodoId || focusId,
    onToggle: toggleTodo,
    onOpen: openTodo,
    onDelete: requestRowDelete,
    selectMode,
    selected,
    onSelect: toggleSelected,
    now,
  }), [view, search, activeFilter, labelName, business, meId, highlightId, openTodoId, focusId, toggleTodo, openTodo, requestRowDelete, selectMode, selected, toggleSelected, now]);

  // One clear next step instead of a blank page.
  const emptyAction = search || view === 'done' ? undefined : (
    <AnimatedPressable onPress={() => setAddOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand[600], borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: spacing.xl }}>
      <Ionicons name="add" size={18} color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.base }}>Add your first to-do</Text>
    </AnimatedPressable>
  );
  const allEmpty = sections.every((s) => s.items.length === 0);
  const emptyState = (() => {
    if (search) return { icon: 'search', title: 'Nothing found', message: 'Try another word.' };
    if (business) {
      return { icon: 'briefcase', title: `No tasks for ${business.name}`, message: business.can_manage ? 'Add a task and give it to someone.' : 'Propose a task. A manager will review it.' };
    }
    if (view === 'today') {
      return todayDone
        ? { icon: 'trophy', title: 'All done for today', message: `${todayDone} completed. Enjoy the rest of your day.` }
        : { icon: 'sunny', title: 'A clear day', message: 'Add what you want to get done today. Try “Call supplier 4pm p1”.' };
    }
    if (view === 'assigned') return { icon: 'person-add', title: 'Nothing assigned to you', message: 'When someone above you assigns you a to-do, it shows up here.' };
    if (view === 'shared') return { icon: 'people', title: 'Nothing shared yet', message: 'Type @name while adding a to-do and it lands in their list too.' };
    if (view === 'upcoming') return { icon: 'calendar', title: 'Your schedule is clear', message: 'Plan ahead. Add a to-do with a date.' };
    if (activeFilter) return { icon: 'funnel', title: 'No matches', message: 'Nothing open fits this filter right now.' };
    if (labelName) return { icon: 'pricetag', title: 'No open to-dos', message: `Nothing is tagged +${labelName} at the moment.` };
    return { icon: 'file-tray', title: 'All clear', message: 'Tap + to add a to-do.' };
  })();

  const shareVisibleIds = view === 'done'
    ? history.items.map((t) => t.id)
    : visibleIds.length ? visibleIds : doneItems.map((t) => t.id);

  // ---- board ---------------------------------------------------------------
  const boardColumns = useMemo(() => {
    if (!onBoard) return [];
    if (sectioned) {
      const items = personal.filter((t) => (currentList ? t.list_id === currentList.id : !t.list_id) && !t.parent_id);
      const colItems = (sectionId) => byBoardPos(openFirst(items.filter((t) => (t.section_id || null) === sectionId)));
      const cols = [];
      if (placeSections.length === 0 || items.some((t) => !t.section_id)) {
        cols.push({ key: 'none', title: placeSections.length ? 'No section' : (currentList ? currentList.name : 'Inbox'), items: colItems(null) });
      }
      placeSections.forEach((s) => cols.push({ key: `s${s.id}`, title: s.name, section: s, items: colItems(s.id) }));
      return cols;
    }
    if (!business) {
      // Today, Upcoming, filters and labels: the same work laid out by where it stands.
      const pool = (view === 'assigned' ? openPersonal.filter((t) => t.created_by !== meId)
        : view === 'shared' ? openPersonal.filter((t) => (t.members || []).length > 1)
        : activeFilter ? applyFilter(open, activeFilter.config, { userId: meId, today })
          : labelName ? open.filter((t) => (t.labels || []).includes(labelName))
            : view === 'today' ? mine.filter((t) => !t.is_done && t.due_date && t.due_date <= today)
              : view === 'upcoming' ? open.filter((t) => t.due_date && t.due_date > today)
                : open).filter((t) => !t.parent_id);
      const recent = addDays(today, -14);
      const doneAll = mine.filter((t) => t.is_done && !t.parent_id && (!t.done_at || toYmd(new Date(t.done_at)) >= recent));
      // The Done column always keeps what was finished lately (struck out), so a card dropped there stays visible.
      const doneRecent = view === 'today' ? doneAll.filter((t) => !t.due_date || t.due_date <= today || (t.done_at && toYmd(new Date(t.done_at)) === today))
        : labelName ? doneAll.filter((t) => (t.labels || []).includes(labelName))
          : view === 'shared' ? doneAll.filter((t) => (t.members || []).length > 1)
            : view === 'assigned' ? doneAll.filter((t) => t.created_by !== meId)
              : doneAll;
      return ['todo', 'in_progress', 'blocked', 'done'].map((st) => ({
        key: st,
        title: STATUS[st].label,
        icon: STATUS[st].icon,
        items: byBoardPos(st === 'done' ? doneRecent : pool.filter((t) => (t.status || 'todo') === st)),
      }));
    }
    // Business board.
    const items = todos.filter((t) => t.business_id === bizId && !t.parent_id && t.review_state === 'accepted');
    if (boardGroup === 'assignee') {
      const people = new Map();
      items.forEach((t) => { if (t.assignee_id) people.set(t.assignee_id, t.assignee_name || 'Someone'); });
      const cols = [{ key: 'open', title: 'Open to everyone', icon: 'people-outline', items: byBoardPos(openFirst(items.filter((t) => !t.assignee_id))) }];
      [...people.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
        cols.push({ key: `u${id}`, title: id === meId ? `${name} (you)` : name, icon: 'person-outline', items: byBoardPos(openFirst(items.filter((t) => t.assignee_id === id))) });
      });
      return cols;
    }
    if (boardGroup === 'priority') {
      return [1, 2, 3, 4].map((p) => ({ key: `p${p}`, title: PRIORITY[p].label, icon: 'flag-outline', items: byBoardPos(openFirst(items.filter((t) => t.priority === p))) }));
    }
    const recentDone = addDays(today, -14);
    return BOARD_STATUSES.map((s) => ({
      key: s,
      title: STATUS[s].label,
      icon: STATUS[s].icon,
      canAdd: s === 'todo' && true,
      items: byBoardPos(items.filter((t) => (s === 'done'
        ? t.is_done && (!t.done_at || toYmd(new Date(t.done_at)) >= recentDone)
        : !t.is_done && t.status === s))),
    }));
  }, [onBoard, sectioned, currentList, placeSections, personal, mine, open, openPersonal, view, activeFilter, labelName, business, todos, bizId, boardGroup, meId, today]);

  // ---- calendar ------------------------------------------------------------
  const calendarItems = useMemo(() => {
    if (!onCalendar) return [];
    if (business) return todos.filter((t) => t.business_id === bizId && !t.parent_id && t.review_state === 'accepted');
    const notNested = (t) => !t.parent_id;
    if (currentList) return personal.filter((t) => t.list_id === currentList.id && notNested(t));
    if (view === 'inbox') return personal.filter((t) => !t.list_id && notNested(t));
    if (view === 'shared') return personal.filter((t) => (t.members || []).length > 1 && notNested(t));
    if (view === 'assigned') return personal.filter((t) => t.created_by !== meId && notNested(t));
    if (activeFilter) return applyFilter(open, activeFilter.config, { userId: meId, today }).filter(notNested);
    if (labelName) return mine.filter((t) => (t.labels || []).includes(labelName) && notNested(t));
    return mine.filter(notNested);
  }, [onCalendar, business, bizId, todos, personal, mine, open, currentList, view, activeFilter, labelName, meId, today]);

  const colByKey = useMemo(() => new Map(boardColumns.map((c) => [String(c.key), c])), [boardColumns]);

  /** Dropping a card in another column: what that means depends on how the board is grouped. */
  const applyBoardMove = useCallback(async (todoId, colKey) => {
    const t = todos.find((x) => x.id === todoId);
    if (!t) return;
    try {
      if (sectioned) {
        await updateTodo(t.id, { section_id: colKey === 'none' ? null : Number(String(colKey).slice(1)) });
      } else if (business && boardGroup === 'assignee') {
        if (colKey === 'open') await updateTodo(t.id, { assigned_user_id: null });
        else await assignTodoTo(t.id, Number(String(colKey).slice(1)));
      } else if (business && boardGroup === 'priority') {
        await updateTodo(t.id, { priority: Number(String(colKey).slice(1)) });
      } else if (colKey === 'done') {
        if (!t.is_done) await toggleTodo(t);
      } else if (colKey === 'blocked') {
        showToast({ message: 'Open the task and raise a blocker to block it', icon: 'hand-left' });
      } else if (colKey === 'in_review') {
        showToast({ message: 'Finishing a task that needs review sends it to review', icon: 'eye' });
      } else {
        if (t.is_done) await toggleTodo(t);
        if (t.status !== colKey) await setTodoStatus(t, colKey);
      }
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'You cannot move that', tone: 'error' });
      fetchTodos();
    }
  }, [todos, sectioned, business, boardGroup, updateTodo, assignTodoTo, toggleTodo, setTodoStatus, fetchTodos]);

  const onBoardDrop = useCallback(async (todoId, colKey, ids) => {
    await applyBoardMove(todoId, colKey);
    if (ids?.length) saveBoardOrder(ids);
  }, [applyBoardMove, saveBoardOrder]);

  const onBoardReorder = useCallback((ids) => saveBoardOrder(ids), [saveBoardOrder]);

  // ---- keyboard shortcuts (desktop) ----------------------------------------
  const flat = visibleIds;
  const stepFocus = (delta) => {
    if (!flat.length) return;
    const i = flat.indexOf(focusId);
    const next = flat[Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + delta))];
    setFocusId(next);
    if (openTodoId && wide) setOpenTodoId(next);
  };
  const focused = todos.find((t) => t.id === focusId);
  const setLayoutKey = (key, ok) => { if (ok) chooseLayout(key); };

  useShortcuts({
    'todo.quickAdd': () => (inlineAddRef.current ? inlineAddRef.current.focus() : setAddOpen(true)),
    'todo.new': () => setAddOpen(true),
    'todo.search': () => { setSearching(true); },
    'todo.sidebar': () => setSidebarHidden((v) => !v),
    'todo.next': () => stepFocus(1),
    'todo.prev': () => stepFocus(-1),
    'todo.open': () => { if (focused) openTodo(focused); else return false; return undefined; },
    'todo.complete': () => { if (focused) toggleTodo(focused); },
    'todo.subtask': () => { if (focused?.permissions?.can_add_subtask !== false && focused) setAddOpen({ parent_id: focused.id }); },
    'todo.due': () => { if (focused) openTodo(focused); },
    'todo.delete': () => { if (focused && !openTodoId) requestRowDelete(focused); else return false; return undefined; },
    'todo.p1': () => focused && updateTodo(focused.id, { priority: 1 }),
    'todo.p2': () => focused && updateTodo(focused.id, { priority: 2 }),
    'todo.p3': () => focused && updateTodo(focused.id, { priority: 3 }),
    'todo.p4': () => focused && updateTodo(focused.id, { priority: 4 }),
    Escape: () => {
      if (openTodoId) setOpenTodoId(null);
      else if (searching) { setSearching(false); setSearch(''); } else if (selectMode) exitSelect();
      else setFocusId(null);
      return undefined;
    },
    'view.list': () => setLayoutKey('list', true),
    'view.board': () => setLayoutKey('board', canBoard),
    'view.calendar': () => setLayoutKey('calendar', canCalendar),
    'view.timeline': () => setLayoutKey('timeline', canTimeline),
  }, desktop);

  // ---- overflow menu -------------------------------------------------------
  const menuOptions = [
    { key: 'filters', label: 'Filters and shared with me', icon: 'funnel-outline' },
    { key: 'templates', label: 'Start from a template', icon: 'copy-outline' },
    { key: 'select', label: 'Select to-dos', icon: 'checkbox-outline' },
    { key: 'productivity', label: 'Productivity and daily goal', icon: 'stats-chart-outline' },
    { key: 'share', label: 'Share this view to chat', icon: 'paper-plane-outline' },
    ...(sectioned ? [{ key: 'section', label: 'Add section', icon: 'albums-outline' }] : []),
    ...(currentList ? [{ key: 'edit', label: 'Edit list', icon: 'create-outline' }] : []),
    ...(typeof activeFilter?.id === 'number' ? [{ key: 'editFilter', label: 'Edit filter', icon: 'create-outline' }] : []),
  ];
  const onMenu = (key) => {
    if (key === 'filters') setFiltersOpen(true);
    else if (key === 'templates') openTemplates({ business_id: bizId || undefined });
    else if (key === 'select') setSelectMode(true);
    else if (key === 'productivity') setProductivityOpen(true);
    else if (key === 'share') (shareVisibleIds.length ? setShareOpen(true) : showToast({ message: 'Nothing to share here yet' }));
    else if (key === 'section') setSectionEditor({ list_id: currentList?.id || null, name: '' });
    else if (key === 'edit') setListEditor({ ...currentList });
    else if (key === 'editFilter') setFilterEditor(activeFilter);
  };

  const moveOptions = [
    { key: 'inbox', label: 'Inbox', icon: 'file-tray' },
    ...lists.map((l) => ({ key: l.id, label: l.name, icon: 'albums-outline' })),
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
  const showScopeSwitch = hasBusiness && !desktop;
  const subtitle = selectMode ? 'Tap to-dos to select them'
    : business ? `${bizCounts[business.id] || 0} open · ${business.can_manage ? 'You manage this business' : 'Everyone here sees these tasks'}`
      : view === 'today' ? `${WEEKDAYS[new Date().getDay()]}, ${new Date().getDate()} ${MONTHS_SHORT[new Date().getMonth()]} · ${counts.today} left`
        : view === 'done' ? `${history.items.length} completed${history.hasMore ? '+' : ''}`
          : activeFilter ? describeFilter(activeFilter.config, lists)
            : `${visibleIds.length} to-do${visibleIds.length === 1 ? '' : 's'}`;

  const sectionRight = (section) => {
    if (section.overdue && !business) {
      return (
        <AnimatedPressable onPress={rescheduleOverdue}>
          <Text style={styles.reschedule}>Reschedule to today</Text>
        </AnimatedPressable>
      );
    }
    if (section.day) {
      return (
        <AnimatedPressable onPress={() => setAddOpen({ ...(business ? { business_id: business.id } : {}), due_date: section.day })} hitSlop={8}>
          <Ionicons name="add" size={20} color={colors.gray[400]} />
        </AnimatedPressable>
      );
    }
    if (section.section) {
      return (
        <View style={styles.sectionActions}>
          <AnimatedPressable onPress={() => setAddOpen({ list_id: currentList?.id, section_id: section.section.id })} hitSlop={8}>
            <Ionicons name="add" size={20} color={colors.gray[400]} />
          </AnimatedPressable>
          <AnimatedPressable onPress={() => setSectionEditor({ ...section.section })} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[400]} />
          </AnimatedPressable>
        </View>
      );
    }
    return null;
  };
  const sectionsWithRight = sections.map((s) => ({ ...s, color: s.overdue ? colors.brand[600] : undefined, right: sectionRight(s) }));

  const layoutSwitch = (canBoard || canCalendar || canTimeline) ? (
    <View style={styles.layoutSwitch}>
      <LayoutButton icon="list" label="List" active={effectiveLayout === 'list'} onPress={() => chooseLayout('list')} />
      {canBoard && <LayoutButton icon="grid" label="Board" active={effectiveLayout === 'board'} onPress={() => chooseLayout('board')} />}
      {canCalendar && <LayoutButton icon="calendar" label="Calendar" active={effectiveLayout === 'calendar'} onPress={() => chooseLayout('calendar')} />}
      {canTimeline && <LayoutButton icon="analytics" label="Timeline" active={effectiveLayout === 'timeline'} onPress={() => chooseLayout('timeline')} />}
    </View>
  ) : null;

  // ---- parts ---------------------------------------------------------------
  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{selectMode ? `${selected.size} selected` : viewTitle}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {selectMode ? (
        <AnimatedPressable onPress={exitSelect} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
      ) : (
        <>
          {view === 'today' && todayItems.length > 0 && (
            <AnimatedPressable onPress={() => setProductivityOpen(true)} accessibilityLabel="Productivity">
              <ProgressRing percent={todayPercent} size={40} stroke={4} color={colors.brand[600]}>
                <Text style={styles.ringText}>{todayPercent}%</Text>
              </ProgressRing>
            </AnimatedPressable>
          )}
          {desktop && layoutSwitch}
          <IconButton icon={searching ? 'close' : 'search'} onPress={() => { setSearching((s) => !s); setSearch(''); }} accessibilityLabel="Search" />
          <IconButton icon="ellipsis-horizontal" onPress={() => setMenuOpen(true)} accessibilityLabel="More options" />
        </>
      )}
    </View>
  );

  const searchBox = searching && !selectMode ? (
    <View {...glass('card')} style={styles.searchBox}>
      <Ionicons name="search" size={16} color={colors.gray[400]} />
      <TextInput
        autoFocus
        value={search}
        onChangeText={setSearch}
        placeholder={business ? `Search ${business.name}` : 'Search to-dos, notes, people and +labels'}
        placeholderTextColor={colors.gray[400]}
        style={styles.searchInput}
      />
    </View>
  ) : null;

  const mobileNav = !desktop ? (
    <View>
      {showScopeSwitch && (
        <View style={styles.segment}>
          {[{ key: 'mine', label: 'My to-dos', icon: 'person-outline' }, { key: 'business', label: 'Business', icon: 'briefcase-outline' }].map((s) => (
            <AnimatedPressable
              key={s.key}
              style={[styles.segmentBtn, scope === s.key && styles.segmentOn]}
              onPress={() => {
                setScope(s.key);
                if (s.key === 'business' && !bizId) setView(`biz:${businesses[0].id}`);
                if (s.key === 'mine' && bizId) setView('today');
              }}
            >
              <Ionicons name={s.icon} size={15} color={scope === s.key ? colors.brand[700] : colors.gray[500]} />
              <Text style={[styles.segmentText, scope === s.key && styles.segmentTextOn]}>{s.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsWrap}>
        {scope === 'business' && hasBusiness ? (
          businesses.map((b) => (
            <ViewTab key={b.id} label={b.name} icon="briefcase-outline" count={bizCounts[b.id]} active={view === `biz:${b.id}`} onPress={() => setView(`biz:${b.id}`)} />
          ))
        ) : (
          <>
            <ViewTab label="Today" icon="today-outline" count={counts.today} active={view === 'today'} onPress={() => setView('today')} />
            <ViewTab label="Upcoming" icon="calendar-outline" active={view === 'upcoming'} onPress={() => setView('upcoming')} />
            <ViewTab label="Inbox" icon="file-tray-outline" count={counts.inbox} active={view === 'inbox'} onPress={() => setView('inbox')} />
            {counts.assigned > 0 || view === 'assigned' ? (
              <ViewTab label="Assigned" icon="person-add-outline" count={counts.assigned} active={view === 'assigned'} onPress={() => setView('assigned')} />
            ) : null}
            {(view === 'shared' || inFilterView) && (
              <ViewTab label={inFilterView ? viewTitle : 'Shared'} icon={inFilterView ? 'funnel-outline' : 'people-outline'} active onPress={() => {}} />
            )}
            <ViewTab label="Completed" icon="checkmark-done-outline" active={view === 'done'} onPress={() => setView('done')} />
            {lists.map((l) => (
              <ViewTab
                key={l.id}
                glyph={<ListGlyph list={l} size={15} color={view === `list:${l.id}` ? '#fff' : colors.brand[600]} />}
                label={l.name}
                count={counts.lists[l.id]}
                active={view === `list:${l.id}`}
                onPress={() => setView(`list:${l.id}`)}
              />
            ))}
            <Chip icon="add" label="List" color={colors.gray[500]} onPress={() => setListEditor({ name: '', color: 'red', emoji: 'list' })} />
          </>
        )}
      </ScrollView>
      {!desktop && layoutSwitch && <View style={styles.mobileLayout}>{layoutSwitch}</View>}
    </View>
  ) : null;

  const boardToolbar = onBoard && business ? (
    <View style={styles.boardBar}>
      <Text style={styles.boardBarLabel}>Group by</Text>
      {BOARD_GROUPS.map((g) => (
        <Chip key={g.key} small icon={g.icon} label={g.label} active={boardGroup === g.key} onPress={() => setBoardGroup(g.key)} />
      ))}
    </View>
  ) : null;

  const timelineToolbar = onTimeline ? (
    <View style={styles.boardBar}>
      <Text style={styles.boardBarLabel}>Show</Text>
      {[3, 6, 12].map((w) => (
        <Chip key={w} small label={`${w} weeks`} active={weeks === w} onPress={() => setWeeks(w)} />
      ))}
      <Text style={styles.boardBarHint}>{business ? 'Everyone in the business' : 'My work'}</Text>
    </View>
  ) : null;

  const body = loading ? (
    <SkeletonList count={6} type="notification" />
  ) : onTimeline ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
      refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadGantt(); setRefreshing(false); }} />}
    >
      {timelineToolbar}
      {gantt.data
        ? <TimelineChart data={gantt.data} onOpen={(id) => { setOpenTodoId(id); setFocusId(id); }} selectedId={openTodoId} grouped={!!business} />
        : <SkeletonList count={4} type="notification" />}
    </ScrollView>
  ) : onCalendar ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, desktop && styles.contentDesktop, { paddingBottom: 140 + insets.bottom }]}
      refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <CalendarView
        todos={calendarItems}
        today={today}
        wide={windowWidth >= 700}
        selectedId={openTodoId}
        onOpen={openTodo}
        onToggle={toggleTodo}
        onAdd={(day, time) => setAddOpen({ ...(business ? { business_id: business.id } : {}), ...(currentList ? { list_id: currentList.id } : {}), due_date: day, ...(time ? { due_time: time } : {}) })}
        onReschedule={(id, patch) => {
          const t = todos.find((x) => x.id === id);
          if (!t || (patch.due_date === t.due_date && (patch.due_time === undefined || patch.due_time === t.due_time))) return;
          updateTodo(id, patch)
            .then(() => showToast({ message: `Moved to ${formatDayHeader(patch.due_date)}${patch.due_time ? ` at ${formatTime(patch.due_time)}` : ''}`, icon: 'calendar' }))
            .catch(() => {});
        }}
      />
    </ScrollView>
  ) : onBoard ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
      refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {boardToolbar}
      <BoardView
        columns={boardColumns}
        progressOf={(t) => subtaskProgress(t, todos)}
        onOpen={openTodo}
        onToggle={toggleTodo}
        onMove={setMoveCard}
        onDrop={onBoardDrop}
        onReorder={onBoardReorder}
        selectedId={openTodoId}
        currentUserId={meId}
        onAdd={(col) => setAddOpen(business
          ? { business_id: business.id }
          : sectioned ? { list_id: currentList?.id, section_id: col.section ? col.section.id : undefined }
            : true)}
        onAddColumn={sectioned ? () => setSectionEditor({ list_id: currentList?.id || null, name: '' }) : undefined}
        onEditColumn={sectioned ? (s) => setSectionEditor({ ...s }) : undefined}
      />
    </ScrollView>
  ) : (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, desktop && styles.contentDesktop, { paddingBottom: 140 + insets.bottom }]}
      refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
    >
      {view === 'done' ? (
        <View>
          {historyGroups.map((g) => (
            <View key={g.day}>
              <Text style={styles.dayHead}>{formatDayHeader(g.day)} · {g.items.length}</Text>
              <TodoTreeList
                sections={[{ key: `done:${g.day}`, items: g.items.filter((t) => !t.parent_id || !g.items.some((p) => p.id === t.parent_id)) }]}
                todos={todos}
                listById={listById}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                dragHandle={null}
                row={{
                  ...rowProps,
                  showList: true,
                  onToggle: (item) => {
                    toggleTodo(item);
                    setHistory((h) => ({ ...h, items: h.items.filter((x) => x.id !== item.id) }));
                  },
                }}
                hideDone={false}
              />
            </View>
          ))}
          {!history.items.length && !history.loading && (
            <EmptyHero icon="checkmark-done" title="Nothing completed yet" message="Finished to-dos show up here, newest first." />
          )}
          {history.hasMore && (
            <AnimatedPressable style={styles.loadMore} onPress={() => loadHistory(false)} disabled={history.loading}>
              <Text style={styles.loadMoreText}>{history.loading ? 'Loading' : 'Load older'}</Text>
            </AnimatedPressable>
          )}
        </View>
      ) : (
        <>
          <View ref={listAreaRef}>
            <TodoTreeList
              sections={sectionsWithRight}
              todos={todos}
              listById={listById}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              dragHandle={dragHandle}
              row={rowProps}
            />
          </View>

          {allEmpty && !business && <EmptyHero {...emptyState} action={emptyAction} />}
          {allEmpty && !!business && sections.every((s) => s.key === 'd:' + today || s.items.length === 0) && <EmptyHero {...emptyState} action={emptyAction} />}

          {sectioned && !search && (
            <AnimatedPressable style={styles.addSection} onPress={() => setSectionEditor({ list_id: currentList?.id || null, name: '' })}>
              <Ionicons name="add" size={18} color={colors.brand[600]} />
              <Text style={styles.addSectionText}>Add section</Text>
            </AnimatedPressable>
          )}

          {doneItems.length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <AnimatedPressable style={styles.doneToggle} onPress={() => setShowDone((v) => !v)}>
                <Ionicons name={showDone ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gray[500]} />
                <Text style={styles.doneToggleText}>{business ? 'Finished earlier' : 'Completed'} · {doneItems.length}</Text>
              </AnimatedPressable>
              {showDone && (
                <TodoTreeList
                  sections={[{ key: 'done', items: doneItems.filter((t) => !t.parent_id || !doneItems.some((p) => p.id === t.parent_id)) }]}
                  todos={todos}
                  listById={listById}
                  collapsed={collapsed}
                  onToggleCollapse={toggleCollapse}
                  dragHandle={null}
                  row={rowProps}
                />
              )}
            </View>
          )}
        </>
      )}

      {view !== 'done' && !desktop && (
        <Text style={styles.tip}>
          Swipe right to complete, left to delete. Type @name to share, +label to tag, for 2h to estimate.
        </Text>
      )}
    </ScrollView>
  );

  const main = (
    <View style={[styles.main, !desktop && { paddingTop: insets.top }]}>
      {header}
      {searchBox}
      {mobileNav}
      {body}
      {view !== 'done' && !selectMode && effectiveLayout !== 'timeline' && (
        <View pointerEvents="box-none" style={[styles.composer, { bottom: desktop ? 20 : 12 }]}>
          <InlineQuickAdd ref={inlineAddRef} defaults={quickAddDefaults} lists={lists} onMore={() => setAddOpen(true)} />
        </View>
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
      ) : null}
    </View>
  );

  const detailOpen = !!openTodoId && todos.some((t) => t.id === openTodoId);

  return (
    <View style={[styles.container, desktop && styles.containerDesktop]}>
      {desktop && !sidebarHidden && !(wide && detailOpen && windowWidth < 1760) && (
        <WorkSidebar
          view={view}
          onView={(v) => { setView(v); setScope(v.startsWith('biz:') ? 'business' : 'mine'); }}
          counts={counts}
          lists={lists}
          filters={filters}
          labels={labels}
          businesses={businesses}
          bizCounts={bizCounts}
          approvalCount={approvalCount}
          canMonitor={!!user?.can_monitor}
          onAdd={() => setAddOpen(true)}
          onNewList={() => setListEditor({ name: '', color: 'red', emoji: 'list' })}
          onApprovals={() => navigation.navigate('Approvals')}
          onMonitor={() => navigation.navigate('TeamMonitor')}
          onFilters={() => setFiltersOpen(true)}
          simple={simpleView}
        />
      )}
      {main}
      {wide && detailOpen && (
        <View {...glass('bar')} style={styles.detailPane}>
          <TodoDetailBody todoId={openTodoId} onClose={() => setOpenTodoId(null)} variant="panel" />
        </View>
      )}

      <QuickAddSheet
        visible={!!addOpen}
        onClose={() => setAddOpen(false)}
        defaults={typeof addOpen === 'object' ? { ...quickAddDefaults, ...addOpen } : quickAddDefaults}
      />
      {!wide && <TodoDetailSheet todoId={openTodoId} onClose={() => setOpenTodoId(null)} />}
      <ShareToChatSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        heading={`Share “${viewTitle}”`}
        subheading={`${shareVisibleIds.length} item${shareVisibleIds.length === 1 ? '' : 's'} as a checklist card`}
        onSend={({ conversationIds, note }) => shareTodos({ conversationIds, todoIds: shareVisibleIds, title: viewTitle, note })}
      />
      <PickerSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={viewTitle} options={menuOptions} onPick={onMenu} />
      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onPick={(v) => { setView(v); setScope('mine'); setFiltersOpen(false); }}
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
      <PickerSheet
        visible={!!moveCard}
        onClose={() => setMoveCard(null)}
        title="Move to"
        options={boardColumns.map((c) => ({ key: c.key, label: c.title, icon: c.icon || 'albums-outline' }))}
        onPick={(key) => moveCard && onBoardDrop(moveCard.id, String(key), [])}
      />
      <PickerSheet
        visible={!!priorityFor}
        onClose={() => setPriorityFor(null)}
        title="Priority"
        options={[1, 2, 3, 4].map((p) => ({ key: p, label: PRIORITY[p].label, icon: 'flag' }))}
        onPick={(p) => priorityFor && updateTodo(priorityFor.id, { priority: p })}
      />
      <PromptSheet
        value={deletePrompt}
        onClose={() => setDeletePrompt(null)}
        onSubmit={async (reason) => {
          const target = deletePrompt?.todo;
          setDeletePrompt(null);
          if (!target) return;
          try {
            await requestDelete(target.id, reason);
            showToast({ message: 'Request sent up the chain', tone: 'success' });
          } catch (err) {
            showToast({ message: err.response?.data?.error || 'Could not send the request', tone: 'error' });
          }
        }}
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
              setScope('mine');
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

function LayoutButton({ icon, label, active, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityLabel={`${label} layout`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md,
        backgroundColor: active ? colors.white : 'transparent',
        borderWidth: active ? StyleSheet.hairlineWidth : 0, borderColor: colors.gray[300],
      }}
    >
      <Ionicons name={`${icon}${active ? '' : '-outline'}`} size={15} color={active ? colors.brand[700] : colors.gray[500]} />
      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: active ? colors.gray[900] : colors.gray[500] }}>{label}</Text>
    </AnimatedPressable>
  );
}

function ViewTab({ label, icon, glyph, count, active, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: radius.full,
        backgroundColor: active ? colors.brand[600] : colors.white,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.brand[600] : colors.gray[200],
      }}
    >
      {glyph || (icon && <Ionicons name={icon} size={15} color={active ? '#fff' : colors.brand[600]} />)}
      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: active ? '#fff' : colors.gray[700], maxWidth: 140 }} numberOfLines={1}>{label}</Text>
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
  const icon = LIST_ICONS.includes(draft.emoji) ? draft.emoji : 'list';
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
          {LIST_ICONS.map((key) => (
            <AnimatedPressable
              key={key}
              onPress={() => setDraft((d) => ({ ...d, emoji: key }))}
              style={{
                width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                backgroundColor: icon === key ? colors.brand[100] : colors.gray[100],
                borderWidth: icon === key ? 2 : 0, borderColor: colors.brand[500],
              }}
            >
              <Ionicons name={key} size={20} color={icon === key ? colors.brand[700] : colors.gray[600]} />
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
            onPress={() => onSave({ ...draft, emoji: icon, name: draft.name.trim() })}
            style={{
              flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: 'center',
              backgroundColor: colors.brand[600], opacity: draft.name?.trim() ? 1 : 0.4,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.base }}>{draft.id ? 'Save' : 'Create list'}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  containerDesktop: { flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  composer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.6 },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  ringText: { fontSize: 10, fontWeight: '800', color: colors.gray[700] },
  cancelBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { fontSize: fontSize.base, fontWeight: '700', color: colors.brand[600] },
  layoutSwitch: {
    flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: radius.md, backgroundColor: colors.gray[100], marginRight: spacing.sm,
  },
  mobileLayout: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: 'flex-start' },
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
  segment: {
    flexDirection: 'row', gap: 4, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: 3, borderRadius: radius.lg, backgroundColor: colors.gray[100],
  },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.md },
  segmentOn: { backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200] },
  segmentText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[500] },
  segmentTextOn: { color: colors.brand[700], fontWeight: '700' },
  tabsWrap: { flexGrow: 0 },
  tabs: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  content: { paddingHorizontal: spacing.lg },
  contentDesktop: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  boardBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, flexWrap: 'wrap' },
  boardBarLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[500] },
  boardBarHint: { fontSize: fontSize.sm, color: colors.gray[400], marginLeft: spacing.sm },
  dayHead: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800], paddingTop: spacing.lg, paddingBottom: spacing.sm },
  reschedule: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  addSection: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  addSectionText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  doneToggleText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] },
  loadMore: { alignItems: 'center', paddingVertical: spacing.lg },
  loadMoreText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.brand[600] },
  dragHandle: { paddingTop: 2, paddingRight: 2, cursor: 'grab' },
  tip: { fontSize: fontSize.xs, color: colors.gray[400], textAlign: 'center', marginTop: spacing.xxl },
  detailPane: {
    width: 460, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.gray[200], backgroundColor: colors.white,
  },
});
