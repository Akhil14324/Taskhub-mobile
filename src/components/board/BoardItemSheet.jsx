import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { glass } from '../../theme/glass';
import useIsDesktop from '../../hooks/useBreakpoint';
import api from '../../api/client';
import { showToast } from '../../utils/events';
import { CellView } from './Cells';
import { mayEdit } from './CellEditorHost';
import { canEditColumn, itemWordOf, paletteHex } from './model';
import Popover, { anchorOf } from './Popover';
import Hint from './Hint';
import ProgressDot from '../ProgressDot';
import { Avatar, Chip } from '../kit';
import { progressOf } from '../../utils/progress';
import TodoComments from '../todos/TodoComments';
import { TimelineEntries } from '../todos/TimeHealth';
import { AttachmentList, pickFile, uploadAttachment } from '../todos/collab';
import DueDatePicker from '../DueDatePicker';
import ShareToChatSheet from '../ShareToChatSheet';
import { PickerSheet } from '../todos/Pickers';
import { formatDue, formatTime, todayYmd, RECURRENCE_LABELS } from '../../utils/dates';
import { parseTimeText } from '../DueDatePicker';

// Task fields that are not columns on every board. They are always in the window; the first time one is set
// the board gets that column too (see BoardScreen `editActions`).
const EXTRA_FIELDS = [
  { key: 'priority', kind: 'priority', title: 'Priority' },
  { key: 'deadline', kind: 'date', title: 'Deadline' },
  { key: 'labels', kind: 'tags', title: 'Labels' },
  { key: 'estimate', kind: 'numbers', title: 'Time needed', settings: { unit: 'min' } },
];
const REMINDER_REPEATS = [{ key: null, label: 'Never' }, { key: 'daily', label: 'Every day' }, { key: 'weekly', label: 'Every week' }, { key: 'monthly', label: 'Every month' }];

const COLUMN_ICONS = {
  status: 'reorder-three-outline', person: 'person-circle-outline', date: 'calendar-outline', timeline: 'calendar-outline',
  dependency: 'return-down-forward-outline', long_text: 'document-text-outline', text: 'text-outline', files: 'document-attach-outline',
  priority: 'flag-outline', numbers: 'calculator-outline', tags: 'pricetags-outline', dropdown: 'chevron-down-circle-outline',
  checkbox: 'checkbox-outline', link: 'link-outline', rating: 'star-outline', progress: 'speedometer-outline',
};

function Row({ icon, label, hint, children }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={17} color={colors.gray[700]} />
        <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[800], flexShrink: 1 }}>{label}</Text>
        {!!hint && <Hint text={hint} size={14} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const addMinutes = (hm, min) => { const t = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + min; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const minutesBetween = (a, b) => (Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5))) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)));

/**
 * "5 pm to 6 pm": when the task is worked on. Start is the task's time and the length is its time needed, so the
 * Timebox (the board's day planner) shows the task in that slot without any other step.
 */
function TimeSlotRow({ item, canEdit, actions }) {
  const colors = useColors();
  const start = item.due_time ? String(item.due_time).slice(0, 5) : '';
  const end = start && item.duration_minutes ? addMinutes(start, item.duration_minutes) : '';
  const [from, setFrom] = useState(start ? formatTime(start) : '');
  const [to, setTo] = useState(end ? formatTime(end) : '');
  // The text follows the task, but never while the person is typing in either box, and the slot is saved once, when
  // focus leaves the pair (moving From -> To is not leaving it).
  const inside = useRef(false);
  const latest = useRef({ from, to });
  latest.current = { from, to };
  const leave = useRef(null);
  useEffect(() => { if (!inside.current) { setFrom(start ? formatTime(start) : ''); setTo(end ? formatTime(end) : ''); } }, [start, end]);
  const onFocus = () => { inside.current = true; clearTimeout(leave.current); };
  const onBlur = () => { clearTimeout(leave.current); leave.current = setTimeout(() => { inside.current = false; apply(latest.current.from, latest.current.to); }, 150); };
  const apply = (nextFrom, nextTo) => {
    const f = nextFrom.trim() ? parseTimeText(nextFrom) : null;
    const t = nextTo.trim() ? parseTimeText(nextTo) : null;
    if ((nextFrom.trim() && !f) || (nextTo.trim() && !t)) { showToast({ message: 'Type a time like 5pm or 17:30', icon: 'alert-circle-outline' }); return; }
    if (!f) {
      if (t) showToast({ message: 'Set the start time first', icon: 'information-circle' });
      if (start) actions.updateFields(item, { due_time: null });
      return;
    }
    const patch = { due_time: f };
    if (!item.due_date) patch.due_date = todayYmd();
    if (t) {
      const len = minutesBetween(f, t);
      if (len <= 0) { showToast({ message: 'The end must be after the start', icon: 'alert-circle-outline' }); return; }
      patch.duration_minutes = len;
    } else if (!item.duration_minutes) patch.duration_minutes = 60;
    if (f !== start || (patch.duration_minutes && patch.duration_minutes !== item.duration_minutes) || patch.due_date) actions.updateFields(item, patch);
  };
  const box = { flex: 1, minHeight: 40, borderRadius: radius.sm, backgroundColor: colors.gray[100], paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' };
  return (
    <Row icon="time-outline" label="Time slot" hint="When you will work on it, for example 5pm to 6pm. It appears in the Timebox tab on that day, and ticking it there ticks it here.">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={from} onChangeText={setFrom} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={() => apply(from, to)} editable={canEdit} placeholder="From, 5pm" placeholderTextColor={colors.gray[400]} style={box} />
        <Text style={{ color: colors.gray[500] }}>to</Text>
        <TextInput value={to} onChangeText={setTo} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={() => apply(from, to)} editable={canEdit} placeholder="To, 6pm" placeholderTextColor={colors.gray[400]} style={box} />
        {canEdit && !!start && <Pressable onPress={() => actions.updateFields(item, { due_time: null })} accessibilityLabel="Clear the time slot" hitSlop={6}><Ionicons name="close-circle" size={18} color={colors.gray[400]} /></Pressable>}
      </View>
    </Row>
  );
}

/** The grey field behind a value, like the board's own cell. */
function Field({ onPress, children, tall, stretch }) {
  const colors = useColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ hovered }) => ({
        minHeight: tall ? 64 : 40, borderRadius: radius.sm, backgroundColor: hovered && onPress ? colors.gray[200] : colors.gray[100],
        justifyContent: 'center', alignItems: stretch ? 'stretch' : 'center', paddingHorizontal: stretch ? 0 : spacing.md, overflow: 'hidden',
        cursor: onPress ? 'pointer' : 'default',
      })}
    >
      {children}
    </Pressable>
  );
}

/**
 * One task opened from a board: its columns on the left (group, name, owner, status, date, dependent on, notes,
 * files ...) and, on the right, Updates (the conversation), Files and the Activity Log. Every value is the
 * board's own cell, so it changes through the same editors and rules as in the table.
 */
export default function BoardItemSheet({ item, board, people, actions, onClose, onOpenCell, onOpenFull, onOpenItem, initialTab = 'updates' }) {
  const colors = useColors();
  const desktop = useIsDesktop();
  const win = useWindowDimensions();
  const { user } = useAuth();
  const { fetchTimeline } = useTodos();
  const [tab, setTab] = useState('updates');
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [log, setLog] = useState(null);
  const [groupAnchor, setGroupAnchor] = useState(null);
  const [name, setName] = useState(item?.title || '');
  const [newStep, setNewStep] = useState('');
  const [remindOpen, setRemindOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { shareTodos } = useTodos();
  const word = itemWordOf(board);
  const id = item?.id;

  useEffect(() => { setName(item?.title || ''); setNewStep(''); setTab(initialTab || 'updates'); setFiles(null); setLog(null); }, [id, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFiles = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.get(`/collab/todos/${id}`, { __skipOops: true });
      setFiles(r.data.attachments || []);
    } catch { setFiles([]); }
  }, [id]);
  const loadLog = useCallback(async () => {
    if (!id) return;
    try { setLog(await fetchTimeline(id)); } catch { setLog({ entries: [] }); }
  }, [id, fetchTimeline]);
  useEffect(() => { if (tab === 'files' && files === null) loadFiles(); }, [tab, files, loadFiles]);
  useEffect(() => { if (tab === 'activity') loadLog(); }, [tab, loadLog, item?.updated_at, item?.status]);

  const prog = useMemo(() => (item ? progressOf(item, board.items) : null), [item, board.items]);
  // Every sub-task under this task, at any depth, in order, with how deep each sits.
  const steps = useMemo(() => {
    if (!item) return [];
    const kids = new Map();
    for (const t of board.items) { if (t.parent_id) { if (!kids.has(t.parent_id)) kids.set(t.parent_id, []); kids.get(t.parent_id).push(t); } }
    const out = [];
    const walk = (pid, depth) => (kids.get(pid) || []).forEach((t) => { out.push({ t, depth }); if (depth < 5) walk(t.id, depth + 1); });
    walk(item.id, 0);
    return out;
  }, [board.items, item]);
  const group = useMemo(() => board.groups.find((g) => g.id === item?.business_section_id) || null, [board.groups, item]);
  if (!item) return null;

  const canEdit = !!item.permissions?.can_edit;
  const addStep = async () => {
    const title = newStep.trim();
    if (!title) return;
    setNewStep('');
    await actions.addItem(title, { groupId: item.business_section_id ?? undefined, parentId: item.id });
  };
  const saveName = () => {
    const t = name.trim();
    if (t && t !== item.title && canEdit) actions.updateFields(item, { title: t });
    else setName(item.title);
  };
  const addFile = async () => {
    const file = await pickFile();
    if (!file) return;
    setUploading(true);
    try {
      const a = await uploadAttachment(item.id, file, false);
      setFiles((cur) => [...(cur || []), a]);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Upload failed', tone: 'error' });
    } finally { setUploading(false); }
  };

  // A panel that slides in from the right edge, full height; a phone gets the whole screen.
  const width = desktop ? Math.min(1040, Math.round(win.width * 0.66)) : win.width;
  const height = win.height;

  const left = (
    <ScrollView style={{ flex: desktop ? 0.9 : undefined }} contentContainerStyle={{ gap: spacing.sm, padding: spacing.xl, paddingTop: spacing.md }} keyboardShouldPersistTaps="handled">
      <Row icon="ellipse" label="Group" hint="The group of the board this task sits in. Change it to move the task.">
        <Field onPress={board.access.add && canEdit ? (e) => setGroupAnchor(anchorOf(e)) : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: paletteHex(group?.color || 'grey') }} />
            <Text style={{ fontSize: 14, color: colors.gray[900] }}>{group?.name || 'No group'}</Text>
          </View>
        </Field>
      </Row>
      <Row icon="text-outline" label="Name">
        <TextInput
          value={name} onChangeText={setName} onBlur={saveName} onSubmitEditing={saveName} editable={canEdit}
          style={{ minHeight: 40, borderRadius: radius.sm, backgroundColor: colors.gray[100], paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
        />
      </Row>
      {[...board.columns, ...EXTRA_FIELDS.filter((f) => !board.columns.some((c) => c.system_key === f.key))
        .map((f) => ({ id: `x-${f.key}`, system_key: f.key, kind: f.kind, title: f.title, settings: f.settings || {}, synthetic: true }))].map((c) => {
        const editable = canEditColumn(c) && mayEdit(item, c);
        const stretch = c.kind === 'status' || c.kind === 'progress';
        const hint = c.description || (c.kind === 'dependency' ? 'Choose the task your task will be dependent on. If its date moves, this task moves with it.' : undefined);
        return (
          <Row key={c.id} icon={COLUMN_ICONS[c.kind] || 'ellipse-outline'} label={c.title} hint={hint}>
            <Field stretch={stretch} tall={c.kind === 'long_text'} onPress={editable ? (e) => onOpenCell(anchorOf(e), item, c) : undefined}>
              <CellView item={item} column={c} values={board.values} people={people} />
            </Field>
          </Row>
        );
      })}
      <TimeSlotRow item={item} canEdit={canEdit} actions={actions} />
      {(board.backlinks?.[item.id] || []).length > 0 && (
        <View style={{ marginTop: spacing.lg, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[600] }}>Linked from other tasks</Text>
          {board.backlinks[item.id].map((l) => (
            <Pressable key={`${l.id}-${l.column}`} onPress={() => onOpenFull(l.id)} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="link-outline" size={15} color={colors.gray[500]} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[900], textDecorationLine: l.is_done ? 'line-through' : 'none' }}>{l.title}</Text>
              <Text numberOfLines={1} style={{ maxWidth: '45%', fontSize: 12, color: colors.gray[500] }}>{l.board_name} · {l.column}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {canEdit && !!item.due_date && (
        <Row icon="repeat-outline" label="Repeat">
          <Field onPress={() => setRepeatOpen(true)}><Text style={{ fontSize: 14, color: colors.gray[900] }}>{item.recurrence ? RECURRENCE_LABELS[item.recurrence] : 'Does not repeat'}</Text></Field>
        </Row>
      )}
      <Row icon="alarm-outline" label="Reminder">
        <View style={{ gap: 8 }}>
          <Field onPress={canEdit ? () => setRemindOpen(true) : undefined}>
            <Text style={{ fontSize: 14, color: item.remind_date ? colors.gray[900] : colors.gray[400] }}>
              {item.remind_date ? `${formatDue(item.remind_date)} at ${formatTime(item.remind_time)}` : 'No reminder'}
            </Text>
          </Field>
          {canEdit && !!item.remind_date && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REMINDER_REPEATS.map((r) => (
                <Chip key={String(r.key)} small icon={r.key ? 'repeat' : undefined} label={r.label} active={(item.remind_repeat || null) === r.key} onPress={() => actions.updateFields(item, { remind_repeat: r.key })} />
              ))}
              <Chip small icon="close" label="Remove" onPress={() => actions.updateFields(item, { remind_date: null, remind_time: null, remind_repeat: null })} />
            </View>
          )}
        </View>
      </Row>
      <Row icon="paper-plane-outline" label="Share">
        <Field onPress={() => setShareOpen(true)}><Text style={{ fontSize: 14, color: colors.gray[900] }}>Send in chat</Text></Field>
      </Row>
    </ScrollView>
  );

  const subtasksView = (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.gray[600] }}>
        Sub-tasks{steps.length ? ` · ${steps.filter((x) => x.t.is_done).length} of ${steps.length} done` : ''}
      </Text>
      {steps.map(({ t, depth }) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38, paddingLeft: depth * 18, borderRadius: radius.sm }}>
          <Pressable onPress={() => mayEdit(t) && actions.setStatus(t, t.is_done ? 'todo' : 'done')} hitSlop={8} accessibilityLabel={t.is_done ? `Reopen ${t.title}` : `Finish ${t.title}`}>
            <Ionicons name={t.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={t.is_done ? colors.green[600] : colors.gray[400]} />
          </Pressable>
          <Pressable onPress={() => (onOpenItem ? onOpenItem(t.id) : onOpenFull(t.id))} style={{ flex: 1, minHeight: 38, justifyContent: 'center' }}>
            <Text numberOfLines={2} style={{ fontSize: 14, color: t.is_done ? colors.gray[400] : colors.gray[900], textDecorationLine: t.is_done ? 'line-through' : 'none' }}>{t.title}</Text>
          </Pressable>
          {!!t.assignee_name && <Avatar name={t.assignee_name} size={20} />}
          {t.is_done && !!t.done_at ? null : !!t.due_date && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{t.due_date.slice(5)}</Text>}
        </View>
      ))}
      {board.access.add && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: radius.sm, backgroundColor: colors.gray[100], paddingHorizontal: spacing.sm }}>
          <Ionicons name="add" size={18} color={colors.gray[500]} />
          <TextInput
            value={newStep} onChangeText={setNewStep} onSubmitEditing={addStep} blurOnSubmit={false}
            placeholder="Add a sub-task, then Enter" placeholderTextColor={colors.gray[400]} accessibilityLabel="Add a sub-task"
            style={{ flex: 1, minHeight: 40, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }}
          />
          {!!newStep.trim() && (
            <Pressable onPress={addStep} hitSlop={8} accessibilityLabel="Add sub-task"><Ionicons name="arrow-up-circle" size={24} color={BRAND} /></Pressable>
          )}
        </View>
      )}
    </View>
  );

  const tabs = [['updates', 'home-outline', 'Updates'], ['subtasks', 'git-network-outline', `Sub-tasks${steps.length ? ` (${steps.length})` : ''}`], ['files', 'document-outline', 'Files'], ['activity', 'time-outline', 'Activity Log']];
  const right = (
    <View style={{ flex: desktop ? 1 : undefined, borderLeftWidth: desktop ? 1 : 0, borderTopWidth: desktop ? 0 : 1, borderColor: colors.gray[200] }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: colors.gray[200] }} contentContainerStyle={{ gap: 4, paddingHorizontal: spacing.lg }}>
        {tabs.map(([k, icon, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: tab === k ? BRAND : 'transparent' }}>
            <Ionicons name={icon} size={16} color={tab === k ? BRAND : colors.gray[500]} />
            <Text style={{ fontSize: 14, color: tab === k ? colors.gray[900] : colors.gray[600], fontWeight: tab === k ? '600' : '400' }}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={{ flex: desktop ? 1 : undefined }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        {tab === 'updates' && <TodoComments todo={item} />}
        {tab === 'subtasks' && subtasksView}
        {tab === 'files' && (
          <View style={{ gap: spacing.md }}>
            {files === null ? <ActivityIndicator color={BRAND} /> : (
              <>
                {files.length ? <AttachmentList items={files} /> : <Text style={{ color: colors.gray[500], fontSize: 14 }}>No files yet. Add a document or a picture for this {word.toLowerCase()}.</Text>}
                <Pressable onPress={addFile} disabled={uploading} style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 9, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: BRAND }}>
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={16} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{uploading ? 'Uploading' : 'Add a file'}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
        {tab === 'activity' && (log === null ? <ActivityIndicator color={BRAND} /> : <TimelineEntries entries={log.entries} userId={user?.id} limit={0} includeComments />)}
      </ScrollView>
    </View>
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Pressable
          {...glass('sheet')}
          onPress={(e) => e.stopPropagation?.()}
          style={{ width, height, backgroundColor: colors.page, borderLeftWidth: 1, borderColor: colors.gray[200], overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontSize: 24, fontWeight: '700', color: colors.gray[900] }}>{item.title}</Text>
              <Text style={{ fontSize: 13, color: colors.gray[600], marginTop: 2 }}>in <Ionicons name="arrow-forward" size={11} /> {board.board.name}</Text>
              {!!prog && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <ProgressDot pct={prog.pct} size={22} />
                  <Text style={{ fontSize: 13, color: colors.gray[700] }}>{prog.done} of {prog.total} steps done · {prog.pct}%</Text>
                </View>
              )}
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10} style={({ hovered }) => ({ padding: 6, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="close" size={22} color={colors.gray[700]} />
            </Pressable>
          </View>
          <View style={{ flex: 1, flexDirection: desktop ? 'row' : 'column' }}>
            {desktop ? <>{left}{right}</> : <ScrollView>{left}{right}</ScrollView>}
          </View>
        </Pressable>
      </Pressable>
      <DueDatePicker
        visible={remindOpen} onClose={() => setRemindOpen(false)} date={item.remind_date} time={item.remind_time || '09:00'}
        onChange={({ date, time }) => actions.updateFields(item, date
          ? { remind_date: date, remind_time: time || item.remind_time || '09:00' }
          : { remind_date: null, remind_time: null, remind_repeat: null })}
      />
      <PickerSheet
        visible={repeatOpen} onClose={() => setRepeatOpen(false)} title="Repeat"
        options={[{ key: 'none', label: 'Does not repeat', active: !item.recurrence }, ...Object.entries(RECURRENCE_LABELS).map(([key, label]) => ({ key, label, icon: 'repeat', active: item.recurrence === key }))]}
        onPick={(key) => actions.updateFields(item, { recurrence: key === 'none' ? null : key })}
      />
      <ShareToChatSheet
        visible={shareOpen} onClose={() => setShareOpen(false)} heading="Share task" subheading={item.title}
        onSend={({ conversationIds, note }) => shareTodos({ conversationIds, todoIds: [item.id], note })}
      />
      {groupAnchor && (
        <Popover visible anchor={groupAnchor} onClose={() => setGroupAnchor(null)} width={240}>
          {board.groups.map((g) => (
            <Pressable key={g.id} onPress={() => { setGroupAnchor(null); if (g.id !== item.business_section_id) actions.updateFields(item, board.board.kind === 'my_todos' ? { list_id: g.id } : { business_section_id: g.id }); }}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: paletteHex(g.color) }} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{g.name}</Text>
              {g.id === item.business_section_id && <Ionicons name="checkmark" size={16} color={BRAND} />}
            </Pressable>
          ))}
        </Popover>
      )}
    </Modal>
  );
}
