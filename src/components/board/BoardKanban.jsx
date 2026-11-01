import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { statusLabelOf, paletteHex, paletteInk } from './model';
import { makeDraggable } from '../../hooks/useWebReorder';
import { mayEdit } from './CellEditorHost';
import Popover, { anchorOf } from './Popover';
import { PaletteGrid, CellView } from './Cells';
import { showToast, confirmDialog } from '../../utils/events';
import api from '../../api/client';
import { Avatar } from '../kit';

const DROP_OUTLINE = '2px dashed #0073ea';

function IconBtn({ icon, label, onPress, active, count }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress} accessibilityLabel={label} hitSlop={4}
      style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: active ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}
    >
      <Ionicons name={icon} size={14} color={active ? BRAND : colors.gray[500]} />
      {count !== undefined && <Text style={{ fontSize: 12, color: active ? BRAND : colors.gray[600] }}>{count}</Text>}
    </Pressable>
  );
}

/** A line you type into and press Enter, again and again: "+ Add task" / "+ Add subitem". Nothing pops up. */
function AddLine({ placeholder, onAdd, autoFocus, indent = 0 }) {
  const colors = useColors();
  const [text, setText] = useState('');
  return (
    <TextInput
      value={text} onChangeText={setText} autoFocus={autoFocus} placeholder={placeholder} placeholderTextColor={colors.gray[400]}
      accessibilityLabel={placeholder}
      onSubmitEditing={() => { if (text.trim()) { onAdd(text.trim()); setText(''); } }} blurOnSubmit={false}
      style={{ height: 30, paddingHorizontal: 8, marginLeft: indent, fontSize: 13, color: colors.gray[900], outlineStyle: 'none', borderRadius: radius.sm }}
    />
  );
}

/**
 * One card: click the title to type in it, the chat icon opens its updates, the sub-item icon opens its
 * sub-items right under it (with an add line), and "..." has the rest. The expand icon opens the side panel.
 */
function KanbanCard({ item, board, people, statusCol, lanes, actions, onOpenItem, canAdd, subs, openSubs, toggleSubs, groupId }) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(null); // { anchor, stage }
  const editable = mayEdit(item);
  const done = subs.filter((s) => s.is_done).length;
  const personCol = board.columns.find((c) => c.kind === 'person');
  const dateCol = board.columns.find((c) => c.system_key === 'date');
  const save = (e) => {
    const v = (e.nativeEvent?.text ?? '').trim();
    setEditing(false);
    if (v && v !== item.title) actions.updateFields(item, { title: v });
  };
  const copy = async (text, done_) => {
    try { await navigator.clipboard.writeText(text); showToast({ message: done_, tone: 'success', icon: 'copy' }); } catch { showToast({ message: 'Could not copy', tone: 'error' }); }
  };
  return (
    <View>
      <View style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[200], padding: spacing.sm, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          {editing && editable ? (
            <TextInput
              autoFocus selectTextOnFocus defaultValue={item.title} onBlur={save} onSubmitEditing={save}
              onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') setEditing(false); }}
              style={{ flex: 1, fontSize: 14, color: colors.gray[900], borderWidth: 2, borderColor: BRAND, borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2, outlineStyle: 'none' }}
            />
          ) : (
            <Pressable onPress={() => (editable ? setEditing(true) : onOpenItem(item.id))} style={{ flex: 1, cursor: editable ? 'text' : 'pointer' }}>
              <Text style={{ fontSize: 14, color: item.is_done ? colors.gray[400] : colors.gray[900], textDecorationLine: item.is_done ? 'line-through' : 'none' }}>{item.title}</Text>
            </Pressable>
          )}
          <IconBtn icon="expand-outline" label={`Open ${item.title}`} onPress={() => onOpenItem(item.id)} />
          <IconBtn icon="ellipsis-horizontal" label="Task menu" onPress={(e) => setMenu({ anchor: anchorOf(e), stage: 'main' })} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {dateCol && item.due_date ? <CellView item={item} column={dateCol} values={board.values} people={people} compact /> : null}
          <View style={{ flex: 1 }} />
          {personCol && (item.assignee_id ? <Avatar name={item.assignee_name || 'Someone'} size={20} /> : null)}
          <IconBtn icon={item.comment_count > 0 ? 'chatbubble' : 'chatbubble-outline'} label="Updates" count={item.comment_count || 0} active={item.comment_count > 0} onPress={() => onOpenItem(item.id, 'updates')} />
          <IconBtn icon="git-branch-outline" label="Sub-items" count={subs.length ? `${done}/${subs.length}` : 0} active={openSubs} onPress={toggleSubs} />
        </View>
      </View>
      {openSubs && (
        <View style={{ marginLeft: 12, marginTop: 4, paddingLeft: 8, borderLeftWidth: 2, borderColor: BRAND, gap: 2 }}>
          {subs.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
              <Pressable onPress={() => mayEdit(s) && actions.setStatus(s, s.is_done ? 'todo' : 'done')} hitSlop={4}>
                <Ionicons name={s.is_done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={s.is_done ? colors.green[600] : colors.gray[400]} />
              </Pressable>
              <Pressable onPress={() => onOpenItem(s.id)} style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, color: s.is_done ? colors.gray[400] : colors.gray[800], textDecorationLine: s.is_done ? 'line-through' : 'none' }}>{s.title}</Text>
              </Pressable>
            </View>
          ))}
          {canAdd && <AddLine autoFocus={!subs.length} placeholder="+ Add subitem" onAdd={(t) => actions.addItem(t, { groupId, parentId: item.id })} />}
        </View>
      )}
      {menu && (
        <Popover visible anchor={menu.anchor} onClose={() => setMenu(null)} width={230}>
          {menu.stage === 'move' ? lanes.map((l) => (
            <MenuItem key={l.label.id} label={l.label.label} color={l.label.color} onPress={() => { setMenu(null); actions.moveToLane(item, l.label); }} />
          )) : (
            <>
              <MenuItem icon="expand-outline" label="Open task" onPress={() => { setMenu(null); onOpenItem(item.id); }} />
              {editable && <MenuItem icon="arrow-forward-outline" label="Move to" more onPress={() => setMenu({ ...menu, stage: 'move' })} />}
              {canAdd && <MenuItem icon="copy-outline" label="Duplicate" onPress={() => { setMenu(null); actions.duplicate(item); }} />}
              <MenuItem icon="text-outline" label="Copy name" onPress={() => { setMenu(null); copy(item.title, 'Name copied'); }} />
              <MenuItem icon="link-outline" label="Copy task link" onPress={() => { setMenu(null); copy(`${typeof window !== 'undefined' ? window.location.origin : ''}/?task=${item.id}`, 'Link copied'); }} />
              {canAdd && <MenuItem icon="git-branch-outline" label="Add subitem" onPress={() => { setMenu(null); if (!openSubs) toggleSubs(); }} />}
              {item.permissions?.can_delete && (
                <MenuItem icon="trash-outline" label="Delete" danger onPress={async () => {
                  setMenu(null);
                  const ok = await confirmDialog({ title: `Delete "${item.title}"?`, message: 'It goes to the recycle bin for 90 days.', confirmLabel: 'Delete', destructive: true });
                  if (ok) actions.remove(item);
                }} />
              )}
            </>
          )}
        </Popover>
      )}
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, more, color }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
      {!!icon && <Ionicons name={icon} size={16} color={danger ? colors.red[600] : colors.gray[600]} />}
      {!!color && <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: paletteHex(color) }} />}
      <Text style={{ flex: 1, fontSize: 14, color: danger ? colors.red[600] : colors.gray[900] }}>{label}</Text>
      {more && <Ionicons name="chevron-forward" size={14} color={colors.gray[500]} />}
    </Pressable>
  );
}

/**
 * Kanban: one column per label of the board's status column (top-level tasks only). Drag a card into another
 * column to change its status; drag a column by its title to put the columns in another order; click a column
 * title or a card title to type in it; "+ Add task" and "+ Add subitem" add right there.
 */
export default function BoardKanban({ board, items, people, onOpenItem, onMove, onSetValue, actions, canAdd, canManage }) {
  const colors = useColors();
  const rootRef = useRef(null);
  const [subsOpen, setSubsOpen] = useState(() => new Set());
  const [renaming, setRenaming] = useState(null); // label id
  const [laneMenu, setLaneMenu] = useState(null); // { anchor, label, stage }
  const [adding, setAdding] = useState(null); // label id whose add line is focused
  const statusCol = board.columns.find((c) => c.system_key === 'status') || board.columns.find((c) => c.kind === 'status');
  const lanes = useMemo(() => {
    if (!statusCol) return [];
    const top = items.filter((t) => !t.parent_id);
    return (statusCol.labels || []).map((l) => ({ label: l, items: top.filter((t) => statusLabelOf(t, statusCol, board.values)?.id === l.id) }));
  }, [items, statusCol, board.values]);
  const subsOf = useMemo(() => {
    const m = new Map();
    for (const t of board.items) if (t.parent_id) { if (!m.has(t.parent_id)) m.set(t.parent_id, []); m.get(t.parent_id).push(t); }
    return m;
  }, [board.items]);
  const firstGroup = board.groups[0]?.id ?? null;
  const total = lanes.reduce((n, l) => n + l.items.length, 0);

  const moveToLane = async (item, label) => {
    if (statusCol.system_key === 'status') onMove?.(item, label.maps_to); else onSetValue?.(item, statusCol, { label_id: label.id });
  };
  const kanbanActions = useMemo(() => ({
    ...actions,
    moveToLane,
    duplicate: async (item) => {
      const made = await actions.addItem(`${item.title} (copy)`, { groupId: item.business_section_id ?? firstGroup });
      const l = statusCol && statusLabelOf(item, statusCol, board.values);
      if (made && l) moveToLane(made, l);
    },
    remove: async (item) => {
      try { await api.delete(`/todos/${item.id}`); showToast({ message: 'Deleted', icon: 'trash' }); actions.reload(); } catch (e) { showToast({ message: e?.response?.data?.error || 'Could not delete', tone: 'error' }); }
    },
  }), [actions, statusCol, board.values, firstGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToLane = async (title, label) => {
    const made = await actions.addItem(title, { groupId: firstGroup });
    if (made && label && !(statusCol.system_key === 'status' && label.maps_to === 'todo')) moveToLane(made, label);
  };

  // Latest data for the DOM listeners, which are attached once.
  const live = useRef({});
  live.current = { statusCol, items, onMove, onSetValue, lanes, actions, canManage };

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;
    let dragId = null;
    let dragLane = null;
    let hover = null;
    const cardOf = (el) => (el && el.closest ? el.closest('[data-board-card]') : null);
    const colOf = (el) => (el && el.closest ? el.closest('[data-board-col]') : null);
    const handleOf = (el) => (el && el.closest ? el.closest('[data-lane-handle]') : null);
    const clear = () => { if (hover) { hover.style.outline = ''; hover.style.outlineOffset = ''; } hover = null; };
    const onDragStart = (e) => {
      const h = handleOf(e.target);
      if (h) {
        dragLane = h.dataset.laneHandle;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `lane:${dragLane}`);
        return;
      }
      const card = cardOf(e.target);
      if (!card) return;
      dragId = Number(card.dataset.boardCard);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
      card.style.opacity = '0.45';
    };
    const onDragOver = (e) => {
      if (dragId == null && dragLane == null) return;
      const col = colOf(e.target);
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (hover !== col) { clear(); hover = col; col.style.outline = DROP_OUTLINE; col.style.outlineOffset = '-2px'; }
    };
    const onDrop = (e) => {
      const col = colOf(e.target);
      clear();
      if (!col) { dragId = null; dragLane = null; return; }
      e.preventDefault();
      const { statusCol: sc, items: all, onMove: move, onSetValue: setValue, lanes: ls, actions: act } = live.current;
      if (dragLane != null) {
        const from = dragLane;
        dragLane = null;
        const to = col.dataset.boardCol;
        if (from === to) return;
        const ids = ls.map((l) => String(l.label.id)).filter((x) => x !== from);
        ids.splice(ids.indexOf(to), 0, from);
        act.orderLabels?.(sc, ids.map(Number));
        return;
      }
      if (dragId == null) return;
      const item = all.find((t) => t.id === dragId);
      const lane = ls.find((l) => String(l.label.id) === col.dataset.boardCol);
      dragId = null;
      if (!item || !lane || !sc) return;
      if (lane.items.some((t) => t.id === item.id)) return; // dropped where it already is
      if (!mayEdit(item, sc)) return;
      if (sc.system_key === 'status') move?.(item, lane.label.maps_to);
      else setValue?.(item, sc, { label_id: lane.label.id });
    };
    const onDragEnd = (e) => {
      const card = cardOf(e.target);
      if (card) card.style.opacity = '';
      clear();
      dragId = null;
      dragLane = null;
    };
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);
    return () => {
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  if (!statusCol) {
    return <Text style={{ padding: spacing.xl, color: colors.gray[600] }}>Add a Status column to see this board as a Kanban.</Text>;
  }

  const toggleSubs = (id) => setSubsOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <View ref={rootRef} style={{ flex: 1 }}>
      {/* The strip: every column's share of the work, in its own colour. */}
      {total > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
          <View accessibilityLabel={lanes.map((l) => `${l.label.label}: ${l.items.length}`).join(', ')} style={{ flexDirection: 'row', width: 150, height: 14, borderRadius: 3, overflow: 'hidden' }}>
            {lanes.filter((l) => l.items.length).map((l) => <View key={l.label.id} style={{ flex: l.items.length, backgroundColor: paletteHex(l.label.color) }} />)}
          </View>
        </View>
      )}
      <ScrollView horizontal contentContainerStyle={{ padding: spacing.md, gap: spacing.md, alignItems: 'flex-start' }} style={{ flex: 1 }}>
        {lanes.map(({ label, items: laneItems }) => (
          <View
            key={label.id}
            dataSet={{ boardCol: String(label.id) }}
            style={{ width: 290, backgroundColor: colors.gray[100], borderRadius: radius.md, overflow: 'hidden', maxHeight: '100%' }}
          >
            <View
              ref={canManage ? makeDraggable : undefined} dataSet={{ laneHandle: String(label.id) }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: paletteHex(label.color), paddingHorizontal: spacing.sm, height: 34 }}
            >
              {renaming === label.id ? (
                <TextInput
                  autoFocus selectTextOnFocus defaultValue={label.label}
                  onBlur={(e) => { const v = (e.nativeEvent?.text ?? '').trim(); setRenaming(null); if (v && v !== label.label) actions.updateLabel(statusCol, label, { label: v }); }}
                  onSubmitEditing={(e) => { const v = (e.nativeEvent?.text ?? '').trim(); setRenaming(null); if (v && v !== label.label) actions.updateLabel(statusCol, label, { label: v }); }}
                  style={{ flex: 1, height: 26, paddingHorizontal: 4, fontSize: 14, fontWeight: '600', color: '#1f1f1f', backgroundColor: '#fff', borderRadius: 2, outlineStyle: 'none' }}
                />
              ) : (
                <Pressable onPress={() => canManage && setRenaming(label.id)} style={{ flexShrink: 1, cursor: canManage ? 'text' : 'default' }}>
                  <Text numberOfLines={1} style={{ color: paletteInk(label.color), fontWeight: '600', fontSize: 14 }}>{label.label}</Text>
                </Pressable>
              )}
              <Text style={{ color: paletteInk(label.color), fontSize: 13 }}>{laneItems.length}</Text>
              <View style={{ flex: 1 }} />
              {canManage && (
                <Pressable onPress={(e) => setLaneMenu({ anchor: anchorOf(e), label, stage: 'main' })} hitSlop={6} accessibilityLabel="Column menu"><Ionicons name="ellipsis-horizontal" size={16} color={paletteInk(label.color)} /></Pressable>
              )}
              {canAdd && <Pressable onPress={() => setAdding(label.id)} hitSlop={6} accessibilityLabel={`Add a task to ${label.label}`}><Ionicons name="add" size={18} color={paletteInk(label.color)} /></Pressable>}
            </View>
            <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ gap: spacing.sm, padding: spacing.sm, minHeight: 80 }}>
              {laneItems.map((t) => (
                <View key={t.id} ref={mayEdit(t, statusCol) ? makeDraggable : undefined} dataSet={{ boardCard: String(t.id) }}>
                  <KanbanCard
                    item={t} board={board} people={people} statusCol={statusCol} lanes={lanes} actions={kanbanActions}
                    onOpenItem={onOpenItem} canAdd={canAdd} subs={subsOf.get(t.id) || []} groupId={t.business_section_id ?? firstGroup}
                    openSubs={subsOpen.has(t.id)} toggleSubs={() => toggleSubs(t.id)}
                  />
                </View>
              ))}
              {canAdd && <AddLine placeholder="+ Add task" autoFocus={adding === label.id} onAdd={(title) => addToLane(title, label)} />}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
      {laneMenu && (
        <Popover visible anchor={laneMenu.anchor} onClose={() => setLaneMenu(null)} width={240}>
          {laneMenu.stage === 'color' ? (
            <PaletteGrid value={laneMenu.label.color} onPick={(c) => { actions.updateLabel(statusCol, laneMenu.label, { color: c }); setLaneMenu(null); }} />
          ) : (
            <>
              <MenuItem icon="create-outline" label="Rename" onPress={() => { setRenaming(laneMenu.label.id); setLaneMenu(null); }} />
              <MenuItem icon="color-palette-outline" label="Change colour" onPress={() => setLaneMenu({ ...laneMenu, stage: 'color' })} />
              <MenuItem icon="add" label="Add a task here" onPress={() => { setAdding(laneMenu.label.id); setLaneMenu(null); }} />
            </>
          )}
        </Popover>
      )}
    </View>
  );
}
