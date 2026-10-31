import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Popover from './Popover';
import DueDatePicker from '../DueDatePicker';
import {
  StatusEditor, LabelsEditor, PersonEditor, OptionsEditor, TextEditor, PriorityEditor, PaletteGrid,
} from './Cells';
import { cellValue } from './model';
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
    body = <TextEditor initial={item.title} placeholder="Item name" onDone={done((t) => t.trim() && t.trim() !== item.title && actions.updateFields(item, { title: t.trim() }))} />;
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
    <Popover visible anchor={editing.anchor} onClose={close} width={column?.kind === 'long_text' ? 360 : 280}>
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
