import { useEffect, useMemo, useRef, useState } from 'react';
import autoGrow from '../../utils/autoGrow';
import { View, Text, TextInput, StyleSheet, ScrollView, Modal as RNModal, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { glass } from '../../theme/glass';
import { SPRING } from '../../theme/motion';
import AnimatedPressable from '../AnimatedPressable';
import DueDatePicker from '../DueDatePicker';
import MentionSuggestions from '../MentionSuggestions';
import ShareToChatSheet from '../ShareToChatSheet';
import { MoreMenu } from '../UI';
import KudosSheet from '../engage/KudosSheet';
import { SaveTemplateSheet } from './TemplatesSheet';
import SubtaskTree from './SubtaskTree';
import TodoComments from './TodoComments';
import TodoTimeline, { AssignSheet } from './TodoTimeline';
import { PickerSheet } from './Pickers';
import GovernancePanel from './GovernancePanel';
import ClaudePanel from './ClaudePanel';
import PromptSheet from './PromptSheet';
import { Avatar, Chip, PRIORITY, TodoCheckbox, DueChip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import useIsDesktop from '../../hooks/useBreakpoint';
import useBackClose from '../../hooks/useBackClose';
import { RECURRENCE_LABELS, timeAgo, formatDue, formatTime } from '../../utils/dates';
import { DURATION_PRESETS, REMINDER_CHOICES, formatDuration, cleanLabel, subtaskProgress } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';
import { showToast } from '../../utils/events';
import { printTodo } from '../../utils/printTodo';

const REPEATS = [
  { key: null, label: 'Never' },
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'monthly', label: 'Every month' },
];

/** One line in the right-hand column: a small label above the value. */
function Prop({ icon, label, children, onPress, last }) {
  const colors = useColors();
  const Wrapper = onPress ? AnimatedPressable : View;
  return (
    <Wrapper onPress={onPress} style={{ paddingVertical: 10, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name={icon} size={14} color={colors.gray[400]} />
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
      </View>
      {children}
    </Wrapper>
  );
}

/** Where a personal to-do lives: the Inbox, or a list, optionally in one of its sections. */
function placeLabel(todo, lists, sections) {
  const list = lists.find((l) => l.id === todo.list_id);
  const section = sections.find((s) => s.id === todo.section_id);
  const base = list ? list.name : 'Inbox';
  return section ? `${base} / ${section.name}` : base;
}

/**
 * Everything about one to-do, in a window in the middle of the screen. The left side is the work:
 * the title with its description right under it (one thing, not two boxes), the sub-tasks, then the
 * conversation. The right side is the settings: where it lives, date, deadline, priority, labels,
 * reminders and people. Fields save as they are changed and follow the server's permission flags.
 */
export function TodoDetailBody({ todoId, onClose, wide = true }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const {
    todos, lists, sections, labels: knownLabels, updateTodo, toggleTodo, deleteTodo, duplicateTodo, removeMember,
    shareTodos, requestDelete, businesses, moveToBusiness, fetchComments,
  } = useTodos();
  const { people } = useDirectory();

  // The window can hop to a parent / sub-task without closing.
  const [activeId, setActiveId] = useState(todoId);
  useEffect(() => { setActiveId(todoId); }, [todoId]);
  const todo = todos.find((t) => t.id === activeId);
  const byId = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const crumbs = useMemo(() => {
    const out = [];
    for (let p = todo && byId.get(todo.parent_id); p && out.length < 8; p = byId.get(p.parent_id)) out.unshift(p);
    return out;
  }, [todo, byId]);

  const [tab, setTab] = useState('comments');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const grow = () => { autoGrow(titleRef.current); autoGrow(notesRef.current); };
    const id = requestAnimationFrame(grow);
    const late = setTimeout(grow, 350);
    window.addEventListener('resize', grow);
    return () => { cancelAnimationFrame(id); clearTimeout(late); window.removeEventListener('resize', grow); };
  }, [title, notes]);

  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [kudosOpen, setKudosOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
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
      setInfoOpen(false);
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
  const kudosTarget = (() => {
    if (!todo?.is_done) return null;
    if (todo.assignee_id && todo.assignee_id !== user?.id) return { id: todo.assignee_id, name: todo.assignee_name || 'them', profile_picture: todo.assignee_picture };
    if (todo.done_by && todo.done_by !== user?.id) return { id: todo.done_by, name: todo.done_by_name || 'them' };
    return null;
  })();
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
  const progress = subtaskProgress(todo, todos);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : null;

  const menuItems = [
    { id: 'share', icon: 'paper-plane-outline', label: 'Share in chat' },
    !business && { id: 'duplicate', icon: 'copy-outline', label: 'Duplicate' },
    !business && !todo.parent_id && isCreator && businesses.length > 0 && { id: 'move', icon: 'briefcase-outline', label: 'Move to a business' },
    { id: 'template', icon: 'albums-outline', label: 'Save as template' },
    { id: 'print', icon: 'print-outline', label: 'Print' },
    !!kudosTarget && { id: 'kudos', icon: 'heart-outline', label: `Thank ${kudosTarget.name.split(' ')[0]}` },
    !!deleteLabel && { id: 'delete', icon: 'trash-outline', label: deleteLabel, color: colors.red[600] },
  ].filter(Boolean);

  const onMenu = (item) => {
    if (item.id === 'share') setShareOpen(true);
    else if (item.id === 'duplicate') duplicateTodo(todo).catch((err) => showToast({ message: err.response?.data?.error || 'Could not duplicate', tone: 'error' }));
    else if (item.id === 'move') setMoveOpen(true);
    else if (item.id === 'template') setTemplateOpen(true);
    else if (item.id === 'print') {
      fetchComments(todo.id).catch(() => []).then((comments) => printTodo(todo, todos, comments || []));
    } else if (item.id === 'kudos') setKudosOpen(true);
    else if (item.id === 'delete') onDelete();
  };

  // Where it can be moved to (personal): the Inbox and every list, with their sections.
  const placeOptions = [{ key: 'inbox', label: 'Inbox', icon: 'file-tray-outline', active: !todo.list_id && !todo.section_id }];
  sections.filter((s) => !s.list_id && !s.archived).forEach((s) => placeOptions.push({ key: `s${s.id}`, label: `Inbox / ${s.name}`, icon: 'albums-outline', active: todo.section_id === s.id }));
  lists.forEach((l) => {
    placeOptions.push({ key: `l${l.id}`, label: l.name, icon: 'list-outline', active: todo.list_id === l.id && !todo.section_id });
    sections.filter((s) => s.list_id === l.id && !s.archived).forEach((s) => placeOptions.push({ key: `s${s.id}`, label: `${l.name} / ${s.name}`, icon: 'albums-outline', active: todo.section_id === s.id }));
  });
  const onPlace = (key) => {
    if (key === 'inbox') save({ list_id: null, section_id: null });
    else if (String(key).startsWith('l')) save({ list_id: Number(String(key).slice(1)), section_id: null });
    else save({ section_id: Number(String(key).slice(1)) });
  };

  const reminderText = todo.remind_date
    ? `${formatDue(todo.remind_date)} at ${formatTime(todo.remind_time)}${todo.remind_repeat ? `, ${REPEATS.find((r) => r.key === todo.remind_repeat)?.label.toLowerCase()}` : ''}`
    : null;

  const left = (
    <>
      {crumbs.length > 0 && (
        <AnimatedPressable style={styles.sheetCrumb} onPress={() => setActiveId(crumbs[crumbs.length - 1].id)}>
          <Ionicons name="return-up-back" size={14} color={colors.gray[500]} />
          <Text style={styles.crumbText} numberOfLines={1}>{crumbs[crumbs.length - 1].title}</Text>
        </AnimatedPressable>
      )}

      {/* The task and its description are one block: the title, and the description right under it. */}
      <View style={styles.titleRow}>
        <View style={{ paddingTop: 7 }}>
          <TodoCheckbox checked={todo.is_done} priority={todo.priority} onPress={() => toggleTodo(todo)} size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => title.trim() && title.trim() !== todo.title && save({ title: title.trim() })}
            ref={titleRef}
            style={[styles.title, todo.is_done && styles.titleDone]}
            multiline
            numberOfLines={1}
            scrollEnabled={false}
            editable={editable}
            placeholder="Task name"
            placeholderTextColor={colors.gray[400]}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={() => notes !== (todo.notes || '') && save({ notes })}
            ref={notesRef}
            style={styles.notes}
            editable={editable}
            placeholder={editable ? 'Description' : ''}
            placeholderTextColor={colors.gray[400]}
            multiline
            numberOfLines={1}
            scrollEnabled={false}
          />
        </View>
      </View>

      {percent !== null && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
          <Text style={styles.progressText}>{percent}% done · {progress.done} of {progress.total} sub-tasks</Text>
        </View>
      )}

      {(editable || perms.can_change_status !== false) && (
        <AnimatedPressable style={[styles.doneBtn, todo.is_done && styles.doneBtnOff]} onPress={() => toggleTodo(todo)} haptic="medium">
          <Ionicons name={todo.is_done ? 'refresh' : 'checkmark-circle'} size={18} color={todo.is_done ? colors.gray[700] : '#fff'} />
          <Text style={[styles.doneBtnText, todo.is_done && { color: colors.gray[700] }]}>{todo.is_done ? 'Reopen' : 'Mark as done'}</Text>
        </AnimatedPressable>
      )}

      <GovernancePanel todo={todo} />
      <ClaudePanel todo={todo} />

      <SubtaskTree parent={todo} onOpen={setActiveId} />

      <View style={styles.tabs}>
        <AnimatedPressable style={[styles.tab, tab === 'comments' && styles.tabActive]} onPress={() => setTab('comments')}>
          <Text style={[styles.tabText, tab === 'comments' && styles.tabTextActive]}>
            Comments{todo.comment_count > 0 ? ` · ${todo.comment_count}` : ''}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable style={[styles.tab, tab === 'activity' && styles.tabActive]} onPress={() => setTab('activity')}>
          <Text style={[styles.tabText, tab === 'activity' && styles.tabTextActive]}>Activity</Text>
        </AnimatedPressable>
      </View>
      {tab === 'comments' ? <TodoComments todo={todo} /> : <TodoTimeline todo={todo} />}
    </>
  );

  const right = (
    <>
      {business ? (
        <Prop icon="briefcase-outline" label="Business">
          <Text style={styles.propValue}>{todo.business_name}</Text>
          {!!todo.source_business_name && <Text style={styles.metaSmall}>requested by {todo.source_business_name}</Text>}
        </Prop>
      ) : (
        <Prop icon="file-tray-outline" label="Where" onPress={editable && !todo.parent_id ? () => setPlaceOpen(true) : undefined}>
          <Text style={styles.propValue}>{placeLabel(todo, lists, sections)}</Text>
        </Prop>
      )}

      <Prop icon="pulse-outline" label="Status">
        <View style={styles.statusTag}>
          <Ionicons name={todo.is_done ? STATUS.done.icon : STATUS[todo.status]?.icon || 'ellipse-outline'} size={13} color={colors.gray[600]} />
          <Text style={styles.statusTagText}>{statusLabel}</Text>
        </View>
      </Prop>

      <Prop icon="calendar-outline" label="Date" onPress={editable ? () => setDateOpen(true) : undefined}>
        <View style={styles.valueRow}>
          <View style={{ flex: 1 }}>
            {todo.due_date
              ? <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} />
              : <Text style={styles.placeholder}>No date</Text>}
          </View>
          {editable && !!todo.due_date && (
            <AnimatedPressable onPress={() => save({ due_date: null, due_time: null, recurrence: null, reminder_offsets: [] })} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </View>
      </Prop>

      {editable && !!todo.due_date && (
        <Prop icon="repeat-outline" label="Repeats" onPress={() => setRepeatOpen(true)}>
          <Text style={todo.recurrence ? styles.propValue : styles.placeholder}>
            {todo.recurrence ? RECURRENCE_LABELS[todo.recurrence] : 'Does not repeat'}
          </Text>
        </Prop>
      )}

      <Prop icon="alert-circle-outline" label="Deadline" onPress={editable ? () => setDeadlineOpen(true) : undefined}>
        <View style={styles.valueRow}>
          <View style={{ flex: 1 }}>
            {todo.deadline_date
              ? <Text style={styles.propValue}>{formatDue(todo.deadline_date)}</Text>
              : <Text style={styles.placeholder}>No deadline</Text>}
          </View>
          {editable && !!todo.deadline_date && (
            <AnimatedPressable onPress={() => save({ deadline_date: null })} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </View>
      </Prop>

      <Prop icon="flag-outline" label="Priority">
        <View style={styles.chipRow}>
          {[1, 2, 3, 4].map((p) => (
            <Chip key={p} small icon="flag" color={PRIORITY[p].color} label={PRIORITY[p].short} active={todo.priority === p} onPress={editable ? () => save({ priority: p }) : undefined} />
          ))}
        </View>
      </Prop>

      <Prop icon="pricetag-outline" label="Labels">
        <View style={styles.chipRow}>
          {todoLabels.map((l) => (
            <Chip key={l} small icon="pricetag" label={l} active onRemove={editable ? () => save({ labels: todoLabels.filter((x) => x !== l) }) : undefined} />
          ))}
          {editable && labelText === null && <Chip small icon="add" label="Add" onPress={() => setLabelText('')} />}
          {!editable && todoLabels.length === 0 && <Text style={styles.placeholder}>None</Text>}
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
              {...glass('inset')} style={styles.smallInput}
              autoCapitalize="none"
            />
            <View style={[styles.chipRow, { marginTop: 6 }]}>
              {labelSuggestions.map((l) => (
                <Chip key={l.name} small icon="pricetag-outline" label={l.name} onPress={() => addLabel(l.name)} />
              ))}
            </View>
          </View>
        )}
      </Prop>

      {/* Reminders: a date and time of their own, repeating if wanted, and "before it is due". */}
      <Prop icon="alarm-outline" label="Reminder" onPress={editable ? () => setRemindOpen(true) : undefined}>
        <View style={styles.valueRow}>
          <View style={{ flex: 1 }}>
            <Text style={reminderText ? styles.propValue : styles.placeholder}>{reminderText || 'No reminder'}</Text>
          </View>
          {editable && !!todo.remind_date && (
            <AnimatedPressable onPress={() => save({ remind_date: null, remind_time: null, remind_repeat: null })} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
            </AnimatedPressable>
          )}
        </View>
        {editable && !!todo.remind_date && (
          <View style={[styles.chipRow, { marginTop: 8 }]}>
            {REPEATS.map((r) => (
              <Chip key={String(r.key)} small icon={r.key ? 'repeat' : undefined} label={r.label} active={(todo.remind_repeat || null) === r.key} onPress={() => save({ remind_repeat: r.key })} />
            ))}
          </View>
        )}
        {editable && !!todo.due_time && (
          <View style={[styles.chipRow, { marginTop: 8 }]}>
            {REMINDER_CHOICES.map((r) => (
              <Chip key={r.minutes} small icon="alarm-outline" label={r.label} active={offsets.includes(r.minutes)} onPress={() => toggleOffset(r.minutes)} />
            ))}
          </View>
        )}
      </Prop>

      <Prop icon="time-outline" label="Time needed">
        <View style={styles.chipRow}>
          {DURATION_PRESETS.map((m) => (
            <Chip key={m} small label={formatDuration(m)} active={todo.duration_minutes === m} onPress={editable ? () => save({ duration_minutes: todo.duration_minutes === m ? null : m }) : undefined} />
          ))}
          {editable && !customDuration && <Chip small icon="create-outline" label="Other" onPress={() => setCustomDuration(true)} />}
        </View>
        {customDuration && (
          <TextInput
            autoFocus
            value={durationText}
            onChangeText={setDurationText}
            onSubmitEditing={applyCustomDuration}
            onBlur={applyCustomDuration}
            placeholder="e.g. 45m or 1.5h"
            placeholderTextColor={colors.gray[400]}
            {...glass('inset')} style={[styles.smallInput, { marginTop: 6 }]}
          />
        )}
      </Prop>

      {business ? (
        <>
          <Prop icon="person-outline" label="Assigned to" onPress={perms.can_assign ? () => setAssignOpen(true) : undefined}>
            <View style={styles.valueRow}>
              <Avatar name={todo.assignee_name || todo.business_name || '?'} uri={todo.assignee_picture} size={24} />
              <View style={{ flex: 1 }}>
                <Text style={styles.propValue}>{todo.assignee_id === user?.id ? 'You' : todo.assignee_name || 'Open to everyone in the business'}</Text>
                <Text style={styles.metaSmall}>Set by {isCreator ? 'you' : todo.created_by_name}</Text>
              </View>
              {perms.can_assign && <Ionicons name="swap-horizontal" size={17} color={colors.gray[400]} />}
            </View>
          </Prop>
          {editable && !todo.parent_id && (
            <Prop icon="eye-outline" label="When it is finished">
              <View style={styles.chipRow}>
                <Chip small label="Close it" active={!todo.requires_approval} onPress={() => save({ requires_approval: false })} />
                <Chip small icon="eye-outline" label="Needs a review" active={!!todo.requires_approval} onPress={() => save({ requires_approval: true })} />
              </View>
            </Prop>
          )}
        </>
      ) : (
        <Prop icon="people-outline" label="People" last>
          {todo.assignee_id && todo.assignee_id !== todo.created_by && (
            <Text style={[styles.metaSmall, { marginBottom: 4 }]}>Assigned to {todo.assignee_id === user?.id ? 'you' : todo.assignee_name}</Text>
          )}
          {members.map((m) => (
            <View key={m.id} style={styles.person}>
              <Avatar name={m.name} uri={m.profile_picture} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={styles.personName} numberOfLines={1}>{m.id === user?.id ? `${m.name} (you)` : m.name}</Text>
                <Text style={styles.personMeta}>@{m.username}{m.id === todo.created_by ? ' · made it' : ''}{m.id === todo.assignee_id && m.id !== todo.created_by ? ' · assigned' : ''}</Text>
              </View>
              {isCreator && m.id !== todo.created_by && (
                <AnimatedPressable onPress={() => removeMember(todo.id, m.id)} hitSlop={8}>
                  <Ionicons name="remove-circle-outline" size={19} color={colors.red[500]} />
                </AnimatedPressable>
              )}
            </View>
          ))}
          {personQuery === null ? (
            <AnimatedPressable style={styles.addPerson} onPress={() => setPersonQuery('')}>
              <Ionicons name="person-add-outline" size={16} color={colors.brand[600]} />
              <Text style={styles.addPersonText}>Add someone</Text>
            </AnimatedPressable>
          ) : (
            <View>
              <TextInput
                autoFocus
                value={personQuery}
                onChangeText={setPersonQuery}
                placeholder="Type a name or @username"
                placeholderTextColor={colors.gray[400]}
                {...glass('inset')} style={styles.smallInput}
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
        </Prop>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={styles.header}>
        <View style={styles.crumbRow}>
          {crumbs.map((c) => (
            <AnimatedPressable key={c.id} style={styles.crumb} onPress={() => setActiveId(c.id)}>
              <Text style={styles.crumbText} numberOfLines={1}>{c.title}</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.gray[400]} />
            </AnimatedPressable>
          ))}
          <Text style={styles.crumbHere} numberOfLines={1}>{business ? todo.business_name : placeLabel(todo, lists, sections)}</Text>
        </View>
        <AnimatedPressable onPress={() => setInfoOpen((v) => !v)} hitSlop={8} accessibilityLabel="Info" style={styles.headBtn}>
          <Ionicons name={infoOpen ? 'information-circle' : 'information-circle-outline'} size={21} color={infoOpen ? colors.brand[600] : colors.gray[500]} />
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setMenuOpen(true)} hitSlop={8} accessibilityLabel="More" style={styles.headBtn}>
          <Ionicons name="ellipsis-horizontal" size={21} color={colors.gray[500]} />
        </AnimatedPressable>
        <AnimatedPressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" style={styles.headBtn}>
          <Ionicons name="close" size={23} color={colors.gray[500]} />
        </AnimatedPressable>
      </View>

      {infoOpen && (
        <View {...glass('inset')} style={styles.info}>
          <Text style={styles.infoLine}>Made by {isCreator ? 'you' : todo.created_by_name} · {timeAgo(todo.created_at)}</Text>
          <Text style={styles.infoLine}>Last change {timeAgo(todo.updated_at)}</Text>
          {!todo.due_date && !todo.deadline_date && !todo.is_done && <Text style={styles.infoLine}>No date. Open since {timeAgo(todo.created_at)}</Text>}
          {todo.is_done && !!todo.done_by_name && <Text style={styles.infoLine}>Finished by {todo.done_by === user?.id ? 'you' : todo.done_by_name} · {timeAgo(todo.done_at)}</Text>}
        </View>
      )}

      {wide ? (
        <View style={styles.cols}>
          <ScrollView style={styles.colLeft} contentContainerStyle={styles.colLeftInner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {left}
          </ScrollView>
          <ScrollView style={styles.colRight} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {right}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {left}
          <View style={styles.phoneProps}>{right}</View>
        </ScrollView>
      )}

      <MoreMenu visible={menuOpen} onClose={() => setMenuOpen(false)} title="Task" items={menuItems} onItemPress={onMenu} />
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
      <DueDatePicker
        visible={remindOpen}
        onClose={() => setRemindOpen(false)}
        date={todo.remind_date}
        time={todo.remind_time || '09:00'}
        onChange={({ date, time }) => save(date
          ? { remind_date: date, remind_time: time || todo.remind_time || '09:00' }
          : { remind_date: null, remind_time: null, remind_repeat: null })}
      />
      <PickerSheet
        visible={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        title="Repeat"
        options={[{ key: 'none', label: 'Does not repeat', active: !todo.recurrence }, ...Object.entries(RECURRENCE_LABELS).map(([key, label]) => ({ key, label, icon: 'repeat', active: todo.recurrence === key }))]}
        onPick={(key) => save({ recurrence: key === 'none' ? null : key })}
      />
      <PickerSheet visible={placeOpen} onClose={() => setPlaceOpen(false)} title="Move to" options={placeOptions} onPick={onPlace} />
      <PickerSheet
        visible={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Move to a business"
        options={businesses.map((b) => ({ key: b.id, label: b.can_manage ? b.name : `${b.name} (sent as a proposal)`, icon: 'briefcase-outline' }))}
        onPick={(id) => moveToBusiness(todo, id).catch((err) => showToast({ message: err.response?.data?.error || 'Could not move it', tone: 'error' }))}
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

/**
 * The window itself: centred on the screen over a dimmed backdrop (full height on a phone). Escape,
 * the Back button and a tap outside all close it.
 */
export default function TodoDetailSheet({ todoId, onClose }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { todos } = useTodos();
  const exists = todos.some((t) => t.id === todoId);
  const open = !!todoId && exists;

  const [mounted, setMounted] = useState(false);
  const timer = useRef(null);
  const arrive = useSharedValue(0);
  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setMounted(true);
      arrive.value = withSpring(1, SPRING.sheet);
    } else {
      arrive.value = withTiming(0, { duration: 160 });
      timer.current = setTimeout(() => setMounted(false), 200);
    }
    return () => clearTimeout(timer.current);
  }, [open, arrive]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useBackClose(open, onClose);

  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, arrive.value) }));
  const frame = useAnimatedStyle(() => ({
    opacity: Math.min(1, arrive.value * 1.5),
    transform: [{ scale: 0.95 + 0.05 * Math.min(1, arrive.value) }, { translateY: (1 - Math.min(1, arrive.value)) * (desktop ? 10 : 40) }],
  }));

  if (!mounted && !open) return null;

  return (
    <RNModal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View {...glass('scrim')} style={[{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: desktop ? 24 : 0 }, scrim]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View
          {...glass('sheet')}
          style={[
            desktop
              ? { width: '100%', maxWidth: 1000, height: '90%', maxHeight: 780, borderRadius: 24 }
              : { width: '100%', height: '100%', paddingTop: insets.top + 6, paddingBottom: insets.bottom },
            { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200] },
            frame,
          ]}
        >
          <TodoDetailBody todoId={todoId} onClose={onClose} wide={desktop} />
        </Animated.View>
      </Animated.View>
    </RNModal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  headBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  crumbRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 },
  crumbText: { fontSize: fontSize.sm, color: colors.gray[500], flexShrink: 1 },
  crumbHere: { fontSize: fontSize.sm, color: colors.gray[500], fontWeight: '700', flexShrink: 1 },
  sheetCrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: spacing.sm },
  info: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.lg, gap: 2, backgroundColor: colors.gray[50] },
  infoLine: { fontSize: fontSize.sm, color: colors.gray[600] },
  cols: { flex: 1, flexDirection: 'row', minHeight: 0 },
  colLeft: { flex: 1, minWidth: 0 },
  colLeftInner: { padding: spacing.lg, paddingBottom: spacing.xxl },
  colRight: { width: 300, flexGrow: 0, flexShrink: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.gray[200], backgroundColor: colors.gray[50] },
  phoneProps: { marginTop: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.gray[200] },
  titleRow: { flexDirection: 'row', gap: spacing.md },
  title: {
    fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[900], paddingVertical: 4, paddingHorizontal: 0, outlineStyle: 'none',
  },
  titleDone: { textDecorationLine: 'line-through', color: colors.gray[400] },
  notes: {
    fontSize: fontSize.base, color: colors.gray[700], paddingVertical: 4, paddingHorizontal: 0, minHeight: 28, outlineStyle: 'none', lineHeight: 21,
  },
  progressWrap: { marginTop: spacing.md, gap: 4 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.gray[200], overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand[600] },
  progressText: { fontSize: 12, fontWeight: '700', color: colors.gray[600] },
  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'flex-start',
    paddingVertical: 9, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: colors.brand[600],
  },
  doneBtnOff: { backgroundColor: colors.gray[100] },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },
  tabs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200] },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.brand[600] },
  tabText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[500] },
  tabTextActive: { color: colors.gray[900] },
  propValue: { fontSize: fontSize.base, color: colors.gray[800], fontWeight: '500' },
  placeholder: { fontSize: fontSize.base, color: colors.gray[400] },
  metaSmall: { fontSize: 11, color: colors.gray[400] },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.gray[100] },
  statusTagText: { fontSize: 12, fontWeight: '700', color: colors.gray[700] },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  personName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[900] },
  personMeta: { fontSize: 11, color: colors.gray[500] },
  addPerson: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addPersonText: { color: colors.brand[600], fontWeight: '700', fontSize: fontSize.sm },
  smallInput: {
    marginTop: 4, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8,
    fontSize: fontSize.sm, color: colors.gray[900], outlineStyle: 'none',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.gray[200],
  },
});
