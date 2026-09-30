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
import { parseQuickAdd, activeMentionQuery, completeMention } from '../../utils/quickAdd';
import { formatDue, formatTime, RECURRENCE_LABELS } from '../../utils/dates';
import { showToast } from '../../utils/events';

const RECURRENCE_ORDER = [null, 'daily', 'weekdays', 'weekly', 'monthly'];

/**
 * Todoist-style quick add. Type naturally — dates, times, p1–p4, #List, @person and
 * "every day" are recognised live and shown as chips. Enter adds and keeps the sheet
 * open for the next one.
 */
export default function QuickAddSheet({ visible, onClose, defaults = {}, initialText = '' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { lists, createTodo } = useTodos();
  const { people } = useDirectory();
  const inputRef = useRef(null);

  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  // Explicit picks from the buttons win over what the parser finds; `false` = cleared.
  const [override, setOverride] = useState({});
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(null); // 'priority' | 'list' | null

  useEffect(() => {
    if (visible) {
      setText(initialText || '');
      setNotes('');
      setShowNotes(false);
      setOverride({});
      setMenu(null);
      setTimeout(() => inputRef.current?.focus(), Platform.OS === 'web' ? 50 : 250);
    }
  }, [visible, initialText]);

  const parsed = useMemo(() => parseQuickAdd(text, lists), [text, lists]);
  const pick = (key, fallback) => (override[key] === false ? null : override[key] ?? parsed[key] ?? fallback ?? null);
  const dueDate = pick('due_date', defaults.due_date);
  const dueTime = dueDate ? pick('due_time') : null;
  const priority = pick('priority', 4);
  const recurrence = pick('recurrence');
  const listId = override.list_id !== undefined ? override.list_id : (parsed.list?.id ?? defaults.list_id ?? null);
  const list = lists.find((l) => l.id === listId);

  const mentionQuery = activeMentionQuery(text);
  const suggestions = mentionQuery !== null ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 6 }) : [];
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
        mention_ids: mentionedPeople.map((p) => p.id),
      });
      setText('');
      setNotes('');
      setOverride({});
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

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={560} avoidKeyboard>
      <View style={styles.wrap}>
        <MentionSuggestions
          people={suggestions}
          onPick={(p) => {
            setText((t) => completeMention(t, p.username));
            inputRef.current?.focus();
          }}
          style={styles.suggestions}
        />

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="e.g. Call supplier tomorrow 4pm p1 @varun"
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
              color="#058527"
              label={`${formatDue(dueDate)}${dueTime ? ` ${formatTime(dueTime)}` : ''}`}
              onRemove={() => setOverride((o) => ({ ...o, due_date: false, due_time: false }))}
            />
          )}
          {recurrence && (
            <Chip small icon="repeat" color="#692ec2" label={RECURRENCE_LABELS[recurrence]} onRemove={() => setOverride((o) => ({ ...o, recurrence: false }))} />
          )}
          {priority < 4 && (
            <Chip small icon="flag" color={PRIORITY[priority].color} label={PRIORITY[priority].short} onRemove={() => setOverride((o) => ({ ...o, priority: 4 }))} />
          )}
          {list && <Chip small icon="list" color={accent(list.color)} label={list.name} onRemove={() => setOverride((o) => ({ ...o, list_id: null }))} />}
          {mentionedPeople.map((p) => (
            <Chip key={p.id} small icon="person" color={colors.brand[600]} label={`Shared with ${p.name.split(' ')[0]}`} />
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
            <ToolButton icon="calendar-outline" active={!!dueDate} color="#058527" onPress={() => setDateOpen(true)} />
            <ToolButton icon="flag-outline" active={priority < 4} color={PRIORITY[priority]?.color} onPress={() => setMenu(menu === 'priority' ? null : 'priority')} />
            <ToolButton icon="pricetag-outline" active={!!list} color={list ? accent(list.color) : undefined} onPress={() => setMenu(menu === 'list' ? null : 'list')} />
            <ToolButton icon="repeat" active={!!recurrence} color="#692ec2" onPress={cycleRecurrence} />
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
    </BottomSheet>
  );
}

function ToolButton({ icon, active, color, onPress }) {
  const colors = useColors();
  return (
    <AnimatedPressable onPress={onPress} haptic="light" hitSlop={4} style={{ padding: 8, borderRadius: radius.md }}>
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
  tools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dc4c3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
