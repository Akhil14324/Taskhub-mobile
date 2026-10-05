import { useEffect, useMemo, useRef, useState } from 'react';
import autoGrow from '../../utils/autoGrow';
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
import KudosSheet from '../engage/KudosSheet';
import { SaveTemplateSheet } from './TemplatesSheet';
import SubtaskTree from './SubtaskTree';
import TodoComments from './TodoComments';
import TodoTimeline, { AssignSheet } from './TodoTimeline';
import { PickerSheet } from './Pickers';
import GovernancePanel from './GovernancePanel';
import PromptSheet from './PromptSheet';
import { Avatar, Chip, PRIORITY, TodoCheckbox, ListGlyph, DueChip } from '../kit';
import useDirectory, { filterPeople } from '../../hooks/useDirectory';
import { RECURRENCE_LABELS, timeAgo, formatDue } from '../../utils/dates';
import { DURATION_PRESETS, REMINDER_CHOICES, formatDuration, cleanLabel } from '../../utils/todoMeta';
import { STATUS } from '../../utils/timeline';
import { showToast } from '../../utils/events';
import { glass } from '../../theme/glass';

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'comments', label: 'Comments' },
  { key: 'activity', label: 'Activity' },
];

/**
 * Everything about one to-do: details, comments and activity. Fields save as they are edited and
 * follow the server's permission flags (people who may not edit just read). `variant` is how it is
 * hosted: a bottom sheet / dialog, or the side panel of the desktop to-do screen.
 */
export function TodoDetailBody({ todoId, onClose, variant = 'sheet' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const [tab, setTab] = useState('details');
  const [title, setTitle] = useState('');
  const titleRef = useRef(null);
  // The whole task name is always visible: the field is as tall as its text.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const grow = () => autoGrow(titleRef.current);
    const id = requestAnimationFrame(grow);
    const late = setTimeout(grow, 350); // once the sheet has finished sizing itself
    window.addEventListener('resize', grow);
    return () => { cancelAnimationFrame(id); clearTimeout(late); window.removeEventListener('resize', grow); };
  }, [title]);
  const [notes, setNotes] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [kudosOpen, setKudosOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [more, setMore] = useState(true);
  const [moveOpen, setMoveOpen] = useState(false);
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
      setTab('details');
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
    : (isCreator ? 'Delete' : 'Remove');

  if (!todo) return null;
  const statusLabel = todo.is_done ? 'Done' : STATUS[todo.status]?.label || todo.status;

  return (
    <View style={variant === 'panel' ? styles.panel : { flexShrink: 1 }}>
      {variant === 'panel' && (
        <View style={styles.panelBar}>
          <View style={styles.crumbRow}>
            {crumbs.map((c) => (
              <AnimatedPressable key={c.id} style={styles.crumb} onPress={() => setActiveId(c.id)}>
                <Text style={styles.crumbText} numberOfLines={1}>{c.title}</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.gray[400]} />
              </AnimatedPressable>
            ))}
            <Text style={styles.crumbHere} numberOfLines={1}>{business ? todo.business_name : 'To-do'}</Text>
          </View>
          <AnimatedPressable onPress={() => setShareOpen(true)} hitSlop={8} accessibilityLabel="Share">
            <Ionicons name="paper-plane-outline" size={19} color={colors.gray[500]} />
          </AnimatedPressable>
          <AnimatedPressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.gray[500]} />
          </AnimatedPressable>
        </View>
      )}
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {variant !== 'panel' && crumbs.length > 0 && (
          <AnimatedPressable style={styles.sheetCrumb} onPress={() => setActiveId(crumbs[crumbs.length - 1].id)}>
            <Ionicons name="return-up-back" size={14} color={colors.gray[500]} />
            <Text style={styles.crumbText} numberOfLines={1}>{crumbs[crumbs.length - 1].title}</Text>
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
            ref={titleRef}
            style={[styles.title, todo.is_done && styles.titleDone]}
            multiline
            numberOfLines={1}
            scrollEnabled={false}
            editable={editable}
            placeholder="Title"
            placeholderTextColor={colors.gray[400]}
          />
        </View>

        <View style={styles.statusLine}>
          {business && (
            <View style={styles.bizTag}>
              <Ionicons name="briefcase-outline" size={12} color={colors.brand[700]} />
              <Text style={styles.bizTagText} numberOfLines={1}>{todo.business_name}</Text>
            </View>
          )}
          <View style={styles.statusTag}>
            <Ionicons name={todo.is_done ? STATUS.done.icon : STATUS[todo.status]?.icon || 'ellipse-outline'} size={12} color={colors.gray[600]} />
            <Text style={styles.statusTagText}>{statusLabel}</Text>
          </View>
          {!!todo.source_business_name && (
            <Text style={styles.metaSmall}>requested by {todo.source_business_name}</Text>
          )}
        </View>

        {(editable || todo.permissions?.can_change_status !== false) && (
          <AnimatedPressable style={[styles.doneBtn, todo.is_done && styles.doneBtnOff]} onPress={() => toggleTodo(todo)} haptic="medium">
            <Ionicons name={todo.is_done ? 'refresh' : 'checkmark-circle'} size={19} color={todo.is_done ? colors.gray[700] : '#fff'} />
            <Text style={[styles.doneBtnText, todo.is_done && { color: colors.gray[700] }]}>{todo.is_done ? 'Reopen' : 'Mark done'}</Text>
          </AnimatedPressable>
        )}

        <GovernancePanel todo={todo} />

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <AnimatedPressable key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}{t.key === 'comments' && todo.comment_count > 0 ? ` · ${todo.comment_count}` : ''}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {tab === 'details' && (
          <View>
            {/* Description: what the work is. Comments are a separate conversation (next tab). */}
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onBlur={() => notes !== (todo.notes || '') && save({ notes })}
              {...glass('inset')} style={styles.notes}
              editable={editable}
              placeholder={editable ? 'Add a description' : 'No description'}
              placeholderTextColor={colors.gray[400]}
              multiline
            />

            <Text style={styles.label}>Schedule</Text>
            <AnimatedPressable {...glass('inset')} style={styles.field} onPress={editable ? () => setDateOpen(true) : undefined}>
              <Ionicons name="calendar-outline" size={19} color={colors.gray[500]} />
              <View style={{ flex: 1 }}>
                {todo.due_date
                  ? <DueChip date={todo.due_date} time={todo.due_time} recurrence={todo.recurrence} done={todo.is_done} />
                  : <Text style={styles.fieldPlaceholder}>No date</Text>}
              </View>
              {editable && !!todo.due_date && (
                <AnimatedPressable onPress={() => save({ due_date: null, due_time: null, recurrence: null, reminder_offsets: [] })} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
                </AnimatedPressable>
              )}
            </AnimatedPressable>

            <Text style={styles.label}>Priority</Text>
            <View style={styles.chipRow}>
              {[1, 2, 3, 4].map((p) => (
                <Chip key={p} icon="flag" color={PRIORITY[p].color} label={PRIORITY[p].short} active={todo.priority === p} onPress={editable ? () => save({ priority: p }) : undefined} />
              ))}
            </View>

            {business ? (
              <>
                <Text style={styles.label}>Assigned to</Text>
                <AnimatedPressable {...glass('inset')} style={styles.field} onPress={perms.can_assign ? () => setAssignOpen(true) : undefined}>
                  <Avatar name={todo.assignee_name || todo.business_name || '?'} uri={todo.assignee_picture} size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldValue}>
                      {todo.assignee_id === user?.id ? 'You' : todo.assignee_name || 'Open to everyone in the business'}
                    </Text>
                    <Text style={styles.metaSmall}>Set by {isCreator ? 'you' : todo.created_by_name}</Text>
                  </View>
                  {perms.can_assign && <Ionicons name="swap-horizontal" size={18} color={colors.gray[400]} />}
                </AnimatedPressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>List</Text>
                <View style={styles.chipRow}>
                  <Chip icon="file-tray" label="Inbox" active={!todo.list_id} onPress={editable ? () => save({ list_id: null }) : undefined} />
                  {lists.map((l) => (
                    <Chip key={l.id} label={l.name} active={todo.list_id === l.id} onPress={editable ? () => save({ list_id: l.id }) : undefined} />
                  ))}
                </View>
                {listSections.length > 0 && !todo.parent_id && (
                  <>
                    <Text style={styles.label}>Section</Text>
                    <View style={styles.chipRow}>
                      <Chip label="No section" active={!todo.section_id} onPress={editable ? () => save({ section_id: null }) : undefined} />
                      {listSections.map((s) => (
                        <Chip key={s.id} icon="albums-outline" label={s.name} active={todo.section_id === s.id} onPress={editable ? () => save({ section_id: s.id }) : undefined} />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {!simple && <Text style={styles.label}>Labels</Text>}
            {!simple && <View style={styles.chipRow}>
              {todoLabels.map((l) => (
                <Chip key={l} icon="pricetag" label={l} active onRemove={editable ? () => save({ labels: todoLabels.filter((x) => x !== l) }) : undefined} />
              ))}
              {editable && labelText === null && <Chip icon="add" label="Label" onPress={() => setLabelText('')} />}
              {!editable && todoLabels.length === 0 && <Text style={styles.fieldPlaceholder}>None</Text>}
            </View>}
            {!simple && labelText !== null && (
              <View>
                <TextInput
                  autoFocus
                  value={labelText}
                  onChangeText={setLabelText}
                  onSubmitEditing={() => addLabel(labelText)}
                  onBlur={() => !labelText && setLabelText(null)}
                  placeholder="Type a label, then Enter"
                  placeholderTextColor={colors.gray[400]}
                  {...glass('inset')} style={styles.personInput}
                  autoCapitalize="none"
                />
                <View style={[styles.chipRow, { marginBottom: spacing.sm }]}>
                  {labelSuggestions.map((l) => (
                    <Chip key={l.name} small icon="pricetag-outline" label={l.name} onPress={() => addLabel(l.name)} />
                  ))}
                </View>
              </View>
            )}

            {editable && !simple && (
              <AnimatedPressable style={styles.moreToggle} onPress={() => setMore((v) => !v)}>
                <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.gray[500]} />
                <Text style={styles.moreText}>Date & reminders</Text>
                <Text style={styles.moreHint}>deadline, repeat, reminder{business && !todo.parent_id ? ', review' : ''}</Text>
              </AnimatedPressable>
            )}
            {editable && !simple && more && (
              <View>
                <Text style={styles.label}>Deadline</Text>
                <AnimatedPressable {...glass('inset')} style={styles.field} onPress={() => setDeadlineOpen(true)}>
                  <Ionicons name="alert-circle-outline" size={19} color={colors.gray[500]} />
                  <View style={{ flex: 1 }}>
                    {todo.deadline_date
                      ? <Text style={styles.fieldValue}>{formatDue(todo.deadline_date)}</Text>
                      : <Text style={styles.fieldPlaceholder}>No deadline</Text>}
                  </View>
                  {!!todo.deadline_date && (
                    <AnimatedPressable onPress={() => save({ deadline_date: null })} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
                    </AnimatedPressable>
                  )}
                </AnimatedPressable>

                <Text style={styles.label}>Repeat</Text>
                <View style={styles.chipRow}>
                  <Chip label="Never" active={!todo.recurrence} onPress={() => save({ recurrence: null })} />
                  {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                    <Chip key={key} icon="repeat" label={label} active={todo.recurrence === key} onPress={() => save({ recurrence: key })} />
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

                {business && !todo.parent_id && (
                  <>
                    <Text style={styles.label}>When it is finished</Text>
                    <View style={styles.chipRow}>
                      <Chip label="Close it" active={!todo.requires_approval} onPress={() => save({ requires_approval: false })} />
                      <Chip icon="eye-outline" label="Needs a review" active={!!todo.requires_approval} onPress={() => save({ requires_approval: true })} />
                    </View>
                  </>
                )}
              </View>
            )}

            <SubtaskTree parent={todo} onOpen={setActiveId} />

            {!business && (
              <>
                <Text style={styles.label}>Shared with</Text>
                {members.map((m) => (
                  <View key={m.id} style={styles.person}>
                    <Avatar name={m.name} uri={m.profile_picture} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{m.id === user?.id ? `${m.name} (you)` : m.name}</Text>
                      <Text style={styles.personMeta}>@{m.username}{m.id === todo.created_by ? ' · creator' : ''}</Text>
                    </View>
                    {isCreator && m.id !== todo.created_by && (
                      <AnimatedPressable onPress={() => removeMember(todo.id, m.id)} hitSlop={8}>
                        <Ionicons name="remove-circle-outline" size={20} color={colors.red[500]} />
                      </AnimatedPressable>
                    )}
                  </View>
                ))}
                {personQuery === null ? (
                  <AnimatedPressable style={styles.addPerson} onPress={() => setPersonQuery('')}>
                    <Ionicons name="person-add-outline" size={18} color={colors.brand[600]} />
                    <Text style={styles.addPersonText}>Add someone. It appears in their list too</Text>
                  </AnimatedPressable>
                ) : (
                  <View>
                    <TextInput
                      autoFocus
                      value={personQuery}
                      onChangeText={setPersonQuery}
                      placeholder="Type a name or @username"
                      placeholderTextColor={colors.gray[400]}
                      {...glass('inset')} style={styles.personInput}
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
              </>
            )}

            <Text style={styles.meta}>
              Created by {isCreator ? 'you' : todo.created_by_name} · {timeAgo(todo.created_at)}
              {!todo.due_date && !todo.deadline_date && !todo.is_done ? `
No deadline. Open since ${timeAgo(todo.created_at)}, last update ${timeAgo(todo.updated_at)}` : ''}
              {todo.is_done && todo.done_by_name ? `\nCompleted by ${todo.done_by === user?.id ? 'you' : todo.done_by_name} · ${timeAgo(todo.done_at)}` : ''}
            </Text>
          </View>
        )}

        {tab === 'comments' && <TodoComments todo={todo} />}
        {tab === 'activity' && <TodoTimeline todo={todo} />}

        <View style={styles.actions}>
          {variant !== 'panel' && <ActionButton icon="paper-plane-outline" label="Share" onPress={() => setShareOpen(true)} />}
          <ActionButton icon="copy-outline" label="Save as template" onPress={() => setTemplateOpen(true)} />
          {!!kudosTarget && <ActionButton icon="heart-outline" label={`Thank ${kudosTarget.name.split(' ')[0]}`} onPress={() => setKudosOpen(true)} />}
          {!business && (
            <ActionButton
              icon="copy-outline"
              label="Duplicate"
              onPress={() => duplicateTodo(todo).catch((err) => showToast({ message: err.response?.data?.error || 'Could not duplicate', tone: 'error' }))}
            />
          )}
          {!business && !todo.parent_id && isCreator && businesses.length > 0 && (
            <ActionButton icon="briefcase-outline" label="Move to business" onPress={() => setMoveOpen(true)} />
          )}
          {!!deleteLabel && <ActionButton icon="trash-outline" label={deleteLabel} destructive onPress={onDelete} />}
        </View>
      </ScrollView>

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

/** The detail as a bottom sheet (dialog on desktop). */
export default function TodoDetailSheet({ todoId, onClose }) {
  const { todos } = useTodos();
  const exists = todos.some((t) => t.id === todoId);
  return (
    <BottomSheet visible={!!todoId && exists} onClose={onClose} maxHeight={780} avoidKeyboard>
      <TodoDetailBody todoId={todoId} onClose={onClose} />
    </BottomSheet>
  );
}

function ActionButton({ icon, label, destructive, onPress }) {
  const colors = useColors();
  const color = destructive ? colors.red[600] : colors.brand[600];
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11,
        borderRadius: radius.lg, backgroundColor: colors.gray[100],
      }}
    >
      <Ionicons name={icon} size={17} color={color} />
      <Text style={{ color, fontWeight: '600', fontSize: fontSize.sm }}>{label}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.white },
  panelBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  crumbRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 },
  crumbText: { fontSize: fontSize.sm, color: colors.gray[500], flexShrink: 1 },
  crumbHere: { fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '600' },
  sheetCrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
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
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingHorizontal: spacing.sm, marginLeft: 24 + spacing.md, marginTop: -4 },
  bizTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.brand[100] },
  bizTagText: { fontSize: 11, fontWeight: '700', color: colors.brand[700], maxWidth: 160 },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.gray[100] },
  statusTagText: { fontSize: 11, fontWeight: '600', color: colors.gray[600] },
  metaSmall: { fontSize: 11, color: colors.gray[400] },
  tabs: {
    flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg, marginHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.gray[200],
  },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.brand[600] },
  tabText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[500] },
  tabTextActive: { color: colors.gray[900] },
  notes: {
    fontSize: fontSize.base,
    color: colors.gray[800],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.sm,
    minHeight: 64,
    backgroundColor: colors.gray[50],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
    outlineStyle: 'none',
    textAlignVertical: 'top',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.gray[50],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
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
  doneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginHorizontal: spacing.sm, marginTop: spacing.md, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: colors.brand[600] },
  doneBtnOff: { backgroundColor: colors.gray[100] },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: fontSize.base },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.md, marginTop: spacing.sm },
  moreText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
  moreHint: { fontSize: 11, color: colors.gray[400], flexShrink: 1 },
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.sm, paddingBottom: spacing.lg },
});
