import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { glass } from '../../theme/glass';
import AnimatedPressable from '../AnimatedPressable';
import { todayYmd, addDays } from '../../utils/dates';
import BoardDashboard from '../board/BoardDashboard';
import useAi from '../../hooks/useAi';
import * as SecureStore from '../../utils/secureStorage';

// The built-in stages, so a status looks the same in "My own dashboard" as on a board.
const HOME_COLUMNS = [
  { id: -1, system_key: 'status', kind: 'status', title: 'Status', labels: [
    { maps_to: 'todo', label: 'Not started', color: 'grey' }, { maps_to: 'in_progress', label: 'Working on it', color: 'orange' },
    { maps_to: 'blocked', label: 'Stuck', color: 'red' }, { maps_to: 'in_review', label: 'In review', color: 'blue' },
    { maps_to: 'on_hold', label: 'On hold', color: 'purple' }, { maps_to: 'done', label: 'Done', color: 'green' },
  ] },
  { id: -2, system_key: 'person', kind: 'person', title: 'Owner' },
  { id: -3, system_key: 'date', kind: 'date', title: 'Due date' },
];

/**
 * A dashboard the person builds for themselves, under the fixed one: numbers and charts picked from the gallery or
 * asked for in words (the AI, when it is set up). It is drawn from the to-dos they can see, with a company as the
 * "group", by the same component as a board's dashboard. Kept on this device per person.
 */
export function OwnDashboard({ todos, userId, desktop, onOpenItem }) {
  const ai = useAi();
  const key = `home.widgets.${userId || 'me'}`;
  const [saved, setSaved] = useState(undefined); // undefined = not read yet
  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(key).then((v) => {
      if (!live) return;
      try { setSaved(v ? JSON.parse(v) : null); } catch { setSaved(null); }
    }).catch(() => live && setSaved(null));
    return () => { live = false; };
  }, [key]);
  const board = useMemo(() => {
    const groups = new Map([[0, { id: 0, name: 'Personal', color: 'grey' }]]);
    for (const t of todos) if (t.business_id && !groups.has(t.business_id)) groups.set(t.business_id, { id: t.business_id, name: t.business_name || 'Company', color: 'dark_orange' });
    return {
      board: { id: 'home', kind: 'home' }, columns: HOME_COLUMNS, groups: [...groups.values()], values: {}, ai_enabled: ai,
      items: todos.map((t) => ({ ...t, business_section_id: t.business_id || 0 })),
    };
  }, [todos, ai]);
  const save = useCallback((widgets) => { setSaved(widgets); SecureStore.setItemAsync(key, JSON.stringify(widgets)).catch(() => {}); }, [key]);
  if (saved === undefined) return null;
  return (
    <BoardDashboard
      embedded board={board} people={[]} meId={userId} desktop={desktop} canSave initial={[]}
      view={{ name: 'My own dashboard', settings: saved ? { widgets: saved } : {} }}
      aiPath="/boards/home-dashboard/ai" onSave={save} onOpenItem={onOpenItem}
    />
  );
}

const GAP = 12;
const PANEL_H = 348;

/** My work: my personal to-dos and the business work I am accountable for (shared by both Home layouts). */
export function myWorkOf(todos, meId) {
  const today = todayYmd();
  const mine = todos.filter((t) => !t.parent_id && (!t.business_id || t.assignee_id === meId));
  const open = mine.filter((t) => !t.is_done);
  const late = open.filter((t) => t.due_date && t.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueToday = open.filter((t) => t.due_date === today).sort((a, b) => (a.priority || 9) - (b.priority || 9));
  const doneToday = mine.filter((t) => t.is_done && t.done_at && t.done_at.slice(0, 10) === today).length;
  const weekAgo = addDays(today, -6);
  return {
    today, mine, open, late, dueToday, doneToday,
    working: open.filter((t) => t.status === 'in_progress').length,
    stuck: open.filter((t) => t.status === 'blocked').length,
    review: open.filter((t) => t.status === 'in_review').length,
    doneWeek: mine.filter((t) => t.is_done && t.done_at && t.done_at.slice(0, 10) >= weekAgo).length,
    undated: open.filter((t) => !t.due_date).length,
    week: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i + 1);
      return { day, list: open.filter((t) => t.due_date === day) };
    }),
  };
}

/** One card of the dashboard: a title line, then its content. On a computer every card in a row is the same height. */
export function Panel({ title, icon, action, onAction, grow = 1, fixed, children }) {
  const colors = useColors();
  return (
    <View {...glass('card')} style={{ flexGrow: grow, flexShrink: 1, flexBasis: fixed ? 0 : 'auto', minWidth: 0, height: fixed ? PANEL_H : undefined, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 10 }}>
        <Ionicons name={icon} size={16} color={colors.gray[500]} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
        {!!action && (
          <AnimatedPressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.brand[600] }}>{action}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.brand[600]} />
          </AnimatedPressable>
        )}
      </View>
      {fixed
        ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>{children}</ScrollView>
        : <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>{children}</View>}
    </View>
  );
}
