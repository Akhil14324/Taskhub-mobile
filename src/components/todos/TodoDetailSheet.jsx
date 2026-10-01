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
import SubtaskList from './SubtaskList';
import TodoComments from './TodoComments';
import TodoTimeline from './TodoTimeline';
import { Avatar, Chip, PRIORITY, TodoCheckbox, accent, DueChip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { RECURRENCE_LABELS, timeAgo, formatDue } from '../../utils/dates';
import { DURATION_PRESETS, REMINDER_CHOICES, formatDuration, cleanLabel } from '../../utils/todoMeta';
import { showToast } from '../../utils/events';

export default function TodoDetailSheet({ todoId, onClose }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { todos, lists, sections, labels: knownLabels, updateTodo, toggleTodo, deleteTodo, duplicateTodo, removeMember, shareTodos } = useTodos();
  const { people } = useDirectory();

  // The sheet can hop to a parent / sub-task without closing.
  const [activeId, setActiveId] = useState(todoId);
  useEffect(() => { setActiveId(todoId); }, [todoId]);
  const todo = todos.find((t) => t.id === activeId);
  const parent = todo?.parent_id ? todos.find((t) => t.id === todo.parent_id) : null;
  const subtasks = useMemo(() => todos.filter((t) => t.parent_id === activeId), [todos, activeId]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState(null);
  const [labelText, setLabelText] = useState(null); // null = not adding
  const [customDuration, setCustomDuration] = useState(false);
  const [durationText, setDurationText] = useState('');
  const loadedFor = useRef(null);

  useEffect(() => {
    if (todo && loadedFor.current !== todo.id) {
      loadedFor.current = todo.id;
      setTitle(todo.title);
      setNotes(todo.notes || '');
      setPersonQuery(null);
      setLabelText(null);
      setCustomDuration(false);
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

  const todoLabels = todo?.labels || [];
  const labelQuery = labelText === null ? null : cleanLabel(labelText);
  const labelSuggestions = labelQuery === null ? [] : knownLabels
    .filter((l) => !todoLabels.includes(l.name) && (!labelQuery || l.name.includes(labelQuery)))
    .slice(0, 6);
  const addLabel = (raw) => {
    const label = cleanLabel(raw);
    if (label && !todoLabels.includes(label)) save({ labels: [...todoLabels, label] });
    setLabelText(null);
  };

  const listSections = todo?.list_id ? sections.filter((s) => s.list_id === todo.list_id) : [];
  const offsets = todo?.reminder_offsets || [];
  const toggleOffset = (m) => save({ reminder_offsets: offsets.includes(m) ? offsets.filter((x) => x !== m) : [...offsets, m] });

  const applyCustomDuration = () => {
    const m = /^(\d+(?:\.\d+)?)\s*(h|m)?$/i.exec(durationText.trim());
    if (m) {
      const amount = Number(m[1]);
      save({ duration_minutes: Math.max(1, Math.round(/^h/i.test(m[2] || '') ? amount * 60 : amount)) });
    }
    setCustomDuration(false);
    setDurationText('');
  };

  return (
    <BottomSheet visible={!!todoId && !!todo} onClose={onClose} maxHeight={760} avoidKeyboard>
      {todo && (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!!parent && (
            <AnimatedPressable style={styles.crumb} onPress={() => setActiveId(parent.id)} haptic="light">
              <Ionicons name="return-up-back" size={14} color={colors.gray[500]} />
              <Text style={styles.crumbText} numberOfLines={1}>{parent.title}</Text>
            </AnimatedPressable>
          )}
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
              <AnimatedPressable onPress={() => save({ due_date: null, due_time: null, recurrence: null, reminder_offsets: [] })} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
              </AnimatedPressable>
            )}
          </AnimatedPressable>
          <AnimatedPressable style={[styles.field, styles.fieldTight]} onPress={() => setDeadlineOpen(true)} haptic="light">
            <Ionicons name="alert-circle-outline" size={20} color={colors.gray[500]} />
            <View style={{ flex: 1 }}>
              {todo.deadline_date
                ? <Text style={styles.fieldValue}>Deadline · {formatDue(todo.deadline_date)}</Text>
                : <Text style={styles.fieldPlaceholder}>Add a deadline</Text>}
            </View>
            {todo.deadline_date && (
              <AnimatedPressable onPress={() => save({ deadline_date: null })} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
              </AnimatedPressable>
            )}
          </AnimatedPressable>

          <TodoTimeline todo={todo} />

          <Text style={styles.label}>Priority</Text>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4].map((p) => (
              <Chip key={p} icon="flag" color={PRIORITY[p].color} label={PRIORITY[p].short} active={todo.priority === p} onPress={() => save({ priority: p })} />
            ))}
          </View>

          <Text style={styles.label}>Time estimate</Text>
          <View style={styles.chipRow}>
            <Chip label="None" active={!todo.duration_minutes} onPress={() => save({ duration_minutes: null })} />
            {DURATION_PRESETS.map((m) => (
              <Chip key={m} icon="time-outline" label={formatDuration(m)} active={todo.duration_minutes === m} onPress={() => save({ duration_minutes: m })} />
            ))}
            {!!todo.duration_minutes && !DURATION_PRESETS.includes(todo.duration_minutes) && (
              <Chip icon="time-outline" label={formatDuration(todo.duration_minutes)} active />
            )}
            {customDuration ? (
              <TextInput
                autoFocus
                value={durationText}
                onChangeText={setDurationText}
                onSubmitEditing={applyCustomDuration}
                onBlur={applyCustomDuration}
                placeholder="e.g. 45m or 3h"
                placeholderTextColor={colors.gray[400]}
                style={styles.inlineInput}
              />
            ) : (
              <Chip icon="create-outline" label="Custom" onPress={() => setCustomDuration(true)} />
            )}
          </View>

          <Text style={styles.label}>Repeat</Text>
          <View style={styles.chipRow}>
            <Chip label="Never" active={!todo.recurrence} onPress={() => save({ recurrence: null })} />
            {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
              <Chip key={key} icon="repeat" color="#b91c1c" label={label} active={todo.recurrence === key} onPress={() => save({ recurrence: key })} />
            ))}
          </View>

          {!!todo.due_time && (
            <>
              <Text style={styles.label}>Remind me (as well as at the due time)</Text>
              <View style={styles.chipRow}>
                {REMINDER_CHOICES.map((r) => (
                  <Chip key={r.minutes} icon="alarm-outline" label={r.label} active={offsets.includes(r.minutes)} onPress={() => toggleOffset(r.minutes)} />
                ))}
              </View>
            </>
          )}

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

          {listSections.length > 0 && !todo.parent_id && (
            <>
              <Text style={styles.label}>Section</Text>
              <View style={styles.chipRow}>
                <Chip label="No section" active={!todo.section_id} onPress={() => save({ section_id: null })} />
                {listSections.map((s) => (
                  <Chip key={s.id} icon="albums-outline" label={s.name} active={todo.section_id === s.id} onPress={() => save({ section_id: s.id })} />
                ))}
              </View>
            </>
          )}

          {/* Labels */}
          <Text style={styles.label}>Labels</Text>
          <View style={styles.chipRow}>
            {todoLabels.map((l) => (
              <Chip key={l} icon="pricetag" label={l} active onRemove={() => save({ labels: todoLabels.filter((x) => x !== l) })} />
            ))}
            {labelText === null && <Chip icon="add" label="Label" onPress={() => setLabelText('')} />}
          </View>
          {labelText !== null && (
            <View>
              <TextInput
                autoFocus
                value={labelText}
                onChangeText={setLabelText}
                onSubmitEditing={() => addLabel(labelText)}
                onBlur={() => !labelText && setLabelText(null)}
                placeholder="Type a label, then Enter"
                placeholderTextColor={colors.gray[400]}
                style={styles.personInput}
                autoCapitalize="none"
              />
              <View style={[styles.chipRow, { marginBottom: spacing.sm }]}>
                {labelSuggestions.map((l) => (
                  <Chip key={l.name} small icon="pricetag-outline" label={l.name} onPress={() => addLabel(l.name)} />
                ))}
              </View>
            </View>
          )}

          {/* Sub-tasks (not for sub-tasks: one level deep) */}
          {!todo.parent_id && (
            <SubtaskList parent={todo} subtasks={subtasks} onOpen={setActiveId} />
          )}

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

          <TodoComments todo={todo} />

          <Text style={styles.meta}>
            Created by {todo.created_by === user?.id ? 'you' : todo.created_by_name} · {timeAgo(todo.created_at)}
            {todo.is_done && todo.done_by_name ? `\nCompleted by ${todo.done_by === user?.id ? 'you' : todo.done_by_name} · ${timeAgo(todo.done_at)}` : ''}
          </Text>

          <View style={styles.actions}>
            <ActionButton icon="paper-plane-outline" label="Share" color={colors.brand[600]} onPress={() => setShareOpen(true)} />
            <ActionButton
              icon="copy-outline"
              label="Duplicate"
              color={colors.brand[600]}
              onPress={() => duplicateTodo(todo).catch((err) => showToast({ message: err.response?.data?.error || 'Could not duplicate', tone: 'error' }))}
            />
            <ActionButton
              icon="trash-outline"
              label={isCreator ? 'Delete' : 'Remove'}
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
      <DueDatePicker
        visible={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        date={todo?.deadline_date}
        allowTime={false}
        onChange={({ date }) => save({ deadline_date: date })}
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
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  crumbText: { fontSize: fontSize.sm, color: colors.gray[500], flex: 1 },
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
  fieldTight: { marginTop: 0, borderTopWidth: 0 },
  fieldPlaceholder: { fontSize: fontSize.base, color: colors.gray[400] },
  fieldValue: { fontSize: fontSize.base, color: colors.gray[800], fontWeight: '500' },
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
  inlineInput: {
    backgroundColor: colors.gray[100],
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 120,
    fontSize: fontSize.sm,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
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
