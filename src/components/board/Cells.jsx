import { createContext, memo, useContext, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize, PALETTE, PALETTE_NAMES, BRAND } from '../../theme/theme';
import { Avatar, PRIORITY } from '../kit';
import { formatDue, daysFromToday, timeAgo } from '../../utils/dates';
import {
  cellValue, statusLabelOf, paletteHex, paletteInk, formatNumber, canEditColumn,
} from './model';

/**
 * What a board's cells may need besides their own value: titles of linked items (Connect boards), the files of
 * Files cells, who is looking (votes) and whether AI is set up. Provided by BoardScreen.
 */
export const BoardMeta = createContext({ linked: {}, attachments: {}, meId: null, aiEnabled: false });

function clockIn(zone) {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(new Date());
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------------------------------
// Display: what a cell looks like in the table (desktop) and on a card (phone).
// ---------------------------------------------------------------------------------------------------

const Empty = () => null;

function StatusPill({ label, compact }) {
  if (!label) return <View style={{ flex: 1 }} />;
  return (
    <View style={{
      flex: compact ? 0 : 1, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center',
      backgroundColor: paletteHex(label.color), paddingHorizontal: spacing.sm, borderRadius: compact ? radius.md : 0,
      minHeight: compact ? 24 : undefined,
    }}
    >
      <Text numberOfLines={1} style={{ color: paletteInk(label.color), fontSize: 13, fontWeight: '500' }}>{label.label}</Text>
    </View>
  );
}

function People({ ids, item, people, size = 26 }) {
  const list = (ids || []).map((id) => people.find((p) => p.id === id) || (id === item.assignee_id ? { id, name: item.assignee_name, profile_picture: item.assignee_picture } : null)).filter(Boolean);
  if (!list.length) return <Ionicons name="person-circle-outline" size={size} color="#c3c6d4" />;
  return (
    <View style={{ flexDirection: 'row' }}>
      {list.slice(0, 3).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={p.name} uri={p.profile_picture} size={size} /></View>
      ))}
      {list.length > 3 && <Text style={{ marginLeft: 4, fontSize: 12, alignSelf: 'center' }}>+{list.length - 3}</Text>}
    </View>
  );
}

function DateText({ ymd, time, done }) {
  const colors = useColors();
  if (!ymd) return <Empty />;
  const diff = daysFromToday(ymd);
  const late = !done && diff < 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {done ? <Ionicons name="checkmark" size={14} color={colors.green[600]} />
        : late ? <Ionicons name="alert-circle" size={13} color={colors.red[600]} />
          : <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gray[500] }} />}
      <Text numberOfLines={1} style={{ fontSize: 13, color: late ? colors.red[600] : done ? colors.gray[400] : colors.gray[800], textDecorationLine: done ? 'line-through' : 'none' }}>
        {formatDue(ymd)}{time ? ` ${time}` : ''}
      </Text>
    </View>
  );
}

function Chips({ chips }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, overflow: 'hidden' }}>
      {chips.map((c) => (
        <View key={c.key} style={{ backgroundColor: c.color ? paletteHex(c.color) : '#e1e4ee', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.color ? paletteInk(c.color) : '#323338' }}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Stars({ value, max = 5, onSet }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array.from({ length: max }, (_, i) => (
        <Pressable key={i} disabled={!onSet} onPress={() => onSet?.(value === i + 1 ? null : i + 1)} hitSlop={2} accessibilityLabel={`${i + 1} stars`}>
          <Ionicons name={i < (value || 0) ? 'star' : 'star-outline'} size={15} color={i < (value || 0) ? '#ffcb00' : '#c3c6d4'} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The inside of one cell. `onToggle(value)` is for cells that change in place (checkbox, rating); everything
 * else opens an editor through the row.
 */
export const CellView = memo(function CellView({ item, column, values, people, compact, onToggle }) {
  const colors = useColors();
  const meta = useContext(BoardMeta);
  const v = cellValue(item, column, values);
  const s = column.settings || {};
  const key = column.system_key;

  // Columns that fill themselves or hold references.
  if (column.kind === 'formula') {
    if (v && typeof v === 'object' && v.error) {
      return <View accessibilityLabel={v.error} dataSet={{ tip: v.error }}><Ionicons name="warning-outline" size={15} color={colors.amber[600]} /></View>;
    }
    if (v === null || v === undefined || v === '') return <Empty />;
    return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800], textAlign: typeof v === 'number' ? 'right' : 'left', alignSelf: 'stretch' }}>{typeof v === 'number' ? formatNumber(v, s) : String(v)}</Text>;
  }
  if (column.kind === 'mirror') {
    return Array.isArray(v) && v.length ? <Chips chips={v.slice(0, 3).map((x, i) => ({ key: `${i}`, label: String(x) }))} /> : <Empty />;
  }
  if (column.kind === 'board_relation') {
    const titles = (v || []).map((id) => meta.linked?.[id]).filter(Boolean);
    return titles.length ? <Chips chips={titles.slice(0, 2).map((t) => ({ key: String(t.id), label: t.title }))} /> : <Empty />;
  }
  if (column.kind === 'vote') {
    const mine = (v || []).includes(meta.meId);
    return (
      <Pressable onPress={onToggle && (() => onToggle(!mine))} disabled={!onToggle} accessibilityLabel={mine ? 'Take back your vote' : 'Vote'} hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={mine ? 'thumbs-up' : 'thumbs-up-outline'} size={15} color={mine ? colors.brand[600] : colors.gray[500]} />
        <Text style={{ fontSize: 13, color: colors.gray[700] }}>{(v || []).length || ''}</Text>
      </Pressable>
    );
  }
  if (column.kind === 'files') {
    const files = (v || []).map((id) => meta.attachments?.[id]).filter(Boolean);
    if (!files.length) return <Empty />;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        <Ionicons name="attach" size={15} color={colors.gray[600]} />
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[700], flexShrink: 1 }}>{files.length === 1 ? files[0].filename : `${files.length} files`}</Text>
      </View>
    );
  }
  if (column.kind === 'world_clock') {
    const zone = v || s.timezone;
    return zone ? <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800] }}>{clockIn(zone)} <Text style={{ color: colors.gray[500], fontSize: 11 }}>{String(zone).split('/').pop().replace('_', ' ')}</Text></Text> : <Empty />;
  }
  if (column.kind === 'ai') {
    return v ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch' }}>
        <Ionicons name="sparkles-outline" size={12} color={colors.purple[600]} />
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[700], flex: 1 }}>{String(v)}</Text>
      </View>
    ) : <Empty />;
  }
  if (column.kind === 'approval') {
    const state = item.status === 'in_review' ? ['Waiting', 'orange'] : item.approved_at ? ['Approved', 'green'] : null;
    return state ? <StatusPill compact label={{ label: state[0], color: state[1] }} /> : <Empty />;
  }
  if (column.kind === 'item_type') {
    const t = { task: ['Task', 'checkbox-outline'], feature: ['Feature', 'star-outline'], bug: ['Bug', 'bug-outline'] }[item.item_type];
    return t ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name={t[1]} size={13} color={colors.gray[600]} /><Text style={{ fontSize: 13, color: colors.gray[800] }}>{t[0]}</Text></View> : <Empty />;
  }
  if (column.kind === 'time_tracking') {
    return <Ionicons name="stopwatch-outline" size={15} color={colors.gray[500]} />;
  }

  if (column.kind === 'status') return <StatusPill compact={compact} label={statusLabelOf(item, column, values)} />;
  if (column.kind === 'person') return <People ids={key ? (v ? [v] : []) : v} item={item} people={people} size={compact ? 22 : 26} />;
  if (column.kind === 'date') {
    if (key) return <DateText ymd={v} time={key === 'date' ? item.due_time : null} done={item.is_done} />;
    return v ? <DateText ymd={v.date} time={v.time} /> : <Empty />;
  }
  if (column.kind === 'timeline') {
    const [start, end] = key ? v : v ? [v.start, v.end] : [null, null];
    if (!start && !end) return <Empty />;
    return (
      <View style={{ backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12 }}>{start ? formatDue(start) : '…'} – {end ? formatDue(end) : '…'}</Text>
      </View>
    );
  }
  if (column.kind === 'priority') {
    const p = v ? PRIORITY[v] : null;
    if (!p || v === 4) return <Empty />;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="flag" size={13} color={p.color} />
        <Text style={{ fontSize: 13, color: colors.gray[800] }}>{['', 'Urgent', 'High', 'Normal'][v]}</Text>
      </View>
    );
  }
  if (v === null || v === undefined || v === '') {
    if (column.kind === 'checkbox') return <CheckBox checked={false} onPress={onToggle && (() => onToggle(true))} />;
    if (column.kind === 'rating') return <Stars value={0} max={s.max || 5} onSet={onToggle} />;
    if (key === 'item_id') return <Text style={{ fontSize: 12, color: colors.gray[500] }}>#{item.id}</Text>;
    return <Empty />;
  }
  switch (column.kind) {
    case 'dropdown':
      return <Chips chips={(v || []).map((id) => { const o = (s.options || []).find((x) => x.id === id); return o ? { key: id, label: o.label, color: o.color } : null; }).filter(Boolean)} />;
    case 'tags':
      return <Chips chips={(v || []).map((t) => ({ key: t, label: t }))} />;
    case 'numbers':
      return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800], textAlign: 'right', alignSelf: 'stretch' }}>{formatNumber(v, s)}</Text>;
    case 'checkbox':
      return <CheckBox checked onPress={onToggle && (() => onToggle(null))} />;
    case 'rating':
      return <Stars value={v} max={s.max || 5} onSet={onToggle} />;
    case 'progress':
      return (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray[200], overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, v)}%`, height: 8, backgroundColor: v >= 100 ? '#00c875' : BRAND }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.gray[600] }}>{v}%</Text>
        </View>
      );
    case 'link':
      return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.brand[600], textDecorationLine: 'underline' }}>{v.text || v.url}</Text>;
    case 'email':
    case 'phone':
      return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.brand[600] }}>{v}</Text>;
    case 'color':
      return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: paletteHex(v) }} />;
    case 'location':
      return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800] }}>{v.address}</Text>;
    case 'creation_log':
    case 'last_updated':
      return <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[600] }}>{timeAgo(v)}{key === 'created' && item.created_by_name ? ` · ${item.created_by_name}` : ''}</Text>;
    case 'auto_number':
      return <Text style={{ fontSize: 12, color: colors.gray[500] }}>#{v}</Text>;
    case 'dependency':
      return Array.isArray(v) && v.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch', paddingHorizontal: 2 }}>
          <Ionicons name="return-down-forward-outline" size={13} color={colors.gray[500]} />
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800], flex: 1 }}>{v[0].title}</Text>
          {v.length > 1 && <Text style={{ fontSize: 11, color: colors.gray[500] }}>+{v.length - 1}</Text>}
        </View>
      ) : <Empty />;
    case 'sprint':
      return <Text numberOfLines={1} style={{ fontSize: 13 }}>{item.sprint_name || ''}</Text>;
    case 'long_text':
      return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[700] }}>{String(v).split('\n')[0]}</Text>;
    default:
      return <Text numberOfLines={1} style={{ fontSize: 13, color: colors.gray[800] }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</Text>;
  }
});

function CheckBox({ checked, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} hitSlop={6}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18} color={checked ? '#00c875' : '#c3c6d4'} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------
// Editors: what opens in the popover. `onDone(value)` saves, `onClose()` cancels.
// ---------------------------------------------------------------------------------------------------

function Row({ icon, label, active, onPress, color, right }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm,
        borderRadius: radius.md, backgroundColor: active ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent',
      })}
    >
      {icon}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: color || colors.gray[800] }}>{label}</Text>
      {right}
      {active && <Ionicons name="checkmark" size={16} color={colors.brand[600]} />}
    </Pressable>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  const colors = useColors();
  return (
    <TextInput
      autoFocus
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.gray[400]}
      style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, color: colors.gray[900], marginBottom: spacing.xs, outlineStyle: 'none' }}
    />
  );
}

export function StatusEditor({ item, column, values, canManage, onPick, onEditLabels }) {
  const colors = useColors();
  const current = statusLabelOf(item, column, values);
  return (
    <View style={{ gap: 6 }}>
      {(column.labels || []).map((l) => (
        <Pressable
          key={l.id}
          onPress={() => onPick(l)}
          accessibilityLabel={l.label}
          style={({ hovered }) => ({ backgroundColor: paletteHex(l.color), borderRadius: radius.md, paddingVertical: 8, alignItems: 'center', opacity: hovered ? 0.85 : 1, borderWidth: current?.id === l.id ? 2 : 0, borderColor: colors.gray[800] })}
        >
          <Text style={{ color: paletteInk(l.color), fontSize: 14, fontWeight: '500' }}>{l.label}</Text>
        </Pressable>
      ))}
      {!column.system_key && current && (
        <Row icon={<Ionicons name="close-circle-outline" size={16} color={colors.gray[500]} />} label="Clear" onPress={() => onPick(null)} />
      )}
      {canManage && (
        <Row icon={<Ionicons name="create-outline" size={16} color={colors.gray[500]} />} label="Edit labels" onPress={onEditLabels} />
      )}
    </View>
  );
}

/** Rename, recolour, add and remove a status column's labels. */
export function LabelsEditor({ column, onUpdate, onAdd, onRemove, onBack }) {
  const colors = useColors();
  const [adding, setAdding] = useState('');
  const [stage, setStage] = useState('todo');
  const [palette, setPalette] = useState(null);
  const STAGES = [['todo', 'Not started'], ['in_progress', 'Working'], ['blocked', 'Stuck'], ['in_review', 'In review'], ['on_hold', 'On hold'], ['done', 'Done']];
  return (
    <View style={{ gap: 6 }}>
      <Row icon={<Ionicons name="chevron-back" size={16} color={colors.gray[500]} />} label="Labels" onPress={onBack} />
      {(column.labels || []).map((l) => (
        <View key={l.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable onPress={() => setPalette(palette === l.id ? null : l.id)} accessibilityLabel="Colour" style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: paletteHex(l.color) }} />
            <TextInput
              defaultValue={l.label}
              onEndEditing={(e) => { const t = e.nativeEvent.text.trim(); if (t && t !== l.label) onUpdate(l, { label: t }); }}
              onSubmitEditing={(e) => { const t = e.nativeEvent.text.trim(); if (t && t !== l.label) onUpdate(l, { label: t }); }}
              style={{ flex: 1, fontSize: 14, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4, borderWidth: 1, borderColor: colors.gray[200], color: colors.gray[900], outlineStyle: 'none' }}
            />
            {column.system_key === 'status' && <Text style={{ fontSize: 11, color: colors.gray[500], width: 64 }} numberOfLines={1}>{(STAGES.find((s) => s[0] === l.maps_to) || [])[1]}</Text>}
            <Pressable onPress={() => onRemove(l)} accessibilityLabel="Remove label" hitSlop={6}><Ionicons name="trash-outline" size={15} color={colors.gray[500]} /></Pressable>
          </View>
          {palette === l.id && <PaletteGrid value={l.color} onPick={(c) => { setPalette(null); onUpdate(l, { color: c }); }} />}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
        <TextInput
          value={adding}
          onChangeText={setAdding}
          placeholder="New label"
          placeholderTextColor={colors.gray[400]}
          onSubmitEditing={() => { if (adding.trim()) { onAdd({ label: adding.trim(), color: 'grey', maps_to: stage }); setAdding(''); } }}
          style={{ flex: 1, fontSize: 14, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4, borderWidth: 1, borderColor: colors.gray[300], color: colors.gray[900], outlineStyle: 'none' }}
        />
      </View>
      {column.system_key === 'status' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {STAGES.map(([k, l]) => (
            <Pressable key={k} onPress={() => setStage(k)} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: stage === k ? colors.brand[100] : colors.gray[100] }}>
              <Text style={{ fontSize: 11, color: colors.gray[700] }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function PaletteGrid({ value, onPick }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 6 }}>
      {PALETTE_NAMES.map((name) => (
        <Pressable key={name} onPress={() => onPick(name)} accessibilityLabel={name.replace('_', ' ')}
          style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: PALETTE[name].hex, borderWidth: value === name ? 2 : 0, borderColor: '#323338' }}
        />
      ))}
    </View>
  );
}

export function PersonEditor({ selected, multiple, candidates, onDone }) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(selected || []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return candidates.filter((p) => !s || p.name?.toLowerCase().includes(s) || p.username?.toLowerCase().includes(s)).slice(0, 40);
  }, [q, candidates]);
  const choose = (id) => {
    if (!multiple) { onDone(id === picked[0] ? null : id); return; }
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  return (
    <View>
      <SearchBox value={q} onChange={setQ} placeholder="Search names" />
      <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
        {list.map((p) => (
          <Row key={p.id} active={picked.includes(p.id)} onPress={() => choose(p.id)} label={p.name}
            icon={<Avatar name={p.name} uri={p.profile_picture} size={22} />}
            right={<Text style={{ fontSize: 12, color: colors.gray[500] }}>@{p.username}</Text>}
          />
        ))}
        {!list.length && <Text style={{ padding: spacing.sm, color: colors.gray[500] }}>Nobody matches.</Text>}
      </ScrollView>
      {multiple && (
        <Pressable onPress={() => onDone(picked.length ? picked : null)} style={{ marginTop: 6, backgroundColor: BRAND, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

export function OptionsEditor({ column, selected, onDone, onAddOption }) {
  const colors = useColors();
  const opts = column.settings?.options || [];
  const multiple = !!column.settings?.multiple;
  const [picked, setPicked] = useState(selected || []);
  const [q, setQ] = useState('');
  const shown = opts.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => {
    if (!multiple) { onDone(picked[0] === id ? null : [id]); return; }
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  return (
    <View>
      <SearchBox value={q} onChange={setQ} placeholder={onAddOption ? 'Find or add an option' : 'Find an option'} />
      <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
        {shown.map((o) => (
          <Row key={o.id} active={picked.includes(o.id)} onPress={() => toggle(o.id)} label={o.label}
            icon={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: paletteHex(o.color) }} />}
          />
        ))}
        {!!q.trim() && onAddOption && !opts.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) && (
          <Row icon={<Ionicons name="add" size={16} color={colors.brand[600]} />} label={`Add "${q.trim()}"`} color={colors.brand[600]} onPress={() => { onAddOption(q.trim()); setQ(''); }} />
        )}
      </ScrollView>
      {multiple && (
        <Pressable onPress={() => onDone(picked.length ? picked : null)} style={{ marginTop: 6, backgroundColor: BRAND, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

/** One-line or multi-line typing editor; Enter saves (Shift+Enter is a new line in long text). */
export function TextEditor({ initial, multiline, placeholder, keyboardType, onDone }) {
  const colors = useColors();
  const [text, setText] = useState(initial ?? '');
  return (
    <View style={{ gap: 6 }}>
      <TextInput
        autoFocus
        value={text}
        onChangeText={setText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        keyboardType={keyboardType}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Enter' && !(multiline && e.nativeEvent.shiftKey)) { e.preventDefault?.(); onDone(text); }
        }}
        onSubmitEditing={() => !multiline && onDone(text)}
        style={{ minHeight: multiline ? 110 : undefined, borderWidth: 1, borderColor: colors.brand[400], borderRadius: radius.md, padding: spacing.sm, fontSize: 14, color: colors.gray[900], outlineStyle: 'none', textAlignVertical: 'top' }}
      />
      <Text style={{ fontSize: 11, color: colors.gray[500] }}>{multiline ? 'Enter to save · Shift+Enter for a new line · Esc to cancel' : 'Enter to save · Esc to cancel'}</Text>
    </View>
  );
}

export function PriorityEditor({ value, onDone }) {
  const colors = useColors();
  return (
    <View>
      {[1, 2, 3, 4].map((p) => (
        <Row key={p} active={value === p} onPress={() => onDone(p)} label={['', 'Urgent', 'High', 'Normal', 'Low'][p]}
          icon={<Ionicons name="flag" size={15} color={p === 4 ? colors.gray[400] : PRIORITY[p].color} />}
        />
      ))}
    </View>
  );
}

export { canEditColumn };
