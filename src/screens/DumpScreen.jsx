import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import api from '../api/client';
import { useColors } from '../context/ThemeContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, BRAND } from '../theme/theme';
import { glass } from '../theme/glass';
import useIsDesktop from '../hooks/useBreakpoint';
import BackTitle from '../components/BackTitle';
import Popover, { anchorOf } from '../components/board/Popover';
import DueDatePicker from '../components/DueDatePicker';
import TodoDetailSheet from '../components/todos/TodoDetailSheet';
import ProgressDot from '../components/ProgressDot';
import { DueChip } from '../components/kit';
import { progressMapOf } from '../utils/progress';
import { todayYmd, addDays, timeAgo } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';

function MenuRow({ icon, label, onPress, danger }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      <Ionicons name={icon} size={16} color={danger ? colors.red[600] : colors.gray[600]} />
      <Text style={{ fontSize: 14, color: danger ? colors.red[600] : colors.gray[900] }}>{label}</Text>
    </Pressable>
  );
}

/**
 * The Dump: to-dos you sent out of your lists with "Dump everything" (or one by one). They are not deleted or changed;
 * the list, section and order they had come back with them. Bring each one back where it was, plan it (today,
 * tomorrow, next week, a date), put it in another list, open it to change anything, or delete it (the Recycle bin
 * keeps it for 90 days). Tick several to bring them back together.
 */
export default function DumpScreen() {
  const colors = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { dump, lists, fetchDump, restoreFromDump, updateTodo, dumpEverything } = useTodos();
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [menu, setMenu] = useState(null); // { todo, anchor, stage: 'main' | 'lists' }
  const [dateFor, setDateFor] = useState(null);
  const [openId, setOpenId] = useState(null);

  useFocusEffect(useCallback(() => { fetchDump().finally(() => setLoaded(true)); }, [fetchDump]));
  useEffect(() => { if (dump.length || loaded) setLoaded(true); }, [dump, loaded]);

  const progress = useMemo(() => progressMapOf(dump), [dump]);
  const tops = useMemo(() => {
    const ids = new Set(dump.map((t) => t.id));
    const needle = q.trim().toLowerCase();
    return dump.filter((t) => (!t.parent_id || !ids.has(t.parent_id)) && (!needle || t.title.toLowerCase().includes(needle)));
  }, [dump, q]);
  // Grouped by where each one came from, so the person sees the whole picture again.
  const groups = useMemo(() => {
    const byList = new Map();
    for (const t of tops) {
      const key = t.list_id || 0;
      if (!byList.has(key)) byList.set(key, []);
      byList.get(key).push(t);
    }
    return [...byList.entries()].map(([id, items]) => ({ id, name: id ? (lists.find((l) => l.id === id)?.name || 'A list') : 'Inbox', items }))
      .sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : a.name.localeCompare(b.name)));
  }, [tops, lists]);

  const toggle = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const bringBack = async (ids, what) => {
    setBusy(ids.length === 1 ? ids[0] : 'many');
    try {
      await restoreFromDump(ids);
      setPicked(new Set());
      showToast({ message: what || (ids.length === 1 ? 'Brought back' : `${ids.length} to-dos brought back`), tone: 'success', icon: 'arrow-undo' });
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not bring it back', tone: 'error' });
    } finally { setBusy(null); }
  };

  /** Plan a to-do (a date, or another list) and bring it back in one step. */
  const planAndBack = async (todo, patch, message) => {
    setMenu(null);
    setBusy(todo.id);
    try {
      await updateTodo(todo.id, patch);
      await restoreFromDump([todo.id]);
      showToast({ message, tone: 'success', icon: 'calendar' });
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not change it', tone: 'error' });
    } finally { setBusy(null); }
  };

  const remove = async (todo) => {
    setMenu(null);
    const ok = await confirmDialog({ title: 'Delete this to-do?', message: `"${todo.title}" and its sub-tasks go to the Recycle bin, where you can bring them back for 90 days.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/todos/${todo.id}`);
      await fetchDump();
      showToast({ message: 'Deleted. It is in the Recycle bin.', icon: 'trash' });
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not delete it', tone: 'error' });
    }
  };

  const today = todayYmd();
  const count = dump.filter((t) => !t.parent_id).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: desktop ? 0 : insets.top }}>
      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, paddingVertical: spacing.md, gap: 2 }}>
        <BackTitle title="Dump" style={{ fontSize: desktop ? 26 : 22, fontWeight: '700', color: colors.gray[900] }} />
        <Text style={{ fontSize: 14, color: colors.gray[600] }}>
          Everything you sent out of your lists, in one place. Nothing was deleted or changed. Bring each one back, plan it, or change it, one at a time.
        </Text>
      </View>

      <View style={{ paddingHorizontal: desktop ? spacing.xl : spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', maxWidth: 900 + 2 * spacing.xl, width: '100%', alignSelf: 'center' }}>
        <View style={{ flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.white }}>
          <Ionicons name="search" size={15} color={colors.gray[500]} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search the Dump" placeholderTextColor={colors.gray[400]} style={{ flex: 1, paddingVertical: 8, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
        </View>
        {picked.size > 0 ? (
          <Pressable onPress={() => bringBack([...picked])} accessibilityLabel="Bring the ticked to-dos back" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Ionicons name="arrow-undo" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>Bring back {picked.size}</Text>
          </Pressable>
        ) : count > 0 ? (
          <Pressable
            onPress={async () => { const ok = await confirmDialog({ title: `Bring all ${count} back?`, message: 'Every to-do in the Dump returns to its own list and place.', confirmLabel: 'Bring all back' }); if (ok) bringBack('all', `All ${count} brought back`); }}
            accessibilityLabel="Bring everything back"
            style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: hovered ? colors.gray[100] : colors.white })}
          >
            <Ionicons name="arrow-undo-outline" size={16} color={colors.gray[700]} />
            <Text style={{ color: colors.gray[800], fontWeight: '600' }}>Bring all back</Text>
          </Pressable>
        ) : null}
      </View>

      {!loaded ? <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xl }} /> : (
        <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.md, paddingBottom: 140, maxWidth: 900 + 2 * spacing.xl, width: '100%', alignSelf: 'center', gap: spacing.md }}>
          {!dump.length && (
            <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, alignItems: 'center', gap: 8, padding: spacing.xl }}>
              <Ionicons name="archive-outline" size={34} color={colors.gray[400]} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[800] }}>The Dump is empty</Text>
              <Text style={{ color: colors.gray[600], textAlign: 'center', maxWidth: 420 }}>
                Feeling buried? Dump everything to clear your lists and see them fresh. You can bring any of it back.
              </Text>
              <Pressable onPress={dumpEverything} style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Ionicons name="archive" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600' }}>Dump everything</Text>
              </Pressable>
            </View>
          )}
          {!!dump.length && !tops.length && <Text style={{ color: colors.gray[500], textAlign: 'center', padding: spacing.lg }}>Nothing in the Dump matches that.</Text>}
          {groups.map((g) => (
            <View key={g.id} style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gray[500], letterSpacing: 0.4 }}>{g.name.toUpperCase()} · {g.items.length}</Text>
              <View {...glass('card')} style={{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
                {g.items.map((t, i) => {
                  const p = progress.get(t.id);
                  const on = picked.has(t.id);
                  return (
                    <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.gray[100], backgroundColor: on ? colors.brand[50] : 'transparent' }}>
                      <Pressable onPress={() => toggle(t.id)} hitSlop={8} accessibilityLabel={on ? 'Untick' : 'Tick to bring back with others'}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? BRAND : colors.gray[400]} />
                      </Pressable>
                      <Pressable onPress={() => setOpenId(t.id)} style={{ flex: 1, minWidth: 0, gap: 3 }} accessibilityLabel={`Open ${t.title}`}>
                        <Text numberOfLines={2} style={{ fontSize: 15, color: colors.gray[900] }}>{t.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {!!t.due_date && <DueChip date={t.due_date} compact />}
                          {p && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <ProgressDot pct={p.pct} size={16} stroke={2.5} />
                              <Text style={{ fontSize: 12, color: colors.gray[600] }}>{p.done}/{p.total} steps</Text>
                            </View>
                          )}
                          <Text style={{ fontSize: 12, color: colors.gray[500] }}>dumped {timeAgo(t.dumped_at)}</Text>
                        </View>
                      </Pressable>
                      {busy === t.id ? <ActivityIndicator color={BRAND} /> : (
                        <>
                          <Pressable onPress={() => bringBack([t.id])} accessibilityLabel={`Bring back ${t.title} to where it was`} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.brand[50] : 'transparent' })}>
                            <Ionicons name="arrow-undo-outline" size={15} color={BRAND} />
                            {desktop && <Text style={{ color: BRAND, fontWeight: '600' }}>Bring back</Text>}
                          </Pressable>
                          <Pressable onPress={(e) => setMenu({ todo: t, anchor: anchorOf(e), stage: 'main' })} accessibilityLabel={`More for ${t.title}`} hitSlop={6} style={({ hovered }) => ({ padding: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
                            <Ionicons name="ellipsis-horizontal" size={18} color={colors.gray[600]} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {menu && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={260}>
          {menu.stage === 'main' ? (
            <>
              <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500], paddingHorizontal: 6, paddingBottom: 4 }}>Bring back and plan it</Text>
              <MenuRow icon="today-outline" label="Today" onPress={() => planAndBack(menu.todo, { due_date: today }, 'Brought back for today')} />
              <MenuRow icon="sunny-outline" label="Tomorrow" onPress={() => planAndBack(menu.todo, { due_date: addDays(today, 1) }, 'Brought back for tomorrow')} />
              <MenuRow icon="calendar-outline" label="Next week" onPress={() => planAndBack(menu.todo, { due_date: addDays(today, 7) }, 'Brought back for next week')} />
              <MenuRow icon="calendar-number-outline" label="Pick a date..." onPress={() => { const todo = menu.todo; setMenu(null); setDateFor(todo); }} />
              <MenuRow icon="list-outline" label="Put in another list..." onPress={() => setMenu({ ...menu, stage: 'lists' })} />
              <MenuRow icon="create-outline" label="Open and change it" onPress={() => { const id = menu.todo.id; setMenu(null); setOpenId(id); }} />
              <MenuRow icon="trash-outline" label="Delete" danger onPress={() => remove(menu.todo)} />
            </>
          ) : (
            <>
              <MenuRow icon="chevron-back" label="Back" onPress={() => setMenu({ ...menu, stage: 'main' })} />
              <ScrollView style={{ maxHeight: 280 }}>
                <MenuRow icon="file-tray-outline" label="Inbox" onPress={() => planAndBack(menu.todo, { list_id: null, section_id: null }, 'Brought back to the Inbox')} />
                {lists.map((l) => <MenuRow key={l.id} icon="list-outline" label={l.name} onPress={() => planAndBack(menu.todo, { list_id: l.id, section_id: null }, `Brought back to ${l.name}`)} />)}
              </ScrollView>
            </>
          )}
        </Popover>
      )}
      <DueDatePicker
        visible={!!dateFor} date={dateFor?.due_date || null} time={null} allowTime={false}
        onClose={() => setDateFor(null)}
        onChange={(picked) => { const todo = dateFor; setDateFor(null); if (todo && picked?.date) planAndBack(todo, { due_date: picked.date }, 'Brought back with a date'); }}
      />
      <TodoDetailSheet todoId={openId} onClose={() => setOpenId(null)} />
    </View>
  );
}
