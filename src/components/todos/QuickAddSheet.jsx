import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import { Chip, PRIORITY, Avatar } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import {
  parseQuickAdd, activeMentionQuery, completeMention, activeLabelQuery, completeLabel, removeLabelToken,
} from '../../utils/quickAdd';
import { formatDue, formatTime, RECURRENCE_LABELS } from '../../utils/dates';
import { DURATION_PRESETS, formatDuration } from '../../utils/todoMeta';
import { showToast } from '../../utils/events';

const RECURRENCE_ORDER = [null, 'daily', 'weekdays', 'weekly', 'monthly'];

/**
 * Quick add. Type naturally: dates, times, p1 to p4, #List, @person, +label, "for 2h" (estimate),
 * "{15 oct}" (deadline) and "every day" are recognised and shown as chips. Enter adds and keeps the
 * sheet open for the next one. Everything rarely needed sits behind "More".
 *
 * It adds either a personal to-do or, when a business is chosen, work for that business: set directly
 * by someone who manages it, otherwise sent as a proposal for review.
 * `defaults` may carry due_date, list_id, section_id, parent_id (a sub-task), business_id, assign_to.
 */
export default function QuickAddSheet({ visible, onClose, defaults = {}, initialText = '' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { lists, businesses, labels: knownLabels, createTodo, fetchAssignees } = useTodos();
  const { people } = useDirectory();
  const inputRef = useRef(null);

  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  // Explicit picks from the buttons win over what the parser finds; `false` = cleared.
  const [override, setOverride] = useState({});
  const [extraLabels, setExtraLabels] = useState([]);
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(null); // 'priority' | 'where' | 'label' | 'more' | 'assignee' | null
  // The person made accountable for a personal to-do (must be one of the @mentioned); others just share it.
  const [assignId, setAssignId] = useState(null);
  const [bizAssignee, setBizAssignee] = useState(null); // user id, null = open to the business
  const [bizPeople, setBizPeople] = useState([]);
  const [review, setReview] = useState(null); // null = server default

  const isSubtask = !!defaults.parent_id;
  const businessId = override.business_id !== undefined ? override.business_id : (defaults.business_id ?? null);
  const business = businesses.find((b) => b.id === businessId) || null;

  useEffect(() => {
    if (visible) {
      setText(initialText || '');
      setNotes('');
      setOverride({});
      setExtraLabels(defaults.labels || []);
      setAssignId(null);
      setBizAssignee(defaults.assign_to ?? null);
      setReview(null);
      setMenu(null);
      setTimeout(() => inputRef.current?.focus(), Platform.OS === 'web' ? 50 : 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialText]);

  // People business work can be given to.
  useEffect(() => {
    setBizPeople([]);
    if (!visible || !businessId) return;
    fetchAssignees(businessId).then(setBizPeople).catch(() => setBizPeople([]));
  }, [visible, businessId, fetchAssignees]);

  const parsed = useMemo(() => parseQuickAdd(text, lists), [text, lists]);
  const pick = (key, fallback) => (override[key] === false ? null : override[key] ?? parsed[key] ?? fallback ?? null);
  const dueDate = pick('due_date', defaults.due_date);
  const dueTime = dueDate ? pick('due_time') : null;
  const priority = pick('priority', 4);
  const recurrence = pick('recurrence');
  const deadline = pick('deadline_date');
  const duration = pick('duration_minutes');
  const listId = businessId ? null : (override.list_id !== undefined ? override.list_id : (parsed.list?.id ?? defaults.list_id ?? null));
  const list = lists.find((l) => l.id === listId);
  // A default section only applies while the list is still the default one.
  const sectionId = (listId ?? null) === (defaults.list_id ?? null) ? defaults.section_id ?? null : null;
  const allLabels = [...new Set([...parsed.labels, ...extraLabels])];

  const mentionQuery = activeMentionQuery(text);
  const suggestions = mentionQuery !== null && !businessId
    ? filterPeople(people, mentionQuery, { excludeIds: [user?.id], limit: 6 })
    : [];
  const labelQuery = activeLabelQuery(text);
  const labelSuggestions = labelQuery !== null
    ? knownLabels.filter((l) => !allLabels.includes(l.name) && l.name.includes(labelQuery)).slice(0, 6)
    : [];
  const mentionedPeople = businessId ? [] : parsed.mentions
    .map((u) => people.find((p) => p.username?.toLowerCase() === u.toLowerCase()))
    .filter(Boolean);
  const assignee = bizPeople.find((p) => p.id === bizAssignee) || null;
  const proposing = !!business && !business.can_manage && !isSubtask;

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
        business_id: businessId || undefined,
        assign_to: businessId
          ? (bizAssignee || undefined)
          : (mentionedPeople.some((p) => p.id === assignId) ? assignId : undefined),
        requires_approval: businessId && review !== null ? review : undefined,
        labels: allLabels,
        deadline_date: deadline,
        duration_minutes: duration,
        mention_ids: mentionedPeople.map((p) => p.id),
      });
      setAssignId(null);
      setText('');
      setNotes('');
      setOverride((o) => ({ business_id: o.business_id }));
      setExtraLabels(defaults.labels || []);
      inputRef.current?.focus();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not add it', tone: 'error' });
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

  const hasBusinesses = businesses.length > 0 && !isSubtask;
  const placeholder = isSubtask
    ? 'Sub-task, e.g. Collect invoices tomorrow'
    : business ? `Task for ${business.name}, e.g. Send the quote friday p1` : 'e.g. Call supplier tomorrow 4pm p1 +finance for 1h';

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={640} avoidKeyboard>
      <View style={styles.wrap}>
        {hasBusinesses && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow} keyboardShouldPersistTaps="always">
            <Chip small icon="person-outline" label="Personal" active={!businessId} onPress={() => setOverride((o) => ({ ...o, business_id: null }))} />
            {businesses.map((b) => (
              <Chip
                key={b.id}
                small
                icon="briefcase-outline"
                label={b.name}
                active={businessId === b.id}
                onPress={() => {
                  setOverride((o) => ({ ...o, business_id: b.id }));
                  setBizAssignee(null);
                }}
              />
            ))}
          </ScrollView>
        )}
        {proposing && (
          <Text style={styles.note}>You can propose this. A manager of {business.name} accepts or declines it.</Text>
        )}

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
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          onSubmitEditing={submit}
          blurOnSubmit={false}
          returnKeyType="done"
          autoCorrect
        />
        {menu === 'notes' && (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Description"
            placeholderTextColor={colors.gray[400]}
            style={styles.notes}
            multiline
          />
        )}

        {/* What we understood */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="always">
          {dueDate && (
            <Chip
              small
              icon="calendar"
              label={`${formatDue(dueDate)}${dueTime ? ` ${formatTime(dueTime)}` : ''}`}
              onRemove={() => setOverride((o) => ({ ...o, due_date: false, due_time: false }))}
            />
          )}
          {deadline && (
            <Chip small icon="alert-circle" label={`Deadline ${formatDue(deadline)}`} onRemove={() => setOverride((o) => ({ ...o, deadline_date: false }))} />
          )}
          {duration && (
            <Chip small icon="time" label={formatDuration(duration)} onRemove={() => setOverride((o) => ({ ...o, duration_minutes: false }))} />
          )}
          {recurrence && (
            <Chip small icon="repeat" label={RECURRENCE_LABELS[recurrence]} onRemove={() => setOverride((o) => ({ ...o, recurrence: false }))} />
          )}
          {priority < 4 && (
            <Chip small icon="flag" color={PRIORITY[priority].color} label={PRIORITY[priority].short} onRemove={() => setOverride((o) => ({ ...o, priority: 4 }))} />
          )}
          {!isSubtask && list && <Chip small icon="list" label={list.name} onRemove={() => setOverride((o) => ({ ...o, list_id: null }))} />}
          {!!assignee && <Chip small icon="person" label={`For ${assignee.name.split(' ')[0]}`} onRemove={() => setBizAssignee(null)} />}
          {review === true && <Chip small icon="eye-outline" label="Needs review" onRemove={() => setReview(null)} />}
          {allLabels.map((l) => (
            <Chip key={l} small icon="pricetag" label={l} onRemove={() => removeLabel(l)} />
          ))}
          {mentionedPeople.map((p) => (
            <Chip
              key={p.id}
              small
              icon={assignId === p.id ? 'person-add' : 'person'}
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
        {menu === 'more' && (
          <View>
            <View style={styles.menuRow}>
              <Chip icon="alert-circle-outline" label={deadline ? `Deadline ${formatDue(deadline)}` : 'Deadline'} active={!!deadline} onPress={() => setDeadlineOpen(true)} />
              <Chip icon="repeat" label={recurrence ? RECURRENCE_LABELS[recurrence] : 'Repeat'} active={!!recurrence} onPress={cycleRecurrence} />
              <Chip icon="document-text-outline" label="Description" onPress={() => setMenu('notes')} />
              {!!businessId && !isSubtask && (
                <Chip icon="eye-outline" label="Needs review when done" active={review === true} onPress={() => setReview(review === true ? null : true)} />
              )}
            </View>
            <View style={styles.menuRow}>
              <Chip label="No estimate" active={!duration} onPress={() => setOverride((o) => ({ ...o, duration_minutes: false }))} />
              {DURATION_PRESETS.map((m) => (
                <Chip key={m} icon="time-outline" label={formatDuration(m)} active={duration === m} onPress={() => setOverride((o) => ({ ...o, duration_minutes: m }))} />
              ))}
            </View>
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
        {menu === 'where' && !businessId && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuRow} keyboardShouldPersistTaps="always">
            <Chip icon="file-tray" label="Inbox" active={!listId} onPress={() => { setOverride((o) => ({ ...o, list_id: null })); setMenu(null); }} />
            {lists.map((l) => (
              <Chip
                key={l.id}
                icon="list"
                label={l.name}
                active={listId === l.id}
                onPress={() => {
                  setOverride((o) => ({ ...o, list_id: l.id }));
                  setMenu(null);
                }}
              />
            ))}
          </ScrollView>
        )}
        {menu === 'assignee' && !!businessId && (
          <ScrollView style={{ maxHeight: 190 }} keyboardShouldPersistTaps="always">
            <AnimatedPressable style={styles.personRow} onPress={() => { setBizAssignee(null); setMenu(null); }}>
              <View style={styles.openIcon}><Ionicons name="people-outline" size={16} color={colors.brand[600]} /></View>
              <Text style={styles.personName}>Open to everyone in the business</Text>
              {!bizAssignee && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
            </AnimatedPressable>
            {bizPeople.map((p) => (
              <AnimatedPressable key={p.id} style={styles.personRow} onPress={() => { setBizAssignee(p.id); setMenu(null); }}>
                <Avatar name={p.name} uri={p.profile_picture} size={26} />
                <Text style={styles.personName}>{p.id === user?.id ? `${p.name} (you)` : p.name}</Text>
                {bizAssignee === p.id && <Ionicons name="checkmark" size={18} color={colors.brand[600]} />}
              </AnimatedPressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.toolbar}>
          <View style={styles.tools}>
            <ToolButton icon="calendar-outline" label="Date" active={!!dueDate} onPress={() => setDateOpen(true)} />
            <ToolButton icon="flag-outline" label="Priority" active={priority < 4} color={PRIORITY[priority]?.color} onPress={() => setMenu(menu === 'priority' ? null : 'priority')} />
            {!!businessId && !isSubtask && (
              <ToolButton icon="person-outline" label="Assign" active={!!bizAssignee} onPress={() => setMenu(menu === 'assignee' ? null : 'assignee')} />
            )}
            {!businessId && !isSubtask && (
              <ToolButton icon="albums-outline" label="List" active={!!list} onPress={() => setMenu(menu === 'where' ? null : 'where')} />
            )}
            <ToolButton icon="pricetag-outline" label="Label" active={allLabels.length > 0} onPress={() => setMenu(menu === 'label' ? null : 'label')} />
            {!businessId && (
              <ToolButton
                icon="at"
                label="Mention"
                active={mentionedPeople.length > 0}
                onPress={() => {
                  setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`);
                  inputRef.current?.focus();
                }}
              />
            )}
            <ToolButton icon="ellipsis-horizontal" label="More" active={menu === 'more' || menu === 'notes'} onPress={() => setMenu(menu === 'more' || menu === 'notes' ? null : 'more')} />
          </View>
          <AnimatedPressable
            onPress={submit}
            disabled={!parsed.title || saving}
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

function ToolButton({ icon, label, active, color, onPress }) {
  const colors = useColors();
  const tone = active ? (color || colors.brand[600]) : colors.gray[500];
  return (
    <AnimatedPressable
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.md }}
    >
      <Ionicons name={icon} size={19} color={tone} />
      {Platform.OS === 'web' && <Text style={{ fontSize: 12, fontWeight: '600', color: tone, display: 'none' }}>{label}</Text>}
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm },
  scopeRow: { gap: spacing.xs, paddingBottom: spacing.sm },
  note: { fontSize: fontSize.sm, color: colors.gray[500], paddingBottom: spacing.xs },
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
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, paddingHorizontal: spacing.xs },
  personName: { flex: 1, fontSize: fontSize.base, color: colors.gray[900] },
  openIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand[100], alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
