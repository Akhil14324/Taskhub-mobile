import { useEffect, useMemo, useRef, useState } from 'react';
import autoGrow from '../../utils/autoGrow';
import { View, Text, TextInput, StyleSheet, ScrollView, Modal as RNModal, Pressable, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { SPRING } from '../../theme/motion';
import AnimatedPressable from '../AnimatedPressable';
import BottomSheet from '../BottomSheet';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import ShareToChatSheet from '../ShareToChatSheet';
import KudosSheet from '../engage/KudosSheet';
import { SaveTemplateSheet } from './TemplatesSheet';
import SubtaskTree from './SubtaskTree';
import TodoComments from './TodoComments';
import TodoTimeline, { AssignSheet } from './TodoTimeline';
import { PickerSheet } from './Pickers';
import GovernancePanel from './GovernancePanel';
import ClaudePanel from './ClaudePanel';
import PromptSheet from './PromptSheet';
import { Avatar, Chip, PRIORITY, TodoCheckbox, ListGlyph, DueChip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import useIsDesktop from '../../hooks/useBreakpoint';
import useBackClose from '../../hooks/useBackClose';
import { RECURRENCE_LABELS, timeAgo, formatDue } from '../../utils/dates';
import { DURATION_PRESETS, REMINDER_CHOICES, formatDuration, cleanLabel } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

// Attributes a phone shows as a row once they have a value, and as a chip to add them before that (Todoist's chip row).
const EXTRA_KEYS = ['deadline', 'labels', 'reminders', 'repeat', 'estimate', 'people', 'review'];

/**
 * Everything about one to-do, laid out like Todoist's task view. `variant` 'sheet' (phones): place on top,
 * title, Date / Priority rows, a row of chips for the rest, sub-tasks, comments. 'window' (desktop): the
 * task, its description, sub-tasks and comments on the left and a column of properties (project, date,
 * deadline, priority, labels, reminders, ...) on the right. Fields save as they are edited and follow the
 * server's permission flags (people who may not edit just read). onStep(+1 / -1) moves to the next task.
 */
export function TodoDetailBody({ todoId, onClose, onStep, variant = 'sheet' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const windowed = variant === 'window';
  const { user } = useAuth();
  const {
    todos, lists, sections, labels: knownLabels, updateTodo, toggleTodo, deleteTodo, duplicateTodo, removeMember,
    shareTodos, requestDelete, businesses, moveToBusiness,
  } = useTodos();
  const { people } = useDirectory();

  // The view can hop to a parent / sub-task without closing.
  const [activeId, setActiveId] = useState(todoId);
  useEffect(() => { setActiveId(todoId); }, [todoId]);
  const todo = todos.find((t) => t.id === activeId);
  const byId = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const crumbs = useMemo(() => {
    const out = [];
    for (let p = todo && byId.get(todo.parent_id); p && out.length < 8; p = byId.get(p.parent_id)) out.unshift(p);
    return out;
  }, [todo, byId]);

  const [title, setTitle] = useState('');
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  // The whole task name is always visible: the field is as tall as its text.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const grow = () => { autoGrow(titleRef.current); autoGrow(notesRef.current); };
    const id = requestAnimationFrame(grow);
    const late = setTimeout(grow, 350); // once the sheet has finished sizing itself
    window.addEventListener('resize', grow);
    return () => { cancelAnimationFrame(id); clearTimeout(late); window.removeEventListener('resize', grow); };
  }, [title, notes, editingNotes]);
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [kudosOpen, setKudosOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [picker, setPicker] = useState(null); // project | section | priority | repeat | estimate | review | reminders | menu | business
  const [personQuery, setPersonQuery] = useState(null);
  const [labelText, setLabelText] = useState(null); // null = not adding
  const [shown, setShown] = useState(() => new Set()); // phone: extra rows the person added from the chips
  const [showComments, setShowComments] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (todo && loadedFor.current !== todo.id) {
      loadedFor.current = todo.id;
      setTitle(todo.title);
      setNotes(todo.notes || '');
      setEditingNotes(false);
      setPersonQuery(null);
      setLabelText(null);
      setShown(new Set());
    }
    if (!todoId) loadedFor.current = null;
  }, [todo, todoId]);

  const perms = todo?.permissions || {};
  const editable = perms.can_edit !== false;
  const business = !!todo?.business_id;

  const save = (patch) => {
    if (!todo || !editable) return;
    updateTodo(todo.id, patch).catch((err) => {
      showToast({ message: err.response?.data?.error || 'Could not save', tone: 'error' });
    });
  };

  const members = todo?.members || [];
  const isCreator = todo?.created_by === user?.id;
  // Finished work can be thanked: the person who did it, unless that is you.
  const kudosTarget = (() => {
    if (!todo?.is_done) return null;
    if (todo.assignee_id && todo.assignee_id !== user?.id) return { id: todo.assignee_id, name: todo.assignee_name || 'them', profile_picture: todo.assignee_picture };
    if (todo.done_by && todo.done_by !== user?.id) return { id: todo.done_by, name: todo.done_by_name || 'them' };
    return null;
  })();
  const simple = user?.preferences?.viewMode === 'simple';
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

  const list = todo?.list_id ? lists.find((l) => l.id === todo.list_id) : null;
  const placeSections = todo && !business ? sections.filter((s) => (todo.list_id ? s.list_id === todo.list_id : !s.list_id)) : [];
  const section = todo?.section_id ? sections.find((s) => s.id === todo.section_id) : null;
  const offsets = todo?.reminder_offsets || [];
  const toggleOffset = (m) => save({ reminder_offsets: offsets.includes(m) ? offsets.filter((x) => x !== m) : [...offsets, m] });

  const onDelete = () => {
    if (perms.can_delete || perms.can_leave || !business) {
      onClose?.();
      deleteTodo(todo);
    } else if (perms.can_request_delete) {
      setDeletePrompt({ title: 'Ask for this to be deleted', hint: 'It goes up the chain of command for a decision.', placeholder: 'Why should it be deleted?', confirmLabel: 'Send request' });
    }
  };

  const deleteLabel = business
    ? (perms.can_delete ? 'Delete' : perms.can_request_delete ? 'Ask to delete' : null)
    : (isCreator ? 'Delete' : 'Remove from my list');

  if (!todo) return null;
  const statusLabel = todo.is_done ? 'Done' : STATUS[todo.status]?.label || todo.status;
  const placeName = business ? todo.business_name : list ? list.name : 'Inbox';
  const placeIcon = business ? <Ionicons name="briefcase-outline" size={15} color={colors.gray[500]} />
    : list ? <ListGlyph list={list} size={15} color={colors.gray[500]} />
      : <Ionicons name="file-tray-outline" size={15} color={colors.brand[600]} />;

  // ---- what each attribute is, and how it is edited -----------------------
  const has = {
    deadline: !!todo.deadline_date,
    labels: todoLabels.length > 0 || labelText !== null,
    reminders: offsets.length > 0,
    repeat: !!todo.recurrence,
    estimate: !!todo.duration_minutes,
    people: !business && members.length > 1,
    review: business && !todo.parent_id && !!todo.requires_approval,
  };
  const available = {
    deadline: !simple,
    labels: !simple,
    reminders: !simple && !!todo.due_time,
    repeat: !simple,
    estimate: !simple,
    people: !business,
    review: business && !todo.parent_id,
  };
  const visible = (k) => available[k] && (windowed || has[k] || shown.has(k));
  const reveal = (k) => {
    setShown((prev) => new Set(prev).add(k));
    if (k === 'deadline') setDeadlineOpen(true);
    else if (k === 'labels') setLabelText('');
    else if (k === 'reminders' || k === 'repeat' || k === 'estimate' || k === 'review') setPicker(k);
    else if (k === 'people') setPersonQuery('');
  };
  const CHIP = {
    deadline: { icon: 'flag-outline', label: 'Deadline' },
    labels: { icon: 'pricetag-outline', label: 'Labels' },
    reminders: { icon: 'alarm-outline', label: 'Reminders' },
    repeat: { icon: 'repeat-outline', label: 'Repeat' },
    estimate: { icon: 'time-outline', label: 'Estimate' },
    people: { icon: 'person-add-outline', label: 'Share' },
    review: { icon: 'eye-outline', label: 'Review' },
  };

  const pickerOptions = {
    project: [
      { key: 'inbox', label: 'Inbox', icon: 'file-tray-outline', active: !todo.list_id },
      ...lists.map((l) => ({ key: l.id, label: l.name, icon: 'albums-outline', active: todo.list_id === l.id })),
    ],
    section: [
      { key: 'none', label: 'No section', icon: 'remove-outline', active: !todo.section_id },
      ...placeSections.map((s) => ({ key: s.id, label: s.name, icon: 'albums-outline', active: todo.section_id === s.id })),
    ],
    priority: [1, 2, 3, 4].map((p) => ({ key: p, label: PRIORITY[p].label, icon: p < 4 ? 'flag' : 'flag-outline', active: todo.priority === p })),
    repeat: [
      { key: 'never', label: 'Does not repeat', icon: 'close-outline', active: !todo.recurrence },
      ...Object.entries(RECURRENCE_LABELS).map(([key, label]) => ({ key, label, icon: 'repeat-outline', active: todo.recurrence === key })),
    ],
    estimate: [
      { key: 0, label: 'No estimate', icon: 'close-outline', active: !todo.duration_minutes },
      ...DURATION_PRESETS.map((m) => ({ key: m, label: formatDuration(m), icon: 'time-outline', active: todo.duration_minutes === m })),
    ],
    review: [
      { key: 'close', label: 'Close it when finished', icon: 'checkmark-done-outline', active: !todo.requires_approval },
      { key: 'review', label: 'Needs a review when finished', icon: 'eye-outline', active: !!todo.requires_approval },
    ],
    reminders: REMINDER_CHOICES.map((r) => ({ key: r.minutes, label: r.label, icon: 'alarm-outline', active: offsets.includes(r.minutes) })),
    business: businesses.map((b) => ({ key: b.id, label: b.can_manage ? b.name : `${b.name} (sent as a proposal)`, icon: 'briefcase-outline' })),
    menu: [
      { key: 'share', label: 'Share to chat', icon: 'paper-plane-outline' },
      { key: 'template', label: 'Save as template', icon: 'copy-outline' },
      ...(kudosTarget ? [{ key: 'kudos', label: `Thank ${kudosTarget.name.split(' ')[0]}`, icon: 'heart-outline' }] : []),
      ...(!business ? [{ key: 'duplicate', label: 'Duplicate', icon: 'duplicate-outline' }] : []),
      ...(!business && !todo.parent_id && isCreator && businesses.length > 0 ? [{ key: 'tobusiness', label: 'Move to business', icon: 'briefcase-outline' }] : []),
      { key: 'activity', label: showActivity ? 'Hide activity' : 'Show activity', icon: 'pulse-outline' },
      ...(deleteLabel ? [{ key: 'delete', label: deleteLabel, icon: 'trash-outline', destructive: true }] : []),
    ],
  };
  const onPick = (key) => {
    const which = picker;
    if (which === 'project') save({ list_id: key === 'inbox' ? null : key, section_id: null });
    else if (which === 'section') save({ section_id: key === 'none' ? null : key });
    else if (which === 'priority') save({ priority: key });
    else if (which === 'repeat') save({ recurrence: key === 'never' ? null : key });
    else if (which === 'estimate') save({ duration_minutes: key || null });
    else if (which === 'review') save({ requires_approval: key === 'review' });
    else if (which === 'reminders') toggleOffset(key);
    else if (which === 'business') moveToBusiness(todo, key).catch((err) => showToast({ message: err.response?.data?.error || 'Could not move it', tone: 'error' }));
    else if (which === 'menu') {
      if (key === 'share') setShareOpen(true);
      else if (key === 'template') setTemplateOpen(true);
      else if (key === 'kudos') setKudosOpen(true);
      else if (key === 'duplicate') duplicateTodo(todo).catch((err) => showToast({ message: err.response?.data?.error || 'Could not duplicate', tone: 'error' }));
      else if (key === 'tobusiness') setTimeout(() => setPicker('business'), 320);
      else if (key === 'activity') setShowActivity((v) => !v);
      else if (key === 'delete') onDelete();
    }
  };
  const pick = (k) => (editable ? () => setPicker(k) : undefined);

  // ---- pieces --------------------------------------------------------------
  const flagColor = todo.priority < 4 ? PRIORITY[todo.priority].color : colors.gray[500];
  const rowIcon = (name, color) => <Ionicons name={name} size={21} color={color || colors.gray[500]} style={{ width: 24 }} />;

  const properties = (
    <View>
      {windowed && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="project" label={business ? 'Business' : 'Project'} onPress={business ? undefined : pick('project')}>
          {placeIcon}
          <Text style={styles.valueText} numberOfLines={1}>{placeName}</Text>
        </Prop>
      )}
      {placeSections.length > 0 && !todo.parent_id && (windowed || !!section) && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="section" icon={rowIcon('albums-outline')} label="Section" onPress={pick('section')} empty={!section && !windowed}>
          <Text style={styles.valueText} numberOfLines={1}>{section ? section.name : 'No section'}</Text>
        </Prop>
      )}
      <Prop
        k="date"
        icon={rowIcon('calendar-outline', todo.due_date ? colors.brand[600] : undefined)}
        label="Date"
        onPress={editable ? () => setDateOpen(true) : undefined}
        onClear={todo.due_date ? () => save({ due_date: null, due_time: null, recurrence: null, reminder_offsets: [] }) : undefined}
        empty={!todo.due_date}
      >
        <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} />
      </Prop>
      {visible('deadline') && (
        <Prop
          windowed={windowed} styles={styles} editable={editable}
          k="deadline"
          icon={rowIcon('flag-outline')}
          label="Deadline"
          onPress={editable ? () => setDeadlineOpen(true) : undefined}
          onClear={todo.deadline_date ? () => save({ deadline_date: null }) : undefined}
          empty={!todo.deadline_date}
        >
          <Ionicons name="alert-circle-outline" size={15} color={colors.brand[600]} />
          <Text style={styles.valueText}>{todo.deadline_date ? formatDue(todo.deadline_date) : ''}</Text>
        </Prop>
      )}
      <Prop windowed={windowed} styles={styles} editable={editable} k="priority" icon={rowIcon(todo.priority < 4 ? 'flag' : 'flag-outline', flagColor)} label="Priority" onPress={pick('priority')}>
        {windowed && <Ionicons name={todo.priority < 4 ? 'flag' : 'flag-outline'} size={15} color={flagColor} />}
        <Text style={styles.valueText}>{windowed ? PRIORITY[todo.priority].short : PRIORITY[todo.priority].label}</Text>
      </Prop>
      {business && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="assignee" icon={rowIcon('person-circle-outline')} label="Assignee" onPress={perms.can_assign ? () => setAssignOpen(true) : undefined}>
          <Avatar name={todo.assignee_name || todo.business_name || '?'} uri={todo.assignee_picture} size={22} />
          <Text style={styles.valueText} numberOfLines={1}>
            {todo.assignee_id === user?.id ? 'You' : todo.assignee_name || 'Open to everyone'}
          </Text>
        </Prop>
      )}
      {visible('labels') && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="labels" icon={rowIcon('pricetag-outline')} label="Labels" onPress={editable && labelText === null ? () => setLabelText('') : undefined} empty={!todoLabels.length && labelText === null}>
          {todoLabels.map((l) => (
            <Chip key={l} small icon="pricetag" label={l} active onRemove={editable ? () => save({ labels: todoLabels.filter((x) => x !== l) }) : undefined} />
          ))}
        </Prop>
      )}
      {visible('labels') && labelText !== null && (
        <View style={windowed ? null : { paddingLeft: 24 + spacing.md }}>
          <TextInput
            autoFocus
            value={labelText}
            onChangeText={setLabelText}
            onSubmitEditing={() => addLabel(labelText)}
            onBlur={() => !labelText && setLabelText(null)}
            placeholder="Type a label, then Enter"
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')} style={styles.inlineInput}
            autoCapitalize="none"
          />
          <View style={[styles.chipRow, { marginBottom: spacing.sm }]}>
            {labelSuggestions.map((l) => (
              <Chip key={l.name} small icon="pricetag-outline" label={l.name} onPress={() => addLabel(l.name)} />
            ))}
          </View>
        </View>
      )}
      {visible('reminders') && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="reminders" icon={rowIcon('alarm-outline')} label="Reminders" onPress={editable ? () => setPicker('reminders') : undefined} empty={!offsets.length}>
          <Text style={styles.valueText} numberOfLines={2}>
            {REMINDER_CHOICES.filter((r) => offsets.includes(r.minutes)).map((r) => r.label).join(', ')}
          </Text>
        </Prop>
      )}
      {windowed && !available.reminders && !simple && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="reminders-off" label="Reminders" empty={false}>
          <Text style={styles.hintText}>Give it a time to add reminders</Text>
        </Prop>
      )}
      {visible('repeat') && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="repeat" icon={rowIcon('repeat-outline')} label="Repeat" onPress={pick('repeat')} onClear={todo.recurrence ? () => save({ recurrence: null }) : undefined} empty={!todo.recurrence}>
          <Text style={styles.valueText}>{RECURRENCE_LABELS[todo.recurrence] || ''}</Text>
        </Prop>
      )}
      {visible('estimate') && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="estimate" icon={rowIcon('time-outline')} label="Estimate" onPress={pick('estimate')} onClear={todo.duration_minutes ? () => save({ duration_minutes: null }) : undefined} empty={!todo.duration_minutes}>
          <Text style={styles.valueText}>{formatDuration(todo.duration_minutes)}</Text>
        </Prop>
      )}
      {visible('review') && (
        <Prop windowed={windowed} styles={styles} editable={editable} k="review" icon={rowIcon('eye-outline')} label="When finished" onPress={pick('review')}>
          <Text style={styles.valueText}>{todo.requires_approval ? 'Needs a review' : 'Close it'}</Text>
        </Prop>
      )}
      {visible('people') && (
        <View style={windowed ? styles.propBlock : styles.peopleBlock}>
          {windowed && (
            <AnimatedPressable onPress={() => setPersonQuery('')} style={styles.propHead}>
              <Text style={styles.propLabel}>Shared with</Text>
              <Ionicons name="add" size={16} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
          {members.map((m) => (
            <View key={m.id} style={styles.person}>
              <Avatar name={m.name} uri={m.profile_picture} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={styles.personName} numberOfLines={1}>{m.id === user?.id ? `${m.name} (you)` : m.name}</Text>
                <Text style={styles.personMeta} numberOfLines={1}>@{m.username}{m.id === todo.created_by ? ' · creator' : ''}</Text>
              </View>
              {isCreator && m.id !== todo.created_by && (
                <AnimatedPressable onPress={() => removeMember(todo.id, m.id)} hitSlop={8} accessibilityLabel={`Remove ${m.name}`}>
                  <Ionicons name="remove-circle-outline" size={19} color={colors.red[500]} />
                </AnimatedPressable>
              )}
            </View>
          ))}
          {personQuery === null ? (!windowed && (
            <AnimatedPressable style={styles.addPerson} onPress={() => setPersonQuery('')}>
              <Ionicons name="person-add-outline" size={18} color={colors.brand[600]} />
              <Text style={styles.addPersonText}>Add someone. It appears in their list too</Text>
            </AnimatedPressable>
          )) : (
            <View>
              <TextInput
                autoFocus
                value={personQuery}
                onChangeText={setPersonQuery}
                placeholder="Type a name or @username"
                placeholderTextColor={colors.gray[400]}
                {...glass('inset')} style={styles.inlineInput}
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
        </View>
      )}
    </View>
  );

  const chips = !windowed && editable ? EXTRA_KEYS.filter((k) => available[k] && !visible(k)) : [];

  const meta = (
    <Text style={styles.meta}>
      Created by {isCreator ? 'you' : todo.created_by_name} · {timeAgo(todo.created_at)}
      {!todo.due_date && !todo.deadline_date && !todo.is_done ? `\nNo date. Open since ${timeAgo(todo.created_at)}, last update ${timeAgo(todo.updated_at)}` : ''}
      {todo.is_done && todo.done_by_name ? `\nCompleted by ${todo.done_by === user?.id ? 'you' : todo.done_by_name} · ${timeAgo(todo.done_at)}` : ''}
    </Text>
  );

  const main = (
    <View>
      {!windowed && crumbs.length > 0 && (
        <AnimatedPressable style={styles.sheetCrumb} onPress={() => setActiveId(crumbs[crumbs.length - 1].id)}>
          <Ionicons name="return-up-back" size={14} color={colors.gray[500]} />
          <Text style={styles.crumbText} numberOfLines={1}>{crumbs[crumbs.length - 1].title}</Text>
        </AnimatedPressable>
      )}
      <View style={[styles.titleRow, !windowed && styles.titleCard]}>
        <View style={{ paddingTop: windowed ? 5 : 6 }}>
          <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => toggleTodo(todo)} size={windowed ? 22 : 26} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => title.trim() && title.trim() !== todo.title && save({ title: title.trim() })}
            ref={titleRef}
            style={[styles.title, windowed && styles.titleWindow, todo.is_done && styles.titleDone]}
            multiline
            numberOfLines={1}
            scrollEnabled={false}
            editable={editable}
            placeholder="Task name"
            placeholderTextColor={colors.gray[400]}
          />
          {(windowed || !!notes || editingNotes) && (
            (notes || editingNotes || !editable) ? (
              <TextInput
                ref={notesRef}
                value={notes}
                onChangeText={setNotes}
                autoFocus={editingNotes && !notes}
                onBlur={() => { setEditingNotes(false); if (notes !== (todo.notes || '')) save({ notes }); }}
                style={styles.notes}
                editable={editable}
                placeholder={editable ? 'Description' : 'No description'}
                placeholderTextColor={colors.gray[400]}
                multiline
                scrollEnabled={false}
              />
            ) : (
              <AnimatedPressable style={styles.descBtn} onPress={() => setEditingNotes(true)}>
                <Ionicons name="reorder-three-outline" size={17} color={colors.gray[400]} />
                <Text style={styles.descText}>Description</Text>
              </AnimatedPressable>
            )
          )}
        </View>
      </View>

      {(business || todo.status !== 'todo' || !!todo.source_business_name) && (
        <View style={[styles.statusLine, windowed && { marginLeft: 22 + spacing.md }]}>
          {business && (
            <View style={styles.bizTag}>
              <Ionicons name="briefcase-outline" size={12} color={colors.brand[700]} />
              <Text style={styles.bizTagText} numberOfLines={1}>{todo.business_name}</Text>
            </View>
          )}
          <AnimatedPressable style={styles.statusTag} onPress={() => setShowActivity(true)}>
            <Ionicons name={todo.is_done ? STATUS.done.icon : STATUS[todo.status]?.icon || 'ellipse-outline'} size={12} color={colors.gray[600]} />
            <Text style={styles.statusTagText}>{statusLabel}</Text>
          </AnimatedPressable>
          {!!todo.source_business_name && <Text style={styles.metaSmall}>requested by {todo.source_business_name}</Text>}
        </View>
      )}

      {!windowed && (
        <View style={styles.rows}>
          {properties}
          {chips.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipStrip}>
              {!notes && !editingNotes && editable && (
                <AnimatedPressable {...glass('button')} style={styles.attrChip} onPress={() => setEditingNotes(true)}>
                  <Ionicons name="reorder-three-outline" size={17} color={colors.gray[600]} />
                  <Text style={styles.attrChipText}>Description</Text>
                </AnimatedPressable>
              )}
              {chips.map((k) => (
                <AnimatedPressable key={k} {...glass('button')} style={styles.attrChip} onPress={() => reveal(k)}>
                  <Ionicons name={CHIP[k].icon} size={16} color={colors.gray[600]} />
                  <Text style={styles.attrChipText}>{CHIP[k].label}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <GovernancePanel todo={todo} />
      <ClaudePanel todo={todo} />

      <View style={windowed ? styles.subWindow : styles.subSheet}>
        <SubtaskTree parent={todo} onOpen={setActiveId} />
      </View>

      <AnimatedPressable style={styles.foldHead} onPress={() => setShowComments((v) => !v)}>
        <Ionicons name={showComments ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.gray[500]} />
        <Text style={styles.foldText}>Comments</Text>
        {todo.comment_count > 0 && <Text style={styles.foldCount}>{todo.comment_count}</Text>}
      </AnimatedPressable>
      {showComments && <TodoComments todo={todo} />}

      <AnimatedPressable style={styles.foldHead} onPress={() => setShowActivity((v) => !v)}>
        <Ionicons name={showActivity ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.gray[500]} />
        <Text style={styles.foldText}>Activity</Text>
        <Text style={styles.foldCount}>{statusLabel}{todo.assignee_name && business ? ` · ${todo.assignee_name}` : ''}</Text>
      </AnimatedPressable>
      {showActivity && <TodoTimeline todo={todo} />}

      {!windowed && meta}
      <View style={{ height: spacing.lg }} />
    </View>
  );

  const header = (
    <View style={[styles.bar, windowed && styles.barWindow]}>
      <AnimatedPressable
        style={styles.crumbRow}
        onPress={!business && editable && !todo.parent_id ? () => setPicker('project') : undefined}
        accessibilityLabel={`In ${placeName}`}
      >
        {placeIcon}
        <Text style={styles.crumbHere} numberOfLines={1}>{placeName}</Text>
        {!!section && (
          <>
            <Text style={styles.crumbSep}>/</Text>
            <Text style={styles.crumbHere} numberOfLines={1}>{section.name}</Text>
          </>
        )}
        {windowed && crumbs.map((c) => (
          <AnimatedPressable key={c.id} style={styles.crumb} onPress={() => setActiveId(c.id)}>
            <Text style={styles.crumbSep}>/</Text>
            <Text style={styles.crumbText} numberOfLines={1}>{c.title}</Text>
          </AnimatedPressable>
        ))}
        {!windowed && <Ionicons name="chevron-forward" size={15} color={colors.gray[500]} />}
      </AnimatedPressable>
      {windowed && onStep && (
        <>
          <AnimatedPressable onPress={() => onStep(-1)} hitSlop={6} style={styles.barBtn} accessibilityLabel="Previous task">
            <Ionicons name="chevron-up" size={19} color={colors.gray[500]} />
          </AnimatedPressable>
          <AnimatedPressable onPress={() => onStep(1)} hitSlop={6} style={styles.barBtn} accessibilityLabel="Next task">
            <Ionicons name="chevron-down" size={19} color={colors.gray[500]} />
          </AnimatedPressable>
        </>
      )}
      <AnimatedPressable onPress={() => setPicker('menu')} hitSlop={6} style={styles.barBtn} accessibilityLabel="More actions">
        <Ionicons name={windowed ? 'ellipsis-horizontal' : 'ellipsis-vertical'} size={19} color={colors.gray[500]} />
      </AnimatedPressable>
      {windowed && (
        <AnimatedPressable onPress={onClose} hitSlop={6} style={styles.barBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={21} color={colors.gray[500]} />
        </AnimatedPressable>
      )}
    </View>
  );

  return (
    <View style={windowed ? styles.window : { flexShrink: 1 }}>
      {header}
      {windowed ? (
        <View style={styles.columns}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.leftPane} keyboardShouldPersistTaps="handled">
            {main}
          </ScrollView>
          <ScrollView style={styles.rightPane} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            {properties}
            {meta}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {main}
        </ScrollView>
      )}

      <DueDatePicker
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        date={todo.due_date}
        time={todo.due_time}
        onChange={({ date, time }) => save({ due_date: date, due_time: time })}
      />
      <DueDatePicker
        visible={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        date={todo.deadline_date}
        allowTime={false}
        onChange={({ date }) => save({ deadline_date: date })}
      />
      <PickerSheet
        visible={!!picker}
        onClose={() => setPicker(null)}
        title={{ project: 'Move to', section: 'Section', priority: 'Priority', repeat: 'Repeat', estimate: 'Estimate', review: 'When it is finished', reminders: 'Remind me', business: 'Move to a business', menu: todo.title }[picker] || ''}
        options={(picker && pickerOptions[picker]) || []}
        onPick={onPick}
      />
      <AssignSheet visible={assignOpen} todo={todo} onClose={() => setAssignOpen(false)} />
      <PromptSheet
        value={deletePrompt}
        onClose={() => setDeletePrompt(null)}
        onSubmit={async (reason) => {
          setDeletePrompt(null);
          try {
            await requestDelete(todo.id, reason);
            showToast({ message: 'Request sent up the chain', tone: 'success' });
          } catch (err) {
            showToast({ message: err.response?.data?.error || 'Could not send the request', tone: 'error' });
          }
        }}
      />
      <SaveTemplateSheet visible={templateOpen} onClose={() => setTemplateOpen(false)} todo={todo} />
      <KudosSheet visible={kudosOpen} onClose={() => setKudosOpen(false)} toUser={kudosTarget} todo={todo} />
      <ShareToChatSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        heading="Share to-do"
        subheading={todo.title}
        onSend={({ conversationIds, note }) => shareTodos({ conversationIds, todoIds: [todo.id], note })}
      />
    </View>
  );
}

/** One property: a labelled block in the desktop window, an icon row on a phone. */
function Prop({ k, icon, label, children, onPress, onClear, empty, windowed, styles, editable }) {
  const colors = useColors();
  return windowed ? (
    <View style={styles.propBlock}>
      <AnimatedPressable onPress={onPress} disabled={!onPress} style={styles.propHead}>
        <Text style={styles.propLabel}>{label}</Text>
        {!!onPress && empty && <Ionicons name="add" size={16} color={colors.gray[400]} />}
      </AnimatedPressable>
      {!empty && (
        <AnimatedPressable onPress={onPress} disabled={!onPress} style={styles.propValue}>
          {children}
          <View style={{ flex: 1 }} />
          {!!onClear && editable && (
            <AnimatedPressable onPress={onClear} hitSlop={8} accessibilityLabel={`Remove ${label.toLowerCase()}`}>
              <Ionicons name="close" size={15} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </AnimatedPressable>
      )}
    </View>
  ) : (
    <AnimatedPressable key={k} onPress={onPress} disabled={!onPress} style={styles.row}>
      {icon}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        {empty ? <Text style={styles.rowPlaceholder}>{label}</Text> : children}
      </View>
      {!!onClear && editable && !empty && (
        <AnimatedPressable onPress={onClear} hitSlop={8} accessibilityLabel={`Remove ${label.toLowerCase()}`}>
          <Ionicons name="close" size={17} color={colors.gray[400]} />
        </AnimatedPressable>
      )}
    </AnimatedPressable>
  );
}

/** Desktop: Todoist's centred task window (task on the left, properties on the right). */
function TaskWindow({ open, onClose, children }) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const p = useSharedValue(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      p.value = withSpring(1, SPRING.sheet);
      return undefined;
    }
    p.value = withTiming(0, { duration: 160 });
    const t = setTimeout(() => setMounted(false), 170);
    return () => clearTimeout(t);
  }, [open, p]);
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useBackClose(open, onClose);
  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value) }));
  const box = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ scale: 0.96 + 0.04 * Math.min(1, p.value) }] }));
  if (!mounted && !open) return null;
  return (
    <RNModal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View {...glass('scrim')} style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Animated.View
          {...glass('sheet')}
          style={[{
            width: Math.min(980, width - 64), height: Math.min(780, height - 64), borderRadius: 18, overflow: 'hidden',
            backgroundColor: colors.white, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
          }, box]}
        >
          {children}
        </Animated.View>
      </View>
    </RNModal>
  );
}

/** The detail as a bottom sheet on phones and as a centred task window on desktop. */
export default function TodoDetailSheet({ todoId, onClose, onStep }) {
  const { todos } = useTodos();
  const desktop = useIsDesktop();
  const exists = todos.some((t) => t.id === todoId);
  if (desktop) {
    return (
      <TaskWindow open={!!todoId && exists} onClose={onClose}>
        {!!todoId && exists && <TodoDetailBody todoId={todoId} onClose={onClose} onStep={onStep} variant="window" />}
      </TaskWindow>
    );
  }
  return (
    <BottomSheet visible={!!todoId && exists} onClose={onClose} maxHeight={820} avoidKeyboard>
      <TodoDetailBody todoId={todoId} onClose={onClose} />
    </BottomSheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  window: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  barWindow: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  barBtn: { padding: 6, borderRadius: radius.md },
  crumbRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden', paddingVertical: 4 },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 180 },
  crumbText: { fontSize: fontSize.sm, color: colors.gray[500], flexShrink: 1 },
  crumbHere: { fontSize: fontSize.sm, color: colors.gray[700], fontWeight: '600', flexShrink: 1 },
  crumbSep: { fontSize: fontSize.sm, color: colors.gray[400] },
  sheetCrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  columns: { flex: 1, flexDirection: 'row' },
  leftPane: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  rightPane: {
    width: 290, flexGrow: 0, backgroundColor: colors.gray[50],
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.gray[200],
  },
  titleRow: { flexDirection: 'row', gap: spacing.md },
  titleCard: {
    padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray[50],
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '500',
    color: colors.gray[900],
    paddingVertical: 4,
    outlineStyle: 'none',
  },
  titleWindow: { fontSize: 20, fontWeight: '700' },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  notes: {
    fontSize: fontSize.base, color: colors.gray[700], paddingVertical: 4, minHeight: 24, outlineStyle: 'none', textAlignVertical: 'top', lineHeight: 20,
  },
  descBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  descText: { fontSize: fontSize.sm, color: colors.gray[400] },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  bizTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.brand[100] },
  bizTagText: { fontSize: 11, fontWeight: '700', color: colors.brand[700], maxWidth: 160 },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.gray[100] },
  statusTagText: { fontSize: 11, fontWeight: '600', color: colors.gray[600] },
  metaSmall: { fontSize: 11, color: colors.gray[400] },
  rows: {
    marginTop: spacing.md, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.gray[50],
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  rowPlaceholder: { fontSize: fontSize.md, color: colors.gray[500] },
  valueText: { fontSize: fontSize.base, color: colors.gray[800], flexShrink: 1 },
  hintText: { fontSize: fontSize.sm, color: colors.gray[400] },
  chipStrip: { gap: spacing.sm, padding: spacing.md },
  attrChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.md,
    backgroundColor: colors.gray[100],
  },
  attrChipText: { fontSize: fontSize.sm, color: colors.gray[700], fontWeight: '500' },
  propBlock: { paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
  propHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  propLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.gray[500] },
  propValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inlineInput: {
    marginVertical: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: fontSize.base,
    color: colors.gray[900],
    outlineStyle: 'none',
  },
  peopleBlock: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  personName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[900] },
  personMeta: { fontSize: fontSize.xs, color: colors.gray[500] },
  addPerson: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addPersonText: { color: colors.brand[600], fontWeight: '600', fontSize: fontSize.sm },
  subSheet: { marginTop: spacing.sm },
  subWindow: { marginTop: spacing.md, marginLeft: 22 + spacing.md - spacing.sm },
  foldHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200],
  },
  foldText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[800] },
  foldCount: { fontSize: fontSize.sm, color: colors.gray[500], flexShrink: 1 },
  meta: { fontSize: fontSize.xs, color: colors.gray[400], marginTop: spacing.lg, paddingHorizontal: spacing.sm, lineHeight: 18 },
});
