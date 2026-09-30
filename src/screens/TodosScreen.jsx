import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
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
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { SkeletonList } from '../components/Skeleton';
import ShareToChatSheet from '../components/ShareToChatSheet';
import TodoItem from '../components/todos/TodoItem';
import QuickAddSheet from '../components/todos/QuickAddSheet';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import { Chip, Fab, IconButton, SectionHeader, EmptyHero, ProgressRing, accent, COLOR_NAMES } from '../components/kit';
import { todayYmd, addDays, formatDayHeader, WEEKDAYS, MONTHS_SHORT, toYmd } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

const LIST_EMOJIS = ['📋', '🏠', '💼', '🛒', '💰', '🏗️', '🍽️', '⛏️', '💻', '📞', '🎯', '⭐'];

export default function TodosScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { todos, lists, loading, fetchTodos, toggleTodo, deleteTodo, updateTodo, createList, updateList, deleteList, shareTodos } = useTodos();

  const [view, setView] = useState('today'); // today | upcoming | inbox | shared | list:<id>
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [openTodoId, setOpenTodoId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [listEditor, setListEditor] = useState(null); // null | { id?, name, color, emoji }
  const [highlightId, setHighlightId] = useState(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const scrollRef = useRef(null);

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
  const open = todos.filter((t) => !t.is_done);
  const doneToday = todos.filter((t) => t.is_done && t.done_at && toYmd(new Date(t.done_at)) === today);

  const counts = useMemo(() => ({
    today: open.filter((t) => t.due_date && t.due_date <= today).length,
    inbox: open.filter((t) => !t.list_id).length,
    shared: open.filter((t) => (t.members || []).length > 1).length,
    lists: Object.fromEntries(lists.map((l) => [l.id, open.filter((t) => t.list_id === l.id).length])),
  }), [open, lists, today]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodos();
    setRefreshing(false);
  };

  const currentList = view.startsWith('list:') ? listById.get(Number(view.slice(5))) : null;
  const viewTitle = view === 'today' ? 'Today'
    : view === 'upcoming' ? 'Upcoming'
      : view === 'inbox' ? 'Inbox'
        : view === 'shared' ? 'Shared with me'
          : currentList ? `${currentList.emoji ? `${currentList.emoji} ` : ''}${currentList.name}` : 'To-do';

  // Build the sections for the current view.
  const { sections, doneItems, visibleOpenIds } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (t) => !q || t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q);
    const openItems = open.filter(match);
    let result = [];
    let done = [];

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
      result.push({ key: 'inbox', title: null, items: openItems.filter((t) => !t.list_id) });
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
      const items = openItems.filter((t) => t.list_id === currentList.id);
      result.push({ key: 'list', title: null, items });
      done = todos.filter((t) => t.is_done && t.list_id === currentList.id);
    }
    const ids = result.flatMap((s) => s.items.map((t) => t.id));
    return { sections: result, doneItems: done, visibleOpenIds: ids };
  }, [open, todos, view, today, doneToday, currentList, search, user?.id]);

  const totalToday = counts.today + doneToday.length;
  const todayPercent = totalToday ? Math.round((doneToday.length / totalToday) * 100) : 0;

  const rescheduleOverdue = async () => {
    const overdue = open.filter((t) => t.due_date && t.due_date < today);
    await Promise.all(overdue.map((t) => updateTodo(t.id, { due_date: today }).catch(() => null)));
    showToast({ message: `Moved ${overdue.length} to today`, tone: 'success', icon: 'calendar' });
  };

  const quickAddDefaults = view === 'today' ? { due_date: today }
    : currentList ? { list_id: currentList.id } : {};

  const renderItem = useCallback((t) => (
    <Animated.View key={t.id} layout={LinearTransition.springify().damping(18)} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
      <TodoItem
        todo={t}
        list={listById.get(t.list_id)}
        showList={view === 'today' || view === 'upcoming' || view === 'shared' || !!search}
        currentUserId={user?.id}
        highlighted={highlightId === t.id}
        onToggle={toggleTodo}
        onOpen={(item) => setOpenTodoId(item.id)}
        onDelete={deleteTodo}
      />
    </Animated.View>
  ), [listById, view, search, user?.id, highlightId, toggleTodo, deleteTodo]);

  const allEmpty = sections.every((s) => s.items.length === 0);
  const emptyState = (() => {
    if (search) return { icon: 'search', title: 'Nothing found', message: 'Try another word.' };
    if (view === 'today') {
      return doneToday.length
        ? { icon: 'trophy', title: 'You’re all done for today! 🎉', message: `${doneToday.length} completed. Enjoy the rest of your day.`, color: '#058527' }
        : { icon: 'sunny', title: 'A fresh day', message: 'Add what you want to get done today. Try “Call supplier 4pm p1”.', color: '#ad6200' };
    }
    if (view === 'shared') return { icon: 'people', title: 'Nothing shared yet', message: 'Type @name while adding a to-do and it lands in their list too.' };
    if (view === 'upcoming') return { icon: 'calendar', title: 'Your schedule is clear', message: 'Plan ahead — add a to-do with a date.' };
    return { icon: 'file-tray', title: 'All clear', message: 'Tap + to add a to-do.' };
  })();

  const shareVisibleIds = visibleOpenIds.length ? visibleOpenIds : doneItems.map((t) => t.id);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{viewTitle}</Text>
          <Text style={styles.subtitle}>
            {view === 'today'
              ? `${WEEKDAYS[new Date().getDay()]}, ${new Date().getDate()} ${MONTHS_SHORT[new Date().getMonth()]} · ${counts.today} left`
              : `${visibleOpenIds.length} to-do${visibleOpenIds.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        {view === 'today' && totalToday > 0 && (
          <ProgressRing percent={todayPercent} size={40} stroke={4} color="#058527">
            <Text style={styles.ringText}>{todayPercent}%</Text>
          </ProgressRing>
        )}
        <IconButton icon={searching ? 'close' : 'search'} onPress={() => { setSearching((s) => !s); setSearch(''); }} accessibilityLabel="Search to-dos" />
        <IconButton
          icon="paper-plane-outline"
          accessibilityLabel="Share this list to chat"
          onPress={() => (shareVisibleIds.length ? setShareOpen(true) : showToast({ message: 'Nothing to share here yet' }))}
        />
        {currentList && (
          <IconButton icon="ellipsis-horizontal" onPress={() => setListEditor({ ...currentList })} accessibilityLabel="Edit list" />
        )}
      </View>

      {searching && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.gray[400]} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="Search all your to-dos"
            placeholderTextColor={colors.gray[400]}
            style={styles.searchInput}
          />
        </Animated.View>
      )}

      {/* Views */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsWrap}>
        <ViewTab label="Today" icon="today" count={counts.today} active={view === 'today'} color="#058527" onPress={() => setView('today')} />
        <ViewTab label="Upcoming" icon="calendar" active={view === 'upcoming'} color="#692ec2" onPress={() => setView('upcoming')} />
        <ViewTab label="Inbox" icon="file-tray" count={counts.inbox} active={view === 'inbox'} color="#246fe0" onPress={() => setView('inbox')} />
        <ViewTab label="Shared" icon="people" count={counts.shared} active={view === 'shared'} color="#eb8909" onPress={() => setView('shared')} />
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
        <Chip icon="add" label="List" color={colors.gray[500]} onPress={() => setListEditor({ name: '', color: 'indigo', emoji: '📋' })} />
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
          {sections.map((section) => (
            <View key={section.key}>
              {section.title && (
                <SectionHeader
                  title={section.title}
                  count={section.items.length || undefined}
                  color={section.overdue ? '#dc4c3e' : undefined}
                  right={section.overdue ? (
                    <AnimatedPressable onPress={rescheduleOverdue} haptic="light">
                      <Text style={styles.reschedule}>Reschedule to today</Text>
                    </AnimatedPressable>
                  ) : section.day ? (
                    <AnimatedPressable onPress={() => setAddOpen({ due_date: section.day })} haptic="light" hitSlop={8}>
                      <Ionicons name="add" size={20} color={colors.gray[400]} />
                    </AnimatedPressable>
                  ) : null}
                />
              )}
              {section.items.map(renderItem)}
              {section.day && section.items.length === 0 && (
                <Text style={styles.freeDay}>Nothing planned</Text>
              )}
            </View>
          ))}

          {allEmpty && view !== 'upcoming' && <EmptyHero {...emptyState} />}

          {doneItems.length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <AnimatedPressable style={styles.doneToggle} onPress={() => setShowDone((v) => !v)} haptic="light">
                <Ionicons name={showDone ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gray[500]} />
                <Text style={styles.doneToggleText}>Completed · {doneItems.length}</Text>
              </AnimatedPressable>
              {showDone && doneItems.map(renderItem)}
            </View>
          )}

          <Text style={styles.tip}>Tip: swipe right to complete, left to delete. Type @name to add it to someone’s list.</Text>
        </ScrollView>
      )}

      <Fab onPress={() => setAddOpen(true)} bottom={24 + insets.bottom} />

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
      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: active ? '#fff' : colors.gray[700] }}>{label}</Text>
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
        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm }}>COLOUR</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {COLOR_NAMES.map((c) => (
            <AnimatedPressable
              key={c}
              onPress={() => setDraft((d) => ({ ...d, color: c }))}
              style={{
                width: 30, height: 30, borderRadius: 15, backgroundColor: accent(c),
                borderWidth: draft.color === c ? 3 : 0, borderColor: colors.gray[900],
              }}
            />
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
  reschedule: { fontSize: fontSize.sm, fontWeight: '700', color: '#dc4c3e' },
  freeDay: { fontSize: fontSize.sm, color: colors.gray[400], paddingVertical: spacing.sm, paddingLeft: spacing.xs },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  doneToggleText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[500] },
  tip: { fontSize: fontSize.xs, color: colors.gray[400], textAlign: 'center', marginTop: spacing.xxl },
});
