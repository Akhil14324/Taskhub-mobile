import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import ShareToChatSheet from '../ShareToChatSheet';
import { Avatar, Chip, PRIORITY, TodoCheckbox, accent, DueChip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { RECURRENCE_LABELS, timeAgo } from '../../utils/dates';
import { showToast } from '../../utils/events';

export default function TodoDetailSheet({ todoId, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, lists, updateTodo, toggleTodo, deleteTodo, removeMember, shareTodos } = useTodos();
  const { people } = useDirectory();
  const todo = todos.find((t) => t.id === todoId);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState(null);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (todo && loadedFor.current !== todo.id) {
      loadedFor.current = todo.id;
      setTitle(todo.title);
      setNotes(todo.notes || '');
      setPersonQuery(null);
    }
    if (!todoId) loadedFor.current = null;
  }, [todo, todoId]);

  const save = (patch) => {
    if (!todo) return;
    updateTodo(todo.id, patch).catch((err) => {
      showToast({ message: err.response?.data?.error || 'Could not save', tone: 'error' });
    });
  };

  const members = todo?.members || [];
  const isCreator = todo?.created_by === user?.id;
  const suggestions = personQuery !== null
    ? filterPeople(people, personQuery, { excludeIds: members.map((m) => m.id), limit: 6 })
    : [];

  return (
    <BottomSheet visible={!!todoId && !!todo} onClose={onClose} maxHeight={720} avoidKeyboard>
      {todo && (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <View style={{ paddingTop: 6 }}>
              <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => toggleTodo(todo)} size={24} />
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={() => title.trim() && title.trim() !== todo.title && save({ title: title.trim() })}
              style={[styles.title, todo.is_done && styles.titleDone]}
              multiline
              placeholder="To-do"
              placeholderTextColor={colors.gray[400]}
            />
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={() => notes !== (todo.notes || '') && save({ notes })}
            style={styles.notes}
            placeholder="Add a description…"
            placeholderTextColor={colors.gray[400]}
            multiline
          />

          {/* Schedule */}
          <AnimatedPressable style={styles.field} onPress={() => setDateOpen(true)} haptic="light">
            <Ionicons name="calendar-outline" size={20} color={colors.gray[500]} />
            <View style={{ flex: 1 }}>
              {todo.due_date ? <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} /> : <Text style={styles.fieldPlaceholder}>Add a date</Text>}
            </View>
            {todo.due_date && (
              <AnimatedPressable onPress={() => save({ due_date: null, due_time: null, recurrence: null })} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
              </AnimatedPressable>
            )}
          </AnimatedPressable>

          <Text style={styles.label}>Priority</Text>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4].map((p) => (
              <Chip key={p} icon="flag" color={PRIORITY[p].color} label={PRIORITY[p].short} active={todo.priority === p} onPress={() => save({ priority: p })} />
            ))}
          </View>

          <Text style={styles.label}>Repeat</Text>
          <View style={styles.chipRow}>
            <Chip label="Never" active={!todo.recurrence} onPress={() => save({ recurrence: null })} />
            {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
              <Chip key={key} icon="repeat" color="#692ec2" label={label} active={todo.recurrence === key} onPress={() => save({ recurrence: key })} />
            ))}
          </View>

          <Text style={styles.label}>List</Text>
          <View style={styles.chipRow}>
            <Chip icon="file-tray" label="Inbox" active={!todo.list_id} onPress={() => save({ list_id: null })} />
            {lists.map((l) => (
              <Chip
                key={l.id}
                icon="list"
                color={accent(l.color)}
                label={`${l.emoji ? `${l.emoji} ` : ''}${l.name}`}
                active={todo.list_id === l.id}
                onPress={() => save({ list_id: l.id })}
              />
            ))}
          </View>

          {/* People */}
          <Text style={styles.label}>Shared with</Text>
          {members.map((m) => (
            <View key={m.id} style={styles.person}>
              <Avatar name={m.name} uri={m.profile_picture} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{m.id === user?.id ? `${m.name} (you)` : m.name}</Text>
                <Text style={styles.personMeta}>@{m.username}{m.id === todo.created_by ? ' · creator' : ''}</Text>
              </View>
              {isCreator && m.id !== todo.created_by && (
                <AnimatedPressable onPress={() => removeMember(todo.id, m.id)} hitSlop={8} haptic="light">
                  <Ionicons name="remove-circle-outline" size={20} color={colors.red[500]} />
                </AnimatedPressable>
              )}
            </View>
          ))}
          {personQuery === null ? (
            <AnimatedPressable style={styles.addPerson} onPress={() => setPersonQuery('')} haptic="light">
              <Ionicons name="person-add-outline" size={18} color={colors.brand[600]} />
              <Text style={styles.addPersonText}>Add someone — it appears in their list too</Text>
            </AnimatedPressable>
          ) : (
            <View>
              <TextInput
                autoFocus
                value={personQuery}
                onChangeText={setPersonQuery}
                placeholder="Type a name or @username"
                placeholderTextColor={colors.gray[400]}
                style={styles.personInput}
              />
              <MentionSuggestions
                people={suggestions}
                onPick={(p) => {
                  setPersonQuery(null);
                  save({ mention_ids: [p.id] });
                  showToast({ message: `${p.name.split(' ')[0]} can now see and tick this`, tone: 'success', icon: 'people' });
                }}
              />
            </View>
          )}

          <Text style={styles.meta}>
            Created by {todo.created_by === user?.id ? 'you' : todo.created_by_name} · {timeAgo(todo.created_at)}
            {todo.is_done && todo.done_by_name ? `\nCompleted by ${todo.done_by === user?.id ? 'you' : todo.done_by_name} · ${timeAgo(todo.done_at)}` : ''}
          </Text>

          <View style={styles.actions}>
            <ActionButton icon="paper-plane-outline" label="Share to chat" color={colors.brand[600]} onPress={() => setShareOpen(true)} />
            <ActionButton
              icon="trash-outline"
              label={isCreator ? 'Delete' : 'Remove from my list'}
              color={colors.red[600]}
              onPress={() => {
                onClose();
                deleteTodo(todo);
              }}
            />
          </View>
        </ScrollView>
      )}

      <DueDatePicker
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        date={todo?.due_date}
        time={todo?.due_time}
        onChange={({ date, time }) => save({ due_date: date, due_time: time })}
      />
      <ShareToChatSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        heading="Share to-do"
        subheading={todo?.title}
        onSend={({ conversationIds, note }) => shareTodos({ conversationIds, todoIds: [todo.id], note })}
      />
    </BottomSheet>
  );
}

function ActionButton({ icon, label, color, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: radius.lg,
        backgroundColor: colors.gray[100],
      }}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={{ color, fontWeight: '600', fontSize: fontSize.sm }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  titleRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.sm },
  title: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray[900],
    paddingVertical: 4,
    outlineStyle: 'none',
  },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  notes: {
    fontSize: fontSize.base,
    color: colors.gray[700],
    paddingHorizontal: spacing.sm,
    marginLeft: 24 + spacing.md,
    minHeight: 36,
    outlineStyle: 'none',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  fieldPlaceholder: { fontSize: fontSize.base, color: colors.gray[400] },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6, paddingHorizontal: spacing.sm },
  personName: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  personMeta: { fontSize: fontSize.xs, color: colors.gray[500] },
  addPerson: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  addPersonText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  personInput: {
    marginHorizontal: spacing.sm,
    marginVertical: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  meta: { fontSize: fontSize.xs, color: colors.gray[400], marginTop: spacing.lg, paddingHorizontal: spacing.sm, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
});
