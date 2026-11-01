import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { progressOf } from '../../utils/progress';
import TodoComments from '../todos/TodoComments';
import { TimelineEntries } from '../todos/TimeHealth';
import { AttachmentList, pickFile, uploadAttachment } from '../todos/collab';

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
export default function BoardItemSheet({ item, board, people, actions, onClose, onOpenCell, onOpenFull, initialTab = 'updates' }) {
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
  const word = itemWordOf(board);
  const id = item?.id;

  useEffect(() => { setName(item?.title || ''); setTab(initialTab || 'updates'); setFiles(null); setLog(null); }, [id, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const group = useMemo(() => board.groups.find((g) => g.id === item?.business_section_id) || null, [board.groups, item]);
  if (!item) return null;

  const canEdit = !!item.permissions?.can_edit;
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
      {board.columns.map((c) => {
        const editable = canEditColumn(c) && mayEdit(item, c);
        const stretch = c.kind === 'status';
        const hint = c.description || (c.kind === 'dependency' ? 'Choose the task your task will be dependent on. If its date moves, this task moves with it.' : undefined);
        return (
          <Row key={c.id} icon={COLUMN_ICONS[c.kind] || 'ellipse-outline'} label={c.title} hint={hint}>
            <Field stretch={stretch} tall={c.kind === 'long_text'} onPress={editable ? (e) => onOpenCell(anchorOf(e), item, c) : undefined}>
              <CellView item={item} column={c} values={board.values} people={people} />
            </Field>
          </Row>
        );
      })}
      <Pressable onPress={() => onOpenFull(item.id)} style={({ hovered }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent', marginTop: spacing.sm })}>
        <Ionicons name="options-outline" size={16} color={colors.brand[600]} />
        <Text style={{ fontSize: 14, color: colors.brand[600] }}>More options (sub-tasks, share, reminder)</Text>
      </Pressable>
    </ScrollView>
  );

  const tabs = [['updates', 'home-outline', 'Updates'], ['files', 'document-outline', 'Files'], ['activity', 'time-outline', 'Activity Log']];
  const right = (
    <View style={{ flex: desktop ? 1 : undefined, borderLeftWidth: desktop ? 1 : 0, borderTopWidth: desktop ? 0 : 1, borderColor: colors.gray[200] }}>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
        {tabs.map(([k, icon, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: tab === k ? BRAND : 'transparent' }}>
            <Ionicons name={icon} size={16} color={tab === k ? BRAND : colors.gray[500]} />
            <Text style={{ fontSize: 14, color: tab === k ? colors.gray[900] : colors.gray[600], fontWeight: tab === k ? '600' : '400' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={{ flex: desktop ? 1 : undefined }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        {tab === 'updates' && <TodoComments todo={item} />}
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
