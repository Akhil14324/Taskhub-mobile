import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import { TodoCheckbox, DueChip, Avatar } from '../kit';
import { buildTree, subtaskProgress } from '../../utils/todoMeta';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

const LEVEL = 20;

/**
 * The sub-tasks of one to-do, nested to any depth. Every row can be ticked, opened (it gets its own
 * description and comments) and can take sub-tasks of its own with the "+" button.
 */
export default function SubtaskTree({ parent, onOpen }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { todos, createTodo, toggleTodo } = useTodos();
  const [addingTo, setAddingTo] = useState(null); // todo id that is getting a new sub-task
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());

  const below = useMemo(() => todos.filter((t) => t.parent_id != null), [todos]);
  const tree = useMemo(() => {
    const family = new Set([parent.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of below) {
        if (family.has(t.parent_id) && !family.has(t.id)) {
          family.add(t.id);
          grew = true;
        }
      }
    }
    const items = todos.filter((t) => family.has(t.id) && t.id !== parent.id);
    return buildTree(items, todos);
  }, [todos, below, parent.id]);

  const progress = subtaskProgress(parent, todos);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const canAdd = parent.permissions ? parent.permissions.can_add_subtask : true;

  const startAdd = (id) => {
    setAddingTo(id);
    setText('');
  };

  const add = async (parentId) => {
    const title = text.trim();
    if (!title) {
      setAddingTo(null);
      return;
    }
    setText('');
    try {
      await createTodo({ title, parent_id: parentId }, { silent: true });
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    } catch (err) {
      setText(title);
      showToast({ message: err.response?.data?.error || 'Could not add the sub-task', tone: 'error' });
    }
  };

  const toggleCollapse = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const addField = (parentId, depth) => (
    <View style={[styles.addRow, { marginLeft: depth * LEVEL }]}>
      <Ionicons name="return-down-forward" size={16} color={colors.gray[400]} />
      <TextInput
        autoFocus
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => add(parentId)}
        onBlur={() => !text.trim() && setAddingTo(null)}
        blurOnSubmit={false}
        placeholder="Sub-task name, then Enter"
        placeholderTextColor={colors.gray[400]}
        {...glass('inset')} style={styles.input}
        returnKeyType="done"
      />
      <AnimatedPressable onPress={() => add(parentId)} hitSlop={8} disabled={!text.trim()}>
        <Ionicons name="arrow-up-circle" size={26} color={text.trim() ? colors.brand[600] : colors.gray[300]} />
      </AnimatedPressable>
    </View>
  );

  const renderNode = (node, depth) => {
    const t = node.todo;
    const isCollapsed = collapsed.has(t.id);
    const nodeCanAdd = t.permissions ? t.permissions.can_add_subtask : true;
    return (
      <View key={t.id}>
        <View style={[styles.row, { marginLeft: depth * LEVEL }]}>
          {node.children.length > 0 ? (
            <AnimatedPressable onPress={() => toggleCollapse(t.id)} hitSlop={8} style={styles.chev}>
              <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={15} color={colors.gray[400]} />
            </AnimatedPressable>
          ) : <View style={styles.chev} />}
          <TodoCheckbox
            checked={t.is_done}
            priority={t.priority}
            onPress={() => toggleTodo(t)}
            size={19}
          />
          <AnimatedPressable style={styles.rowBody} onPress={() => onOpen?.(t.id)}>
            <Text style={[styles.title, t.is_done && styles.titleDone]} numberOfLines={2}>{t.title}</Text>
            <View style={styles.meta}>
              {!!t.due_date && <DueChip date={t.due_date} time={t.due_time} done={t.is_done} compact />}
              {t.business_id && !!t.assignee_name && t.assignee_id !== parent.assignee_id && (
                <View style={styles.assignee}>
                  <Avatar name={t.assignee_name} uri={t.assignee_picture} size={14} />
                  <Text style={styles.metaText}>{t.assignee_name.split(' ')[0]}</Text>
                </View>
              )}
              {t.comment_count > 0 && (
                <View style={styles.assignee}>
                  <Ionicons name="chatbubble-outline" size={11} color={colors.gray[500]} />
                  <Text style={styles.metaText}>{t.comment_count}</Text>
                </View>
              )}
              {!!t.notes && <Ionicons name="document-text-outline" size={12} color={colors.gray[400]} />}
            </View>
          </AnimatedPressable>
          {nodeCanAdd && depth < 7 && (
            <AnimatedPressable onPress={() => startAdd(t.id)} hitSlop={8} accessibilityLabel="Add a sub-task here">
              <Ionicons name="add" size={20} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </View>
        {!isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
        {addingTo === t.id && addField(t.id, depth + 1)}
      </View>
    );
  };

  return (
    <View>
      <Text style={styles.label}>Sub-tasks{progress.total ? ` · ${progress.done}/${progress.total}` : ''}</Text>
      {progress.total > 0 && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      )}
      {tree.map((node) => renderNode(node, 0))}
      {addingTo === parent.id ? addField(parent.id, 0) : canAdd && (
        <AnimatedPressable style={styles.addButton} onPress={() => startAdd(parent.id)}>
          <Ionicons name="add" size={18} color={colors.brand[600]} />
          <Text style={styles.addText}>Add sub-task</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.gray[200], marginHorizontal: spacing.sm, marginBottom: spacing.sm, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.brand[600] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 7, paddingHorizontal: spacing.sm },
  chev: { width: 16, paddingTop: 3, alignItems: 'center' },
  rowBody: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.base, color: colors.gray[900] },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  assignee: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.gray[500] },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  addText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  input: {
    flex: 1,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
});
