import { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { PRIORITY } from './kit';
import { formatDue, formatTime } from '../utils/dates';
import { showToast } from '../utils/events';

const COLLAPSED_COUNT = 5;

/**
 * Checklist card for to-dos shared into a chat (message.meta.kind === 'todos').
 * Shows each to-do in full (notes, due date, priority) and lets the reader copy one or
 * all of the open ones into their own list.
 */
function SharedTodosCard({ meta, isOwn: mine }) {
  // The card looks the same to the sender and to the person who gets it; the sender just has nothing to add.
  const isOwn = false;
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);
  const { importTodos, todos } = useTodos();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(null); // id of the to-do whose notes are showing
  const [addedIds, setAddedIds] = useState([]);
  const [busy, setBusy] = useState(false);

  // Anyone who can see a shared to-do sees how it stands now, not how it was when it was sent.
  const byId = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const items = (meta.items || []).map((i) => {
    const t = byId.get(i.id);
    return t ? { ...i, title: t.title, notes: t.notes || i.notes, is_done: t.is_done, due_date: t.due_date, due_time: t.due_time, priority: t.priority } : i;
  });
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const pending = items.filter((i) => !i.is_done && !addedIds.includes(i.id));
  const allAdded = items.some((i) => !i.is_done) && pending.length === 0;
  const subtle = isOwn ? 'rgba(255,255,255,0.8)' : colors.gray[500];

  const add = async (list) => {
    if (!list.length || busy) return;
    setBusy(true);
    try {
      const created = await importTodos(list.map(({ title, notes, due_date, priority }) => ({ title, notes, due_date, priority })));
      setAddedIds((prev) => [...prev, ...list.map((i) => i.id)]);
      showToast({ message: `Added ${created} to your Inbox`, tone: 'success', icon: 'checkbox' });
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="checkbox-outline" size={16} color={isOwn ? colors.white : colors.brand[600]} />
        <Text style={styles.heading} numberOfLines={1}>
          {meta.title || (items.length === 1 ? 'To-do' : 'To-do list')}
        </Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>
      {!!meta.owner?.name && <Text style={[styles.owner, { color: subtle }]}>{mine ? 'Shared by you' : `From ${meta.owner.name}`}</Text>}

      {visible.map((item) => {
        const isAdded = addedIds.includes(item.id);
        const showNotes = open === item.id && !!item.notes;
        return (
          <View key={item.id} style={styles.item}>
            <Ionicons
              name={item.is_done ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={item.is_done ? (isOwn ? colors.white : colors.brand[600]) : (isOwn ? colors.white : PRIORITY[item.priority]?.color || colors.gray[400])}
            />
            <AnimatedPressable style={{ flex: 1 }} onPress={() => setOpen(showNotes ? null : item.id)} disabled={!item.notes}>
              <Text style={[styles.itemTitle, item.is_done && styles.itemDone]} numberOfLines={showNotes ? undefined : 3}>{item.title}</Text>
              <View style={styles.metaRow}>
                {!!item.due_date && (
                  <Text style={[styles.metaText, { color: subtle }]}>
                    {formatDue(item.due_date)}{item.due_time ? ` ${formatTime(item.due_time)}` : ''}
                  </Text>
                )}
                {item.priority && item.priority < 4 && (
                  <Text style={[styles.metaText, { color: subtle }]}>· {PRIORITY[item.priority].label}</Text>
                )}
                {!!item.notes && <Ionicons name="document-text-outline" size={11} color={subtle} />}
              </View>
              {showNotes && <Text style={[styles.notes, { color: subtle }]}>{item.notes}</Text>}
            </AnimatedPressable>
            {!mine && !item.is_done && (
              <AnimatedPressable onPress={() => add([item])} disabled={busy || isAdded} hitSlop={8} haptic="light" style={styles.itemAdd}>
                <Ionicons name={isAdded ? 'checkmark' : 'add'} size={16} color={colors.white} />
              </AnimatedPressable>
            )}
          </View>
        );
      })}

      {items.length > COLLAPSED_COUNT && (
        <AnimatedPressable onPress={() => setExpanded((e) => !e)}>
          <Text style={styles.more}>{expanded ? 'Show less' : `+${items.length - COLLAPSED_COUNT} more`}</Text>
        </AnimatedPressable>
      )}

      {!mine && items.some((i) => !i.is_done) && (
        <AnimatedPressable onPress={() => add(pending)} disabled={busy || allAdded} haptic="medium" style={[styles.addBtn, (busy || allAdded) && { opacity: 0.6 }]}>
          <Ionicons name={allAdded ? 'checkmark' : 'add'} size={16} color={colors.white} />
          <Text style={styles.addText}>
            {allAdded ? 'Added to my to-dos' : busy ? 'Adding…' : `Add ${pending.length > 1 ? `all ${pending.length} ` : ''}to my to-dos`}
          </Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const createStyles = (colors, isOwn) => StyleSheet.create({
  card: {
    minWidth: 240,
    maxWidth: 320,
    marginTop: 2,
    marginBottom: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: isOwn ? 'rgba(255,255,255,0.14)' : colors.gray[50],
    borderWidth: isOwn ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heading: { flex: 1, fontSize: fontSize.sm, fontWeight: '800', color: isOwn ? colors.white : colors.gray[900] },
  count: { fontSize: 11, fontWeight: '700', color: isOwn ? 'rgba(255,255,255,0.8)' : colors.gray[400] },
  owner: { fontSize: 11, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  itemTitle: { fontSize: fontSize.sm, color: isOwn ? colors.white : colors.gray[800] },
  itemDone: { textDecorationLine: 'line-through', opacity: 0.6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  metaText: { fontSize: 11 },
  notes: { fontSize: 12, marginTop: 3 },
  itemAdd: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand[600] },
  more: { fontSize: fontSize.xs, fontWeight: '700', color: isOwn ? colors.white : colors.brand[600], paddingVertical: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.brand[600],
  },
  addText: { color: '#ffffff', fontWeight: '700', fontSize: fontSize.sm },
});

export default memo(SharedTodosCard);
