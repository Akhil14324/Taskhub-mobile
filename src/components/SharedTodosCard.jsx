import { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../context/ThemeContext';
import { useTodos } from '../context/TodoContext';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from './AnimatedPressable';
import { PRIORITY, DueChip } from './kit';
import { showToast } from '../utils/events';

const MAX_VISIBLE = 6;

/** Checklist card for to-dos shared into a chat (message.meta.kind === 'todos'). */
function SharedTodosCard({ meta, isOwn }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);
  const { importTodos } = useTodos();
  const [expanded, setExpanded] = useState(false);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = meta.items || [];
  const visible = expanded ? items : items.slice(0, MAX_VISIBLE);
  const openItems = items.filter((i) => !i.is_done);

  const add = async () => {
    setBusy(true);
    try {
      const created = await importTodos(openItems.map(({ title, notes, due_date, priority }) => ({ title, notes, due_date, priority })));
      setAdded(true);
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
        <Ionicons name="list" size={15} color={isOwn ? colors.white : '#dc4c3e'} />
        <Text style={styles.heading} numberOfLines={1}>
          {meta.title || (items.length === 1 ? 'To-do' : 'To-do list')}
        </Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>
      {visible.map((item) => (
        <View key={item.id} style={styles.item}>
          <Ionicons
            name={item.is_done ? 'checkmark-circle' : 'ellipse-outline'}
            size={17}
            color={item.is_done ? (isOwn ? colors.white : colors.green[600]) : (PRIORITY[item.priority]?.color || colors.gray[400])}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, item.is_done && styles.itemDone]} numberOfLines={2}>{item.title}</Text>
            {item.due_date && !isOwn && <DueChip date={item.due_date} time={item.due_time} done={item.is_done} compact />}
          </View>
        </View>
      ))}
      {items.length > MAX_VISIBLE && (
        <AnimatedPressable onPress={() => setExpanded((e) => !e)}>
          <Text style={styles.more}>{expanded ? 'Show less' : `+${items.length - MAX_VISIBLE} more`}</Text>
        </AnimatedPressable>
      )}
      {!isOwn && openItems.length > 0 && (
        <AnimatedPressable onPress={add} disabled={busy || added} haptic="medium" style={[styles.addBtn, (busy || added) && { opacity: 0.6 }]}>
          <Ionicons name={added ? 'checkmark' : 'add'} size={16} color={colors.white} />
          <Text style={styles.addText}>{added ? 'Added to my to-dos' : busy ? 'Adding…' : `Add ${openItems.length > 1 ? 'all ' : ''}to my to-dos`}</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const createStyles = (colors, isOwn) => StyleSheet.create({
  card: {
    minWidth: 220,
    maxWidth: 300,
    marginTop: 2,
    marginBottom: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: isOwn ? 'rgba(255,255,255,0.14)' : colors.gray[50],
    borderWidth: isOwn ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  heading: { flex: 1, fontSize: fontSize.sm, fontWeight: '800', color: isOwn ? colors.white : colors.gray[900] },
  count: { fontSize: 11, fontWeight: '700', color: isOwn ? 'rgba(255,255,255,0.8)' : colors.gray[400] },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  itemTitle: { fontSize: fontSize.sm, color: isOwn ? colors.white : colors.gray[800] },
  itemDone: { textDecorationLine: 'line-through', opacity: 0.6 },
  more: { fontSize: fontSize.xs, fontWeight: '700', color: isOwn ? colors.white : colors.brand[600], paddingVertical: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#dc4c3e',
  },
  addText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
});

export default memo(SharedTodosCard);
