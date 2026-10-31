import { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
import api from '../../api/client';
import { showToast } from '../../utils/events';
import Ionicons from '@expo/vector-icons/Ionicons';
import Popover from './Popover';
import DueDatePicker from '../DueDatePicker';
import {
  StatusEditor, LabelsEditor, PersonEditor, OptionsEditor, TextEditor, PriorityEditor, PaletteGrid, BoardMeta,
} from './Cells';
import { cellValue, itemWordOf } from './model';
import { formatDue } from '../../utils/dates';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';

/** Who may change which part of an item (server flags; see todo.permissions). */
export function mayEdit(item, column) {
  const p = item.permissions || {};
  if (!column) return !!p.can_edit;
  if (column.system_key === 'status' || column.kind === 'status') return !!(p.can_change_status || p.can_edit);
  if (column.system_key === 'person') return !!p.can_assign;
  if (column.system_key) return !!p.can_edit;
  return !!(p.can_change_status || p.can_edit);
}

/** Files of one cell: open, take out of the cell (the file stays on the item), or add a new one. */
function FilesEditor({ item, ids, files, onSave }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState({});
  const pick = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        const res = await api.post(`/collab/todos/${item.id}/attachments?for=task`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
        const a = res.data.attachment;
        setExtra((x) => ({ ...x, [a.id]: a }));
        onSave([...ids, a.id]);
      } catch (err) {
        showToast({ message: err.response?.data?.error || 'Upload failed', tone: 'error' });
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  const list = ids.map((id) => files[id] || extra[id]).filter(Boolean);
  return (
    <View style={{ gap: 6 }}>
      {list.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="document-outline" size={16} color={colors.gray[600]} />
          <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(a.url)}>
            <Text numberOfLines={1} style={{ color: colors.brand[600], fontSize: 14 }}>{a.filename}</Text>
          </Pressable>
          <Pressable onPress={() => onSave(ids.filter((x) => x !== a.id))} accessibilityLabel="Take out of this cell" hitSlop={6}>
            <Ionicons name="close" size={16} color={colors.gray[500]} />
          </Pressable>
        </View>
      ))}
      {!list.length && <Text style={{ color: colors.gray[500], fontSize: 13 }}>No files yet.</Text>}
      <Pressable onPress={pick} disabled={busy} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gray[100] }}>
        {busy ? <ActivityIndicator size="small" /> : <Ionicons name="cloud-upload-outline" size={16} color={colors.gray[700]} />}
        <Text style={{ color: colors.gray[800] }}>{busy ? 'Uploading…' : 'Add a file'}</Text>
      </Pressable>
    </View>
  );
}

/** Pick items of the linked board (Connect boards). */
function LinkEditor({ boardId, selfId, ids, onDone }) {
  const colors = useColors();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(ids);
  useEffect(() => {
    let live = true;
    api.get(`/boards/${boardId}`, { __skipOops: true })
      .then((r) => live && setItems(r.data.items.filter((t) => t.id !== selfId && !t.parent_id)))
      .catch(() => live && setItems([]));
    return () => { live = false; };
  }, [boardId, selfId]);
  const shown = (items || []).filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return (
    <View style={{ gap: 6 }}>
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Find an item" placeholderTextColor={colors.gray[400]}
        style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
      {!items ? <ActivityIndicator /> : (
        <ScrollView style={{ maxHeight: 260 }}>
          {shown.map((t) => {
            const on = picked.includes(t.id);
            return (
              <Pressable key={t.id} onPress={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: radius.md, backgroundColor: on ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={17} color={on ? colors.brand[600] : colors.gray[400]} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
              </Pressable>
            );
          })}
          {!shown.length && <Text style={{ color: colors.gray[500], padding: 6 }}>Nothing matches.</Text>}
        </ScrollView>
      )}
      <Pressable onPress={() => onDone(picked)} style={{ backgroundColor: colors.brand[600], borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
      </Pressable>
    </View>
  );
}

/**
 * "Dependent on": pick the tasks this one waits for. When one of them moves, this task moves by the same days
 * (the server does it). Tasks that already wait for this one are left out, they would make a loop.
 */
function DependsEditor({ board, item, ids, onDone }) {
  const colors = useColors();
  const word = itemWordOf(board).toLowerCase();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(ids);
  const below = useMemo(() => {
    // Everything that (directly or not) waits for this item.
    const waits = new Map();
    for (const t of board.items) for (const d of t.depends_on || []) waits.set(d.id, [...(waits.get(d.id) || []), t.id]);
    const out = new Set();
    const walk = (id) => { for (const next of waits.get(id) || []) if (!out.has(next)) { out.add(next); walk(next); } };
    walk(item.id);
    return out;
  }, [board.items, item.id]);
  const shown = board.items
    .filter((t) => !t.parent_id && t.id !== item.id && !below.has(t.id) && (!q || t.title.toLowerCase().includes(q.toLowerCase())))
    .slice(0, 80);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: colors.gray[700], paddingHorizontal: 2 }}>Choose the {word} your {word} will be dependent on</Text>
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder={`Find a ${word}`} placeholderTextColor={colors.gray[400]}
        style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
      <ScrollView style={{ maxHeight: 240 }}>
        {shown.map((t) => {
          const on = picked.includes(t.id);
          return (
            <Pressable key={t.id} onPress={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7, borderRadius: radius.md, backgroundColor: on ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={17} color={on ? colors.brand[600] : colors.gray[400]} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{t.title}</Text>
              {!!t.due_date && <Text style={{ fontSize: 11, color: colors.gray[500] }}>{formatDue(t.due_date)}</Text>}
            </Pressable>
          );
        })}
        {!shown.length && <Text style={{ color: colors.gray[500], padding: 6 }}>No other {word} to pick.</Text>}
      </ScrollView>
      <Text style={{ fontSize: 11, color: colors.gray[500], paddingHorizontal: 2 }}>If a {word} you pick changes its date, this one moves by the same days.</Text>
      <Pressable onPress={() => onDone(picked)} style={{ backgroundColor: colors.brand[600], borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
      </Pressable>
    </View>
  );
}

/** What the date picker edits for a date or week column, and how its answer is saved. */
function dateSpecFor(item, column, v, actions) {
  if (column.system_key === 'date') {
    return { value: { date: item.due_date, time: item.due_time }, allowTime: true, onPick: (p) => actions.updateFields(item, { due_date: p.date, due_time: p.time }) };
  }
  if (column.system_key === 'deadline') {
    return { value: { date: item.deadline_date }, onPick: (p) => actions.updateFields(item, { deadline_date: p.date }) };
  }
  if (column.kind === 'week') return { value: { date: v }, onPick: (p) => actions.setValue(item, column, p.date) };
  return {
    value: { date: v?.date, time: v?.time },
    allowTime: !!column.settings?.with_time,
    onPick: (p) => actions.setValue(item, column, p.date ? { date: p.date, time: p.time || undefined } : null),
  };
}

/**
 * The one open cell editor of a board. `editing` = { item, column, anchor } (column null = the item name).
 * Saves through the useBoard actions, then closes.
 */
export default function CellEditorHost({ editing, onClose, board, people, actions }) {
  const colors = useColors();
  const meta = useContext(BoardMeta);
  const [stage, setStage] = useState('main');
  const [picker, setPicker] = useState(null);
  const item = editing?.item;
  const column = editing?.column;
  const values = board?.values;

  const candidates = useMemo(() => {
    const bizId = board?.board?.business_id;
    // Same rule as the server's isAssignable: people in the business, plus leadership (level 3 or above).
    return (people || []).filter((p) => !bizId || (p.level !== null && p.level !== undefined && p.level <= 3)
      || (p.businesses || []).some((b) => b.id === bizId));
  }, [people, board]);

  if (!editing) return null;
  const close = () => { setStage('main'); setPicker(null); onClose(); };
  const done = (fn) => (...args) => { fn(...args); close(); };

  const v = column ? cellValue(item, column, values) : null;

  // Dates open the app's own date picker, not a popover: a date column straight away, a timeline's start or
  // end from its popover.
  const openDate = (value, onPick, { allowTime = false } = {}) => setPicker({ value, onPick, allowTime });
  const spec = picker || (column && (column.kind === 'date' || column.kind === 'week') ? dateSpecFor(item, column, v, actions) : null);
  if (spec) {
    return (
      <DueDatePicker
        visible
        date={spec.value?.date || null}
        time={spec.value?.time || null}
        allowTime={spec.allowTime}
        onClose={close}
        onChange={(picked) => { spec.onPick(picked); close(); }}
      />
    );
  }

  let body = null;

  if (!column) {
    body = <TextEditor initial={item.title} placeholder={`${itemWordOf(board)} name`} onDone={done((t) => t.trim() && t.trim() !== item.title && actions.updateFields(item, { title: t.trim() }))} />;
  } else if (column.kind === 'status') {
    if (stage === 'labels') {
      body = (
        <LabelsEditor
          column={column}
          onBack={() => setStage('main')}
          onUpdate={(l, patch) => actions.updateLabel(column, l, patch)}
          onAdd={(l) => actions.addLabel(column, l)}
          onRemove={(l) => actions.removeLabel(column, l)}
        />
      );
    } else if (stage === 'stuck') {
      body = (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.gray[700] }}>What is it stuck on?</Text>
          <TextEditor initial="" placeholder="Waiting for the supplier's quote" onDone={done((note) => actions.setStatus(item, 'blocked', { note: note.trim() || 'Stuck' }))} />
        </View>
      );
    } else {
      body = (
        <StatusEditor
          item={item}
          column={column}
          values={values}
          canManage={board?.access?.manage}
          onEditLabels={() => setStage('labels')}
          onPick={(label) => {
            if (column.system_key === 'status') {
              if (label?.maps_to === 'blocked') { setStage('stuck'); return; }
              actions.setStatus(item, label?.maps_to);
            } else {
              actions.setValue(item, column, label ? { label_id: label.id } : null);
            }
            close();
          }}
        />
      );
    }
  } else if (column.kind === 'person') {
    const selected = column.system_key ? (v ? [v] : []) : (v || []);
    body = (
      <PersonEditor
        selected={selected}
        multiple={!column.system_key}
        candidates={candidates}
        onDone={done((picked) => (column.system_key ? actions.assign(item, picked) : actions.setValue(item, column, picked)))}
      />
    );
  } else if (column.kind === 'timeline') {
    const [start, end] = column.system_key ? v : v ? [v.start, v.end] : [null, null];
    const save = (s, e) => (column.system_key
      ? actions.updateFields(item, { start_date: s, due_date: e })
      : actions.setValue(item, column, s && e ? { start: s, end: e } : null));
    const Line = ({ label, value, onPress }) => (
      <Pressable onPress={onPress} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gray[100] }}>
        <Text style={{ color: colors.gray[600] }}>{label}</Text>
        <Text style={{ color: colors.gray[900], fontWeight: '500' }}>{value ? formatDue(value) : 'Pick'}</Text>
      </Pressable>
    );
    body = (
      <View style={{ gap: 6 }}>
        <Line label="Start" value={start} onPress={() => openDate({ date: start }, (p) => save(p.date, end && p.date && end < p.date ? p.date : end))} />
        <Line label="End" value={end} onPress={() => openDate({ date: end }, (p) => save(start && p.date && p.date < start ? p.date : start, p.date))} />
      </View>
    );
  } else if (column.kind === 'dependency') {
    body = <DependsEditor board={board} item={item} ids={(v || []).map((d) => d.id)} onDone={done((ids) => actions.setDepends(item, ids))} />;
  } else if (column.kind === 'priority') {
    body = <PriorityEditor value={item.priority} onDone={done((p) => actions.updateFields(item, { priority: p }))} />;
  } else if (column.kind === 'dropdown') {
    const canAdd = board?.access?.manage;
    body = (
      <OptionsEditor
        column={column}
        selected={v || []}
        onDone={done((ids) => actions.setValue(item, column, ids))}
        onAddOption={canAdd ? async (label) => {
          const options = [...(column.settings?.options || [])];
          const id = `o${Date.now().toString(36)}`;
          options.push({ id, label, color: ['blue', 'green', 'orange', 'purple', 'red', 'aquamarine', 'pink', 'yellow'][options.length % 8] });
          await actions.updateColumn(column, { settings: { ...column.settings, options } });
        } : null}
      />
    );
  } else if (column.kind === 'color') {
    body = <PaletteGrid value={v} onPick={done((c) => actions.setValue(item, column, c))} />;
  } else if (column.system_key === 'labels' || column.kind === 'tags') {
    const initial = (v || []).join(', ');
    const save = (text) => {
      const tags = [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];
      if (column.system_key) actions.updateFields(item, { labels: tags });
      else actions.setValue(item, column, tags.length ? tags : null);
    };
    body = <TextEditor initial={initial} placeholder="site, urgent, client" onDone={done(save)} />;
  } else if (column.kind === 'files') {
    body = <FilesEditor item={item} ids={v || []} files={meta.attachments || {}} onSave={(ids) => actions.setValue(item, column, ids.length ? ids : null)} />;
  } else if (column.kind === 'board_relation') {
    body = <LinkEditor boardId={column.settings?.board_id || board.board.id} selfId={item.id} ids={v || []} onDone={done((ids) => actions.setValue(item, column, ids.length ? ids : null))} />;
  } else if (column.kind === 'world_clock') {
    body = <TextEditor initial={v || column.settings?.timezone || 'Asia/Kolkata'} placeholder="Asia/Kolkata, Asia/Dubai, Europe/London" onDone={done((t) => actions.setValue(item, column, t.trim() || null))} />;
  } else if (column.kind === 'ai') {
    body = (
      <View style={{ gap: 8 }}>
        <TextEditor initial={v || ''} multiline placeholder="Write it, or let AI fill it" onDone={done((t) => actions.setValue(item, column, t.trim() || null))} />
        {meta.aiEnabled && (column.settings?.source_column_ids || []).length > 0 && (
          <Pressable onPress={() => { actions.aiFill(column, [item.id]); close(); }} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.purple[50] }}>
            <Ionicons name="sparkles" size={15} color={colors.purple[600]} />
            <Text style={{ color: colors.purple[600], fontWeight: '600' }}>Fill with AI</Text>
          </Pressable>
        )}
      </View>
    );
  } else if (column.system_key === 'estimate') {
    body = <TextEditor initial={v ? String(v) : ''} placeholder="Minutes" keyboardType="numeric" onDone={done((t) => actions.updateFields(item, { duration_minutes: t.trim() ? Number(t) : null }))} />;
  } else if (['text', 'long_text', 'numbers', 'link', 'email', 'phone', 'hour', 'country', 'location', 'progress'].includes(column.kind)) {
    const initial = column.kind === 'link' ? (v?.url || '') : column.kind === 'location' ? (v?.address || '') : (v ?? '');
    const parse = (t) => {
      const s = String(t).trim();
      if (!s) return null;
      if (column.kind === 'link') return { url: /^(https?:\/\/|mailto:)/i.test(s) ? s : `https://${s}` };
      if (column.kind === 'location') return { address: s };
      if (column.kind === 'progress') return Number(s);
      return s;
    };
    body = (
      <TextEditor
        initial={String(initial)}
        multiline={column.kind === 'long_text'}
        keyboardType={['numbers', 'progress'].includes(column.kind) ? 'numeric' : undefined}
        placeholder={{ hour: '14:30', country: 'IN', progress: '0 to 100', link: 'https://', email: 'name@company.com', phone: '+91 ...' }[column.kind]}
        onDone={done((t) => actions.setValue(item, column, parse(t)))}
      />
    );
  } else {
    body = <Text style={{ padding: spacing.sm, color: colors.gray[600] }}>This column fills itself.</Text>;
  }

  return (
    <Popover visible anchor={editing.anchor} onClose={close} width={column?.kind === 'long_text' ? 360 : column?.kind === 'dependency' ? 340 : 280}>
      {column && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingBottom: 6 }}>
          <Ionicons name="create-outline" size={13} color={colors.gray[500]} />
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500], flex: 1 }}>{column.title} · {item.title}</Text>
        </View>
      )}
      {body}
    </Popover>
  );
}
