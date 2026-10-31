import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import api from '../../api/client';
import useBoards from '../../hooks/useBoards';
import Ionicons from '@expo/vector-icons/Ionicons';
import Popover from './Popover';
import { TextEditor, PaletteGrid } from './Cells';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/theme';
import { confirmDialog } from '../../utils/events';

// Column types offered in "+ Add column", in the order people reach for them. Built-in ones (a to-do field)
// are listed separately and only while the board does not show them yet.
const COMMON = ['status', 'person', 'date', 'timeline', 'text', 'numbers', 'dropdown', 'tags', 'checkbox', 'long_text',
  'formula', 'board_relation', 'mirror', 'files', 'vote', 'ai', 'link', 'email', 'phone', 'rating', 'progress', 'color',
  'location', 'country', 'hour', 'week', 'world_clock'];
const BUILT_IN = ['priority', 'deadline', 'timeline', 'estimate', 'labels', 'created', 'updated', 'item_id', 'dependency', 'sprint', 'points', 'item_type'];

function MenuRow({ icon, label, onPress, danger, sub }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
    >
      <Ionicons name={icon} size={16} color={danger ? colors.red[600] : colors.gray[600]} />
      <Text style={{ flex: 1, fontSize: 14, color: danger ? colors.red[600] : colors.gray[800] }}>{label}</Text>
      {!!sub && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{sub}</Text>}
    </Pressable>
  );
}

export function AddColumnMenu({ anchor, catalog, columns, onPick, onClose }) {
  const colors = useColors();
  if (!catalog) return null;
  const shown = new Set(columns.map((c) => c.system_key).filter(Boolean));
  const builtIns = BUILT_IN.filter((k) => catalog.system_columns[k] && !shown.has(k));
  return (
    <Popover visible anchor={anchor} onClose={onClose} width={420}>
      <ScrollView style={{ maxHeight: 460 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], padding: spacing.xs }}>COLUMN TYPES</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {COMMON.filter((k) => catalog.kinds[k]).map((k) => (
            <Pressable
              key={k}
              onPress={() => { onPick({ kind: k, title: catalog.kinds[k].label }); onClose(); }}
              style={({ hovered }) => ({ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
            >
              <Ionicons name={catalog.kinds[k].icon} size={17} color={colors.brand[600]} />
              <Text style={{ fontSize: 14, color: colors.gray[800] }}>{catalog.kinds[k].label}</Text>
            </Pressable>
          ))}
        </View>
        {builtIns.length > 0 && (
          <>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], padding: spacing.xs, marginTop: spacing.sm }}>FROM THE ITEM ITSELF</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {builtIns.map((k) => {
                const def = catalog.system_columns[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => { onPick({ system_key: k }); onClose(); }}
                    style={({ hovered }) => ({ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}
                  >
                    <Ionicons name={catalog.kinds[def.kind]?.icon || 'ellipse-outline'} size={17} color={colors.gray[600]} />
                    <Text style={{ fontSize: 14, color: colors.gray[800] }}>{def.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </Popover>
  );
}

export function ColumnMenu({ anchor, column, columns, onRename, onRemove, onMove, onToggleMobile, onSettings, onAiFillAll, aiEnabled, onClose }) {
  const [renaming, setRenaming] = useState(false);
  const [settings, setSettings] = useState(false);
  const idx = columns.findIndex((c) => c.id === column.id);
  return (
    <Popover visible anchor={anchor} onClose={onClose} width={240}>
      {settings ? (
        <ColumnSettings column={column} columns={columns} onSave={(patch) => { onSettings(patch); onClose(); }} />
      ) : renaming ? (
        <TextEditor initial={column.title} placeholder="Column name" onDone={(t) => { if (t.trim()) onRename(t.trim()); onClose(); }} />
      ) : (
        <View>
          <MenuRow icon="create-outline" label="Rename" onPress={() => setRenaming(true)} />
          {!column.system_key && <MenuRow icon="options-outline" label="Settings" onPress={() => setSettings(true)} />}
          {column.kind === 'ai' && aiEnabled && <MenuRow icon="sparkles-outline" label="Fill every item with AI" onPress={() => { onAiFillAll(); onClose(); }} />}
          {idx > 0 && <MenuRow icon="arrow-back" label="Move left" onPress={() => { onMove(-1); onClose(); }} />}
          {idx < columns.length - 1 && <MenuRow icon="arrow-forward" label="Move right" onPress={() => { onMove(1); onClose(); }} />}
          <MenuRow icon="phone-portrait-outline" label={column.settings?.show_on_mobile ? 'Hide on phone cards' : 'Show on phone cards'} onPress={() => { onToggleMobile(); onClose(); }} />
          <MenuRow
            icon="trash-outline"
            label="Remove column"
            danger
            onPress={async () => {
              onClose();
              const ok = await confirmDialog({ title: `Remove "${column.title}"?`, message: 'Its values are kept and come back if the column is restored.', confirmLabel: 'Remove', destructive: true });
              if (ok) onRemove();
            }}
          />
        </View>
      )}
    </Popover>
  );
}

const AI_ACTIONS = [['summarize', 'Summarise'], ['categorize', 'Categorise'], ['extract', 'Pull out a detail'], ['translate', 'Translate'], ['sentiment', 'Mood'], ['reply', 'Draft a reply'], ['custom', 'Your own']];

function Toggle({ on, label, onPress }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? colors.brand[600] : colors.gray[400]} />
      <Text style={{ fontSize: 14, color: colors.gray[800], flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * A column's settings: who may see / change it, whether an item needs it before it is Done, and what the
 * self-filling kinds need (formula expression, linked board, mirrored column, AI action and sources).
 */
function ColumnSettings({ column, columns, onSave }) {
  const colors = useColors();
  const { boards } = useBoards();
  const s0 = column.settings || {};
  const [s, setS] = useState(s0);
  const [targetCols, setTargetCols] = useState([]);
  const set = (patch) => setS((cur) => ({ ...cur, ...patch }));
  const relationCols = columns.filter((c) => c.kind === 'board_relation');
  const relation = relationCols.find((c) => c.id === s.relation_column_id);

  useEffect(() => {
    const boardId = relation?.settings?.board_id;
    if (column.kind !== 'mirror' || !boardId) return undefined;
    let live = true;
    api.get(`/boards/${boardId}`, { __skipOops: true }).then((r) => live && setTargetCols(r.data.columns)).catch(() => {});
    return () => { live = false; };
  }, [column.kind, relation]);

  const label = (t) => <Text style={{ fontSize: 12, fontWeight: '600', color: colors.gray[500], marginTop: 8 }}>{t}</Text>;
  const chip = (on, text, onPress, key) => (
    <Pressable key={key || text} onPress={onPress} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: on ? colors.brand[100] : colors.gray[100] }}>
      <Text style={{ fontSize: 12, color: colors.gray[800] }}>{text}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ maxHeight: 460 }}>
      {column.kind === 'formula' && (
        <>
          {label('FORMULA')}
          <TextInput
            value={s.expression || ''}
            onChangeText={(t) => set({ expression: t })}
            placeholder="{Qty} * {Rate}"
            placeholderTextColor={colors.gray[400]}
            multiline
            style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.sm, fontSize: 14, minHeight: 60, color: colors.gray[900], outlineStyle: 'none' }}
          />
          <Text style={{ fontSize: 11, color: colors.gray[500], marginTop: 4 }}>
            {'Name columns in braces. + - * /, round(x, 2), if(a, b, c), days({Start}, {Due date}), today(), addDays(d, n), upper(), contains().'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {columns.filter((c) => c.id !== column.id).map((c) => chip(false, `{${c.title}}`, () => set({ expression: `${s.expression || ''}{${c.title}}` }), c.id))}
          </View>
        </>
      )}
      {column.kind === 'board_relation' && (
        <>
          {label('LINK TO ITEMS ON')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {boards.map((b) => chip(s.board_id === b.id, b.name, () => set({ board_id: b.id }), b.id))}
          </View>
        </>
      )}
      {column.kind === 'mirror' && (
        <>
          {label('THROUGH THE LINK IN')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {relationCols.map((c) => chip(s.relation_column_id === c.id, c.title, () => set({ relation_column_id: c.id, target_column_id: undefined }), c.id))}
            {!relationCols.length && <Text style={{ fontSize: 13, color: colors.gray[500] }}>Add a Connect boards column first.</Text>}
          </View>
          {!!relation && label('SHOW THEIR')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {targetCols.map((c) => chip(s.target_column_id === c.id, c.title, () => set({ target_column_id: c.id }), c.id))}
          </View>
        </>
      )}
      {column.kind === 'ai' && (
        <>
          {label('WHAT AI DOES')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {AI_ACTIONS.map(([k, t]) => chip((s.action || 'summarize') === k, t, () => set({ action: k }), k))}
          </View>
          {label('FROM THESE COLUMNS')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {columns.filter((c) => c.id !== column.id).map((c) => {
              const on = (s.source_column_ids || []).includes(c.id);
              return chip(on, c.title, () => set({ source_column_ids: on ? s.source_column_ids.filter((x) => x !== c.id) : [...(s.source_column_ids || []), c.id] }), c.id);
            })}
          </View>
          {label('INSTRUCTION (OPTIONAL)')}
          <TextInput value={s.instruction || ''} onChangeText={(t) => set({ instruction: t })} placeholder="e.g. the invoice amount in rupees" placeholderTextColor={colors.gray[400]}
            style={{ borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, padding: spacing.sm, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
        </>
      )}
      {label('WHO')}
      <Toggle on={s.view === 'managers'} label="Only the people who run this board see it" onPress={() => set({ view: s.view === 'managers' ? 'everyone' : 'managers' })} />
      <Toggle on={s.edit === 'managers'} label="Only they can change it" onPress={() => set({ edit: s.edit === 'managers' ? 'everyone' : 'managers' })} />
      {!['formula', 'mirror', 'vote', 'ai'].includes(column.kind) && (
        <Toggle on={!!s.required} label="Needed before an item can be Done" onPress={() => set({ required: !s.required })} />
      )}
      <Pressable onPress={() => onSave(s)} style={{ marginTop: spacing.md, backgroundColor: colors.brand[600], borderRadius: radius.md, paddingVertical: 9, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

export function GroupMenu({ anchor, group, canManage, onRename, onColor, onArchive, onClose }) {
  const [stage, setStage] = useState('menu');
  return (
    <Popover visible anchor={anchor} onClose={onClose} width={260}>
      {stage === 'rename' && <TextEditor initial={group.name} placeholder="Group name" onDone={(t) => { if (t.trim()) onRename(t.trim()); onClose(); }} />}
      {stage === 'color' && <PaletteGrid value={group.color} onPick={(c) => { onColor(c); onClose(); }} />}
      {stage === 'menu' && (
        <View>
          <MenuRow icon="create-outline" label="Rename group" onPress={() => setStage('rename')} />
          <MenuRow icon="color-palette-outline" label="Change colour" onPress={() => setStage('color')} />
          {canManage && (
            <MenuRow
              icon="archive-outline"
              label="Archive group"
              onPress={async () => {
                onClose();
                const ok = await confirmDialog({ title: `Archive "${group.name}"?`, message: 'The group is hidden. Its items stay where they are and nothing is deleted.', confirmLabel: 'Archive' });
                if (ok) onArchive();
              }}
            />
          )}
        </View>
      )}
    </Popover>
  );
}
