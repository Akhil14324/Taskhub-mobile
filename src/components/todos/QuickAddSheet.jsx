import { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, StyleSheet, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import { Chip, PRIORITY, accent } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import {
  parseQuickAdd, activeMentionQuery, completeMention, activeLabelQuery, completeLabel, removeLabelToken,
} from '../../utils/quickAdd';
import { formatDue, formatTime, RECURRENCE_LABELS } from '../../utils/dates';
import { DURATION_PRESETS, formatDuration } from '../../utils/todoMeta';
import { showToast } from '../../utils/events';

const RECURRENCE_ORDER = [null, 'daily', 'weekdays', 'weekly', 'monthly'];

/**
 * Todoist-style quick add. Type naturally — dates, times, p1–p4, #List, @person, +label,
 * "for 2h" (estimate), "{15 oct}" (deadline) and "every day" are recognised live and shown as
 * chips. Enter adds and keeps the sheet open for the next one.
 * `defaults` may carry due_date, list_id, section_id and parent_id (to add a sub-task).
 */
export default function QuickAddSheet({ visible, onClose, defaults = {}, initialText = '' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { lists, labels: knownLabels, createTodo } = useTodos();
  const { people } = useDirectory();
  const inputRef = useRef(null);

  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  // Explicit picks from the buttons win over what the parser finds; `false` = cleared.
  const [override, setOverride] = useState({});
  const [extraLabels, setExtraLabels] = useState([]);
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(null); // 'priority' | 'list' | 'duration' | 'label' | null
  // The person made accountable for the to-do (must be one of the @mentioned); others just share it.
  const [assignId, setAssignId] = useState(null);

  useEffect(() => {
    if (visible) {
      setText(initialText || '');
      setNotes('');
      setShowNotes(false);
      setOverride({});
      setExtraLabels(defaults.labels || []);
      setAssignId(null);
      setMenu(null);
      setTimeout(() => inputRef.current?.focus(), Platform.OS === 'web' ? 50 : 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialText]);

  const parsed = useMemo(() => parseQuickAdd(text, lists), [text, lists]);
  const pick = (key, fallback) => (override[key] === false ? null : override[key] ?? parsed[key] ?? fallback ?? null);
  const isSubtask = !!defaults.parent_id;
  const dueDate = pick('due_date', defaults.due_date);
  const dueTime = dueDate ? pick('due_time') : null;
  const priority = pick('priority', 4);
  const recurrence = pick('recurrence');
  const deadline = pick('deadline_date');
  const duration = pick('duration_minutes');
  const listId = override.list_id !== undefined ? override.list_id : (parsed.list?.id ?? defaults.list_id ?? null);
  const list = lists.find((l) => l.id === listId);
  // A default section only applies while the list is still the default one.
  const sectionId = listId && listId === defaults.list_id ? defaults.section_id ?? null : null;
  const allLabels = [...new Set([...parsed.labels, ...extraLabels])];

  const mentionQuery = activeMentionQuery(text);
  const suggestions = mentionQuery !== null ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 6 }) : [];
  const labelQuery = activeLabelQuery(text);
  const labelSuggestions = labelQuery !== null
    ? knownLabels.filter((l) => !allLabels.includes(l.name) && l.name.includes(labelQuery)).slice(0, 6)
    : [];
  const mentionedPeople = parsed.mentions
    .map((u) => people.find((p) => p.username?.toLowerCase() === u.toLowerCase()))
    .filter(Boolean);

  const submit = async () => {
    if (!parsed.title || saving) return;
    setSaving(true);
    try {
      await createTodo({
        title: parsed.title,
        notes,
        due_date: dueDate,
        due_time: dueTime,
        priority,
        recurrence,
        list_id: listId,
        section_id: sectionId,
        parent_id: defaults.parent_id || undefined,
        labels: allLabels,
        deadline_date: deadline,
        duration_minutes: duration,
        mention_ids: mentionedPeople.map((p) => p.id),
        assign_to: mentionedPeople.some((p) => p.id === assignId) ? assignId : undefined,
      });
      setAssignId(null);
      setText('');
      setNotes('');
      setOverride({});
      setExtraLabels(defaults.labels || []);
      inputRef.current?.focus();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add the to-do', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const cycleRecurrence = () => {
    const idx = RECURRENCE_ORDER.indexOf(recurrence);
    const next = RECURRENCE_ORDER[(idx + 1) % RECURRENCE_ORDER.length];
    setOverride((o) => ({ ...o, recurrence: next || false }));
  };

  const removeLabel = (label) => {
    setText((t) => removeLabelToken(t, label));
    setExtraLabels((prev) => prev.filter((l) => l !== label));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={600} avoidKeyboard>
      <View style={styles.wrap}>
        <MentionSuggestions
          people={suggestions}
          onPick={(p) => {
            setText((t) => completeMention(t, p.username));
            inputRef.current?.focus();
          }}
          style={styles.suggestions}
        />
        {labelSuggestions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            {labelSuggestions.map((l) => (
              <Chip
                key={l.name}
                small
                icon="pricetag-outline"
                label={l.name}
                onPress={() => {
                  setText((t) => completeLabel(t, l.name));
                  inputRef.current?.focus();
                }}
              />
            ))}
          </ScrollView>
        )}

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={isSubtask ? 'Sub-task, e.g. Collect invoices tomorrow' : 'e.g. Call supplier tomorrow 4pm p1 @varun +finance for 1h'}
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          onSubmitEditing={submit}
          blurOnSubmit={false}
          returnKeyType="done"
          autoCorrect
        />
        {showNotes ? (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Description"
            placeholderTextColor={colors.gray[400]}
            style={styles.notes}
            multiline
          />
        ) : null}

        {/* What we understood */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="always">
          {dueDate && (
            <Chip
              small
              icon="calendar"
              color="#dc2626"
              label={`${formatDue(dueDate)}${dueTime ? ` ${formatTime(dueTime)}` : ''}`}
              onRemove={() => setOverride((o) => ({ ...o, due_date: false, due_time: false }))}
            />
          )}
          {deadline && (
            <Chip small icon="alert-circle" color="#991b1b" label={`Deadline ${formatDue(deadline)}`} onRemove={() => setOverride((o) => ({ ...o, deadline_date: false }))} />
          )}
          {duration && (
            <Chip small icon="time" color="#b91c1c" label={formatDuration(duration)} onRemove={() => setOverride((o) => ({ ...o, duration_minutes: false }))} />
          )}
          {recurrence && (
            <Chip small icon="repeat" color="#b91c1c" label={RECURRENCE_LABELS[recurrence]} onRemove={() => setOverride((o) => ({ ...o, recurrence: false }))} />
          )}
          {priority < 4 && (
            <Chip small icon="flag" color={PRIORITY[priority].color} label={PRIORITY[priority].short} onRemove={() => setOverride((o) => ({ ...o, priority: 4 }))} />
          )}
          {!isSubtask && list && <Chip small icon="list" color={accent(list.color)} label={list.name} onRemove={() => setOverride((o) => ({ ...o, list_id: null }))} />}
          {allLabels.map((l) => (
            <Chip key={l} small icon="pricetag" color="#dc2626" label={l} onRemove={() => removeLabel(l)} />
          ))}
          {mentionedPeople.map((p) => (
            <Chip
              key={p.id}
              small
              icon={assignId === p.id ? 'person-add' : 'person'}
              color={colors.brand[600]}
              active={assignId === p.id}
              label={assignId === p.id ? `Assigned to ${p.name.split(' ')[0]}` : `Shared with ${p.name.split(' ')[0]} · tap to assign`}
              onPress={() => setAssignId(assignId === p.id ? null : p.id)}
            />
          ))}
        </ScrollView>

        {menu === 'priority' && (
          <View style={styles.menuRow}>
            {[1, 2, 3, 4].map((p) => (
              <Chip
                key={p}
                icon="flag"
                color={PRIORITY[p].color}
                label={PRIORITY[p].short}
                active={priority === p}
                onPress={() => {
                  setOverride((o) => ({ ...o, priority: p }));
                  setMenu(null);
                }}
              />
            ))}
          </View>
        )}
        {menu === 'duration' && (
          <View style={styles.menuRow}>
            <Chip label="None" active={!duration} onPress={() => { setOverride((o) => ({ ...o, duration_minutes: false })); setMenu(null); }} />
            {DURATION_PRESETS.map((m) => (
              <Chip
                key={m}
                icon="time-outline"
                label={formatDuration(m)}
                active={duration === m}
                onPress={() => {
                  setOverride((o) => ({ ...o, duration_minutes: m }));
                  setMenu(null);
                }}
              />
            ))}
          </View>
        )}
        {menu === 'label' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            {knownLabels.length === 0 && <Chip small label="Type +name in the box to create a label" />}
            {knownLabels.map((l) => (
              <Chip
                key={l.name}
                icon="pricetag-outline"
                label={l.name}
                active={allLabels.includes(l.name)}
                onPress={() => (allLabels.includes(l.name)
                  ? removeLabel(l.name)
                  : setExtraLabels((prev) => [...prev, l.name]))}
              />
            ))}
          </ScrollView>
        )}
        {menu === 'list' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            <Chip icon="file-tray" label="Inbox" active={!listId} onPress={() => { setOverride((o) => ({ ...o, list_id: null })); setMenu(null); }} />
            {lists.map((l) => (
              <Chip
                key={l.id}
                icon="list"
                color={accent(l.color)}
                label={`${l.emoji ? `${l.emoji} ` : ''}${l.name}`}
                active={listId === l.id}
                onPress={() => {
                  setOverride((o) => ({ ...o, list_id: l.id }));
                  setMenu(null);
                }}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.toolbar}>
          <View style={styles.tools}>
            <ToolButton icon="calendar-outline" active={!!dueDate} color="#dc2626" onPress={() => setDateOpen(true)} />
            <ToolButton icon="flag-outline" active={priority < 4} color={PRIORITY[priority]?.color} onPress={() => setMenu(menu === 'priority' ? null : 'priority')} />
            {!isSubtask && (
              <ToolButton icon="albums-outline" active={!!list} color={list ? accent(list.color) : undefined} onPress={() => setMenu(menu === 'list' ? null : 'list')} />
            )}
            <ToolButton icon="pricetag-outline" active={allLabels.length > 0} color="#dc2626" onPress={() => setMenu(menu === 'label' ? null : 'label')} />
            <ToolButton icon="time-outline" active={!!duration} color="#b91c1c" onPress={() => setMenu(menu === 'duration' ? null : 'duration')} />
            <ToolButton icon="alert-circle-outline" active={!!deadline} color="#991b1b" onPress={() => setDeadlineOpen(true)} />
            <ToolButton icon="repeat" active={!!recurrence} color="#b91c1c" onPress={cycleRecurrence} />
            <ToolButton
              icon="at"
              active={mentionedPeople.length > 0}
              onPress={() => {
                setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`);
                inputRef.current?.focus();
              }}
            />
            <ToolButton icon="document-text-outline" active={showNotes} onPress={() => setShowNotes((v) => !v)} />
          </View>
          <AnimatedPressable
            onPress={submit}
            disabled={!parsed.title || saving}
            haptic="medium"
            style={[styles.send, (!parsed.title || saving) && styles.sendDisabled]}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </AnimatedPressable>
        </View>
      </View>

      <DueDatePicker
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        date={dueDate}
        time={dueTime}
        onChange={({ date, time }) => setOverride((o) => ({ ...o, due_date: date || false, due_time: time || false }))}
      />
      <DueDatePicker
        visible={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        date={deadline}
        allowTime={false}
        onChange={({ date }) => setOverride((o) => ({ ...o, deadline_date: date || false }))}
      />
    </BottomSheet>
  );
}

function ToolButton({ icon, active, color, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} haptic="light" hitSlop={4} style={{ padding: 7, borderRadius: radius.md }}>
      <Ionicons name={icon} size={21} color={active ? (color || colors.brand[600]) : colors.gray[500]} />
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm },
  suggestions: { marginBottom: spacing.sm },
  input: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    paddingVertical: spacing.sm,
    outlineStyle: 'none',
  },
  notes: {
    fontSize: fontSize.base,
    color: colors.gray[700],
    minHeight: 44,
    paddingVertical: spacing.xs,
    outlineStyle: 'none',
  },
  chips: { gap: spacing.xs, paddingVertical: spacing.sm, minHeight: 36 },
  menuRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
    paddingTop: spacing.sm,
  },
  tools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
