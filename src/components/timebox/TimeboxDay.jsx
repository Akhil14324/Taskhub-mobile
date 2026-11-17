import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { glass } from '../../theme/glass';
import useIsDesktop from '../../hooks/useBreakpoint';
import useTimeboxDnd, { makeDraggable } from '../../hooks/useTimeboxDnd';
import { Avatar } from '../kit';
import { formatTime, formatDue, todayYmd, addDays, toYmd } from '../../utils/dates';
import { showToast, confirmDialog } from '../../utils/events';
import { getItemAsync, setItemAsync } from '../../utils/secureStorage';
import { paletteHex, paletteInk } from '../board/model';
import DayReportSheet from './DayReportSheet';
import {
  STEP, MAX_PRIORITIES, PRIORITY_COLORS, toMin, toHM, rangeOf, addBlock, firstFree, resize, summarize, hours, nowMin,
  moveBlock, maxEnd, setEnd, slotMinutes,
} from './model';

const isWeb = Platform.OS === 'web';
/** Marks something as draggable onto the schedule (web). */
const dragProps = (payload) => (isWeb ? { ref: makeDraggable, dataSet: { tbDrag: JSON.stringify(payload) } } : {});

const SLOT_H = 40;
const noOutline = Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

function Card({ title, icon, right, children, style }) {
  const colors = useColors();
  return (
    <View {...glass('card')} style={[{ backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.gray[200] }}>
        <Ionicons name={icon} size={17} color={colors.gray[700]} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function IconBtn({ icon, label, onPress, color, active }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ hovered }) => ({ padding: 5, borderRadius: radius.sm, backgroundColor: active ? colors.brand[50] : hovered ? colors.gray[100] : 'transparent' })}
    >
      <Ionicons name={icon} size={16} color={color || (active ? BRAND : colors.gray[500])} />
    </Pressable>
  );
}

/** Done / not done / not marked yet, one tap each. */
function DoneMark({ value, onPress, disabled }) {
  const colors = useColors();
  const look = value === true ? ['checkmark-circle', colors.green[600], 'Done']
    : value === false ? ['close-circle', colors.red[600], 'Not done'] : ['ellipse-outline', colors.gray[400], 'Mark it'];
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityLabel={look[2]} hitSlop={6} style={{ padding: 2 }}>
      <Ionicons name={look[0]} size={20} color={look[1]} />
    </Pressable>
  );
}

/**
 * Puts something that only lives in the timebox into the real to-do list (the Inbox, or the day and time when it has
 * a block) and links it, so it is never added twice. `build` says what to write back once the id is known.
 */
function useAddToTodo() {
  const { createTodo } = useTodos();
  return useCallback(async (payload, onLinked) => {
    try {
      await createTodo(payload, { onId: (id) => { if (id) onLinked(id); } });
    } catch {
      showToast({ message: 'Could not add it to your to-dos', tone: 'error', icon: 'alert-circle-outline' });
    }
  }, [createTodo]);
}

function AddToTodoBtn({ onPress }) {
  return <IconBtn icon="download-outline" label="Add to my to-dos" onPress={onPress} />;
}

function TopThree({ box, update, readOnly, onPlace, placing }) {
  const colors = useColors();
  const addToTodo = useAddToTodo();
  const set = (i, fields) => update((b) => {
    const list = [...b.priorities];
    while (list.length <= i) list.push({ text: '', done: false, todo_id: null });
    list[i] = { ...list[i], ...fields };
    // Ticking a top priority ticks the schedule blocks that serve it (and unticking clears a tick, never a "not done").
    const blocks = 'done' in fields
      ? b.blocks.map((x) => (x.priority === i ? { ...x, done: fields.done ? true : x.done === true ? null : x.done } : x))
      : b.blocks;
    return { ...b, priorities: list, blocks };
  });
  const rows = readOnly ? box.priorities : Array.from({ length: MAX_PRIORITIES }, (_, i) => box.priorities[i] || { text: '', done: false });
  return (
    <Card title="Top 3" icon="star-outline" right={<Text style={{ fontSize: 12, color: colors.gray[500] }}>What must get done today</Text>}>
      {!rows.length && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>No priorities were written.</Text>}
      {rows.map((p, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: colors.gray[100] }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: paletteHex(PRIORITY_COLORS[i]), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: paletteInk(PRIORITY_COLORS[i]) }}>{i + 1}</Text>
          </View>
          {readOnly ? (
            <Text style={{ flex: 1, fontSize: 15, color: colors.gray[900], textDecorationLine: p.done ? 'line-through' : 'none' }}>{p.text}</Text>
          ) : (
            <TextInput
              value={p.text}
              onChangeText={(t) => set(i, { text: t })}
              placeholder={['The one thing that matters most', 'Second', 'Third'][i]}
              placeholderTextColor={colors.gray[400]}
              style={[{ flex: 1, fontSize: 15, color: colors.gray[900], paddingVertical: 4, textDecorationLine: p.done ? 'line-through' : 'none' }, noOutline]}
            />
          )}
          {!readOnly && !!p.text && isWeb && (
            <View {...dragProps({ kind: 'task', text: p.text, priority: i, todo_id: p.todo_id || null, minutes: 60 })} style={{ cursor: 'grab', padding: 4 }}>
              <Ionicons name="reorder-two-outline" size={18} color={colors.gray[400]} />
            </View>
          )}
          {!readOnly && !!p.text && <IconBtn icon="time-outline" label="Give it a time" active={placing?.priority === i} onPress={() => onPlace({ text: p.text, priority: i, todo_id: p.todo_id || null, minutes: 60 })} />}
          {!readOnly && !!p.text && !p.todo_id && (
            <AddToTodoBtn onPress={() => addToTodo({ title: p.text }, (id) => set(i, { todo_id: id }))} />
          )}
          <Pressable onPress={readOnly || !p.text ? undefined : () => set(i, { done: !p.done })} accessibilityLabel={p.done ? 'Done' : 'Not done yet'} hitSlop={6}>
            <Ionicons name={p.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={p.done ? colors.green[600] : colors.gray[400]} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

function BrainDump({ box, update, readOnly, onPlace, placing }) {
  const colors = useColors();
  const addToTodo = useAddToTodo();
  const [draft, setDraft] = useState('');
  const [showWork, setShowWork] = useState(false);
  const [q, setQ] = useState('');
  const { user } = useAuth();
  const { todos } = useTodos();
  const add = (item) => update((b) => ({ ...b, brain_dump: [...b.brain_dump, { done: false, todo_id: null, ...item }] }));
  const edit = (i, fields) => update((b) => ({ ...b, brain_dump: b.brain_dump.map((x, j) => (j === i ? { ...x, ...fields } : x)) }));
  const remove = (i) => update((b) => ({ ...b, brain_dump: b.brain_dump.filter((_, j) => j !== i) }));
  const promote = (i) => update((b) => {
    const item = b.brain_dump[i];
    const list = b.priorities.filter((p) => p.text);
    if (list.length >= MAX_PRIORITIES) return b;
    return { ...b, priorities: [...list, { text: item.text, todo_id: item.todo_id, done: false }], brain_dump: b.brain_dump.filter((_, j) => j !== i) };
  });
  const full = box.priorities.filter((p) => p.text).length >= MAX_PRIORITIES;

  // Everything open that is mine, not just today: overdue first, then by date, undated last. Sub-tasks show
  // under the name of their parent.
  const today = todayYmd();
  const since = addDays(today, -3); // finished tasks stay pickable for three days
  const allWork = useMemo(() => {
    if (!showWork) return [];
    const byId = new Map(todos.map((t) => [t.id, t]));
    const doneDay = (t) => (t.done_at ? toYmd(new Date(t.done_at)) : '0000-00-00');
    const mine = (t) => (t.assignee_id ? t.assignee_id === user?.id : t.created_by === user?.id || (t.members || []).some((m) => m.id === user?.id));
    return todos
      .filter((t) => mine(t) && t.review_state !== 'rejected' && (t.is_done ? doneDay(t) >= since : true))
      .map((t) => ({ ...t, parentTitle: t.parent_id ? byId.get(t.parent_id)?.title : null, doneDay: t.is_done ? doneDay(t) : null }))
      .sort((a, b) => {
        // Open work first (overdue, then by date, undated last); finished work after it, newest first.
        if (!!a.is_done !== !!b.is_done) return a.is_done ? 1 : -1;
        if (a.is_done) return a.doneDay < b.doneDay ? 1 : a.doneDay > b.doneDay ? -1 : 0;
        const ad = a.due_date || a.deadline_date || '9999-12-31';
        const bd = b.due_date || b.deadline_date || '9999-12-31';
        return ad < bd ? -1 : ad > bd ? 1 : (a.priority ?? 4) - (b.priority ?? 4);
      });
  }, [showWork, todos, user, since]);
  const work = useMemo(() => {
    const seen = new Set([...box.brain_dump, ...box.priorities, ...box.blocks].map((x) => x.todo_id).filter(Boolean));
    const s = q.trim().toLowerCase();
    return allWork.filter((t) => !seen.has(t.id) && (!s || t.title.toLowerCase().includes(s) || (t.business_name || '').toLowerCase().includes(s)));
  }, [allWork, box.brain_dump, box.priorities, box.blocks, q]);

  return (
    <Card
      title="Brain dump"
      icon="cloud-outline"
      right={!readOnly && (
        <Pressable onPress={() => setShowWork((s) => !s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={showWork ? 'chevron-up' : 'briefcase-outline'} size={14} color={BRAND} />
          <Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>{showWork ? 'Hide' : 'From my work'}</Text>
        </Pressable>
      )}
    >
      {showWork && (
        <View style={{ backgroundColor: colors.gray[50], borderBottomWidth: 1, borderColor: colors.gray[200], paddingVertical: 4 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={`Search ${allWork.length} tasks (open, and finished in the last 3 days)`}
            placeholderTextColor={colors.gray[400]}
            style={[{ marginHorizontal: spacing.md, marginVertical: 4, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: 14, color: colors.gray[900], backgroundColor: colors.white }, noOutline]}
          />
          {isWeb && !!work.length && <Text style={{ fontSize: 12, color: colors.gray[500], paddingHorizontal: spacing.md, paddingBottom: 2 }}>Drag a task onto the schedule, or tap it to put it in your brain dump. Finished tasks from the last 3 days are included.</Text>}
          <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
            {!work.length && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>{allWork.length ? 'Nothing matches.' : 'Nothing open or finished recently.'}</Text>}
            {work.map((t) => {
              const late = !t.is_done && t.due_date && t.due_date < today;
              const doneLabel = t.is_done ? (t.doneDay === today ? 'Done today' : t.doneDay === addDays(today, -1) ? 'Done yesterday' : `Done ${formatDue(t.doneDay)}`) : null;
              return (
                <View key={t.id} {...dragProps({ kind: 'task', text: t.title, todo_id: t.id, minutes: slotMinutes(t.duration_minutes) })} style={{ cursor: isWeb ? 'grab' : 'auto' }}>
                  <Pressable onPress={() => add({ text: t.title, todo_id: t.id })} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
                    <Ionicons name={t.is_done ? 'checkmark-circle' : 'add'} size={16} color={t.is_done ? colors.green[600] : BRAND} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, color: colors.gray[800] }}>{t.title}</Text>
                      {!!t.parentTitle && <Text numberOfLines={1} style={{ fontSize: 11, color: colors.gray[500] }}>in {t.parentTitle}</Text>}
                    </View>
                    <Text style={{ fontSize: 12, color: late ? colors.red[600] : colors.gray[500] }}>{doneLabel || (t.due_date ? `${late ? 'Overdue · ' : ''}${formatDue(t.due_date)}` : 'No date')}</Text>
                    <Text style={{ fontSize: 12, color: colors.gray[400], maxWidth: 90 }} numberOfLines={1}>{t.business_name || 'Personal'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
      {!box.brain_dump.length && readOnly && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>Nothing here.</Text>}
      {box.brain_dump.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.gray[100] }}>
          <Pressable onPress={readOnly ? undefined : () => edit(i, { done: !item.done })} hitSlop={6}>
            <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={18} color={item.done ? colors.green[600] : colors.gray[400]} />
          </Pressable>
          {readOnly ? (
            <Text style={{ flex: 1, fontSize: 14, color: colors.gray[800], textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.text}</Text>
          ) : (
            <TextInput value={item.text} onChangeText={(t) => edit(i, { text: t })} style={[{ flex: 1, fontSize: 14, color: colors.gray[800], paddingVertical: 2, textDecorationLine: item.done ? 'line-through' : 'none' }, noOutline]} />
          )}
          {!!item.todo_id && <Ionicons name="link-outline" size={14} color={colors.gray[400]} />}
          {!readOnly && isWeb && !!item.text && (
            <View {...dragProps({ kind: 'task', text: item.text, todo_id: item.todo_id || null, minutes: 60 })} style={{ cursor: 'grab', padding: 4 }}>
              <Ionicons name="reorder-two-outline" size={18} color={colors.gray[400]} />
            </View>
          )}
          {!readOnly && !item.todo_id && !!item.text && <AddToTodoBtn onPress={() => addToTodo({ title: item.text }, (id) => edit(i, { todo_id: id }))} />}
          {!readOnly && !full && <IconBtn icon="star-outline" label="Make it a top priority" onPress={() => promote(i)} />}
          {!readOnly && <IconBtn icon="time-outline" label="Give it a time" active={placing?.dump === i} onPress={() => onPlace({ text: item.text, todo_id: item.todo_id || null, dump: i })} />}
          {!readOnly && <IconBtn icon="close" label="Remove" onPress={() => remove(i)} />}
        </View>
      ))}
      {!readOnly && (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => { if (draft.trim()) { add({ text: draft.trim() }); setDraft(''); } }}
          blurOnSubmit={false}
          placeholder="Everything on your mind. Press Enter after each."
          placeholderTextColor={colors.gray[400]}
          style={[{ fontSize: 14, color: colors.gray[900], paddingHorizontal: spacing.md, paddingVertical: 10 }, noOutline]}
        />
      )}
    </Card>
  );
}

function Block({ block, index, blocks, readOnly, canMark, selected, onSelect, update, onOpenTodo, autoFocus, top, onAddToTodo }) {
  const colors = useColors();
  // While the bottom edge is being pulled, the block shows the length it would get; it is saved on release.
  const [draftEnd, setDraftEnd] = useState(null);
  const endMin = draftEnd ?? toMin(block.end);
  const startMin = toMin(block.start);
  const slots = (endMin - startMin) / STEP;
  const live = useRef(null);
  live.current = { block, index, blocks, update };
  const grip = useCallback((node) => {
    if (!node || !isWeb) return;
    node.style.touchAction = 'none';
    node.onclick = (e) => e.stopPropagation();
    node.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { block: b, index: i, blocks: all } = live.current;
      const startY = e.clientY;
      const from = toMin(b.end);
      const lo = toMin(b.start) + STEP;
      const hi = maxEnd(all, i);
      let cur = from;
      const move = (ev) => {
        const next = Math.min(hi, Math.max(lo, from + Math.round((ev.clientY - startY) / SLOT_H) * STEP));
        if (next !== cur) { cur = next; setDraftEnd(next); }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setDraftEnd(null);
        if (cur !== from) live.current.update((bx) => ({ ...bx, blocks: setEnd(bx.blocks, live.current.index, cur) }));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
  }, []);
  const color = block.priority !== null && block.priority !== undefined ? PRIORITY_COLORS[block.priority] : null;
  // A block that serves a top priority and that priority are one thing: ticking one ticks the other, and giving a
  // block "Top 2" fills Top 2 with it when that line is still empty.
  const set = (fields) => update((b) => {
    const blocksNext = b.blocks.map((x, i) => (i === index ? { ...x, ...fields } : x));
    const cur = blocksNext[index];
    const p = cur.priority;
    let priorities = b.priorities;
    if (p !== null && p !== undefined && p < MAX_PRIORITIES && ('done' in fields || 'priority' in fields)) {
      priorities = [...b.priorities];
      while (priorities.length <= p) priorities.push({ text: '', done: false, todo_id: null });
      const line = priorities[p];
      if (!line.text && cur.text) priorities[p] = { text: cur.text, todo_id: cur.todo_id || null, done: cur.done === true };
      else if ('done' in fields) priorities[p] = { ...line, done: cur.done === true };
    }
    return { ...b, blocks: blocksNext, priorities };
  });
  // A selected block grows to hold its controls (a 30 minute block is too short for them); it shrinks back when deselected.
  const showTools = selected && !readOnly;
  const cycle = () => set({ done: block.done === null || block.done === undefined ? true : block.done === true ? false : null });
  return (
    <Pressable
      dataSet={{ tbRow: "1" }}
      onPress={() => onSelect(selected ? null : index)}
      style={[{ position: 'absolute', left: 0, right: 0, top, zIndex: selected || draftEnd !== null ? 5 : 1, flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: selected ? BRAND : colors.gray[200], backgroundColor: block.done === true ? colors.green[50] : colors.white }, showTools ? { minHeight: slots * SLOT_H - 4 } : { height: slots * SLOT_H - 4 }]}
    >
      {!readOnly && isWeb ? (
        // The handle: drag the whole block to another time.
        <View {...dragProps({ kind: 'block', index })} accessibilityLabel="Drag to another time" style={{ width: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color ? paletteHex(color) : colors.gray[300], cursor: 'grab' }}>
          <Ionicons name="reorder-two-outline" size={14} color={color ? paletteInk(color) : colors.gray[600]} />
        </View>
      ) : (
        <View style={{ width: 5, backgroundColor: color ? paletteHex(color) : colors.gray[300] }} />
      )}
      <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4, justifyContent: slots > 1 || showTools ? 'flex-start' : 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {readOnly ? (
            <Text numberOfLines={slots > 1 ? 3 : 1} style={{ flex: 1, fontSize: 14, color: colors.gray[900], textDecorationLine: block.done === false ? 'line-through' : 'none' }}>{block.text || 'Untitled block'}</Text>
          ) : (
            <TextInput
              value={block.text}
              autoFocus={autoFocus}
              onFocus={() => onSelect(index)}
              onChangeText={(t) => set({ text: t })}
              placeholder="What will you do?"
              placeholderTextColor={colors.gray[400]}
              style={[{ flex: 1, fontSize: 14, color: colors.gray[900], paddingVertical: 2 }, noOutline]}
            />
          )}
          {!readOnly && !block.todo_id && !!block.text && <IconBtn icon="download-outline" label="Add to my to-dos" onPress={() => onAddToTodo(index)} />}
          {!!block.todo_id && <IconBtn icon="open-outline" label="Open the to-do" onPress={() => onOpenTodo(block.todo_id)} />}
          {canMark && <DoneMark value={block.done} onPress={cycle} disabled={readOnly} />}
        </View>
        {(slots > 1 || draftEnd) && (
          <Text style={{ fontSize: 11, color: draftEnd ? BRAND : colors.gray[500], fontWeight: draftEnd ? '700' : '400' }}>
            {formatTime(block.start)} – {formatTime(toHM(endMin))} · {hours(endMin - startMin)}{block.todo_id ? ' · updates the task' : ''}
          </Text>
        )}
        {showTools && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 2 }}>
            {[null, 0, 1, 2].map((p) => (
              <Pressable key={String(p)} onPress={() => set({ priority: p })} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: block.priority === p ? (p === null ? colors.gray[200] : paletteHex(PRIORITY_COLORS[p])) : colors.gray[100] }}>
                <Text style={{ fontSize: 12, color: block.priority === p && p !== null ? paletteInk(PRIORITY_COLORS[p]) : colors.gray[700] }}>{p === null ? 'Other' : `Top ${p + 1}`}</Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <IconBtn icon="remove" label="30 minutes shorter" onPress={() => update((b) => ({ ...b, blocks: resize(b.blocks, index, -1) }))} />
            <IconBtn icon="add" label="30 minutes longer" onPress={() => update((b) => ({ ...b, blocks: resize(b.blocks, index, 1) }))} />
            <IconBtn icon="trash-outline" label="Remove the block" onPress={() => { onSelect(null); update((b) => ({ ...b, blocks: b.blocks.filter((_, i) => i !== index) })); }} />
          </View>
        )}
      </View>
      {!readOnly && isWeb && (
        // Pull the bottom edge down or up to say how long it takes.
        <View ref={grip} accessibilityLabel="Pull to change how long it takes" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize' }}>
          <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: draftEnd ? BRAND : colors.gray[300] }} />
        </View>
      )}
    </Pressable>
  );
}

function Schedule({ box, update, readOnly, date, placing, setPlacing, onOpenTodo, markSynced }) {
  const colors = useColors();
  const addToTodo = useAddToTodo();
  const [early, setEarly] = useState(false);
  const [late, setLate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [fresh, setFresh] = useState(null);
  const today = todayYmd();
  const canMark = date <= today;
  const { from, to } = rangeOf(box.blocks, { early, late });
  const sum = summarize(box);
  const now = date === today ? nowMin() : null;

  const place = (start) => {
    if (readOnly) return;
    const fields = placing ? { text: placing.text, todo_id: placing.todo_id, priority: placing.priority ?? null } : {};
    const next = addBlock(box.blocks, start, fields, placing?.minutes || STEP);
    if (!next) return;
    update((b) => ({ ...b, blocks: next }));
    const idx = next.findIndex((x) => toMin(x.start) === start);
    setSelected(idx);
    setFresh(placing ? null : idx);
    setPlacing(null);
  };

  // Drag a task onto a half hour, or drag a block to another time. A task already on the schedule moves
  // instead of being added twice.
  useTimeboxDnd({
    enabled: !readOnly,
    onDrop: (p, start) => {
      if (p.kind === 'block') {
        if (!moveBlock(box.blocks, p.index, start)) { showToast({ message: 'That time is taken', icon: 'alert-circle-outline' }); return; }
        update((b) => ({ ...b, blocks: moveBlock(b.blocks, p.index, start) || b.blocks }));
        setSelected(null);
        return;
      }
      const existing = p.todo_id ? box.blocks.findIndex((x) => x.todo_id === p.todo_id) : -1;
      if (existing >= 0) {
        if (!moveBlock(box.blocks, existing, start)) { showToast({ message: 'That time is taken', icon: 'alert-circle-outline' }); return; }
        update((b) => ({ ...b, blocks: moveBlock(b.blocks, existing, start) || b.blocks }));
        return;
      }
      const fields = { text: p.text, todo_id: p.todo_id || null, priority: p.priority ?? null };
      const minutes = p.minutes || 60;
      if (!addBlock(box.blocks, start, fields, minutes)) { showToast({ message: 'That time is taken', icon: 'alert-circle-outline' }); return; }
      update((b) => ({ ...b, blocks: addBlock(b.blocks, start, fields, minutes) || b.blocks }));
      setSelected(null);
    },
  });

  const addBlockToTodo = (index) => {
    const b = box.blocks[index];
    if (!b?.text) return;
    addToTodo(
      { title: b.text, due_date: date, due_time: b.start, duration_minutes: toMin(b.end) - toMin(b.start) },
      (id) => { markSynced(id, b); update((bx) => ({ ...bx, blocks: bx.blocks.map((x) => (x.start === b.start && x.end === b.end && !x.todo_id ? { ...x, todo_id: id } : x)) })); },
    );
  };

  // The grid never changes size: every half hour is one fixed row, and a block is laid over the rows it covers.
  // Stretching a block therefore covers more rows (the times stay put) instead of pushing everything below it down.
  const rows = [];
  const blockEls = [];
  for (let m = from; m < to; m += STEP) {
    const idx = box.blocks.findIndex((b) => toMin(b.start) < m + STEP && toMin(b.end) > m);
    const label = m % 60 === 0 ? formatTime(toHM(m)) : '';
    if (idx >= 0) {
      rows.push(
        <View key={m} style={{ flexDirection: 'row', height: SLOT_H }}>
          <Text style={{ width: 62, fontSize: 12, color: colors.gray[500], paddingTop: 2 }}>{label}</Text>
          <View style={{ flex: 1 }} />
        </View>
      );
    } else {
      const slot = m;
      rows.push(
        <View key={m} style={{ flexDirection: 'row', height: SLOT_H }}>
          <Text style={{ width: 62, fontSize: 12, color: colors.gray[500], paddingTop: 2 }}>{label}</Text>
          <Pressable
            dataSet={{ tbSlot: String(slot) }}
            onPress={() => place(slot)}
            disabled={readOnly}
            accessibilityLabel={`Plan ${formatTime(toHM(slot))}`}
            style={({ hovered }) => ({
              flex: 1, borderTopWidth: 1, borderStyle: slot % 60 === 0 ? 'solid' : 'dashed', borderColor: colors.gray[200], justifyContent: 'center', paddingHorizontal: 8,
              backgroundColor: placing ? colors.brand[50] : hovered && !readOnly ? colors.gray[50] : 'transparent',
            })}
          >
            {({ hovered }) => (hovered && !readOnly ? <Text style={{ fontSize: 12, color: BRAND }}>{placing ? `Put "${placing.text}" here` : '+ Plan this half hour'}</Text> : null)}
          </Pressable>
        </View>
      );
    }
  }
  box.blocks.forEach((b, i) => {
    blockEls.push(
      <Block key={`b${i}`} block={b} index={i} blocks={box.blocks} readOnly={readOnly} canMark={canMark} selected={selected === i} onSelect={setSelected} update={update} onOpenTodo={onOpenTodo} autoFocus={fresh === i}
        top={((toMin(b.start) - from) / STEP) * SLOT_H + 2} onAddToTodo={addBlockToTodo} />
    );
  });

  return (
    <Card
      title="Schedule"
      icon="time-outline"
      right={<Text style={{ fontSize: 12, color: colors.gray[500] }}>{sum.planned ? `${hours(sum.planned)} planned${canMark && sum.done ? ` · ${hours(sum.done)} done` : ''}` : isWeb && typeof window !== 'undefined' && window.innerWidth >= 700 ? 'Drag a task here, pull the bottom edge of a block to stretch it' : 'Tap a half hour to plan it'}</Text>}
    >
      {placing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand[50], paddingHorizontal: spacing.md, paddingVertical: 8 }}>
          <Ionicons name="hand-left-outline" size={16} color={BRAND} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.gray[800] }}>Pick a time for "{placing.text}"</Text>
          <Pressable onPress={() => { const s = firstFree(box.blocks, Math.max(from, now ?? from)); if (s !== null) place(s); }}><Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>Next free</Text></Pressable>
          <Pressable onPress={() => setPlacing(null)}><Text style={{ fontSize: 13, color: colors.gray[600] }}>Cancel</Text></Pressable>
        </View>
      )}
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        {!readOnly && from > 5 * 60 && !early && <Pressable onPress={() => setEarly(true)}><Text style={{ fontSize: 12, color: BRAND, paddingBottom: 6 }}>Show earlier</Text></Pressable>}
        <View>
          {rows}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 62, right: 0 }}>{blockEls}</View>
          {now !== null && now >= from && now <= to && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 56, right: 0, top: ((now - from) / STEP) * SLOT_H, height: 2, backgroundColor: colors.red[500], zIndex: 9 }} />
          )}
        </View>
        {!readOnly && to < 24 * 60 - STEP && !late && <Pressable onPress={() => setLate(true)}><Text style={{ fontSize: 12, color: BRAND, paddingTop: 6 }}>Show later</Text></Pressable>}
        {readOnly && !box.blocks.length && <Text style={{ color: colors.gray[500] }}>No blocks were planned.</Text>}
      </View>
    </Card>
  );
}

/** "This is the wrong day": pick the right one among the last week's days that have nothing on them. */
function WrongDay({ date, onMove }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayYmd();
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, -i)).filter((d) => d !== date);
  const pick = async (to) => {
    const ok = await confirmDialog({
      title: 'Move this whole timebox?',
      message: `Everything in it, and its sent status, moves from ${formatDue(date)} to ${formatDue(to)}. The people above you will see it on ${formatDue(to)}. Tasks linked to its blocks get that date too.`,
      confirmLabel: 'Move it',
    });
    if (!ok) return;
    setBusy(true);
    await onMove(to);
    setBusy(false);
    setOpen(false);
  };
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>{open ? 'Cancel' : 'Is this the wrong day?'}</Text>
      </Pressable>
      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.gray[500] }}>It belongs to:</Text>
          {days.map((d) => (
            <Pressable key={d} disabled={busy} onPress={() => pick(d)} style={({ hovered }) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: hovered ? colors.gray[100] : colors.white, opacity: busy ? 0.5 : 1 })}>
              <Text style={{ fontSize: 13, color: colors.gray[800] }}>{d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : formatDue(d)}</Text>
            </Pressable>
          ))}
          <Text style={{ fontSize: 12, color: colors.gray[500], width: '100%' }}>Only a day with nothing on it can be chosen.</Text>
        </View>
      )}
    </View>
  );
}

function EndOfDay({ data, box, update, readOnly, onSend, onMove, mine }) {
  const colors = useColors();
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const sum = summarize(box);
  const sent = data?.status === 'sent';
  return (
    <Card title="End of the day" icon="moon-outline">
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <View><Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray[900] }}>{sum.percent === null ? '-' : `${sum.percent}%`}</Text><Text style={{ fontSize: 12, color: colors.gray[500] }}>of planned time done</Text></View>
          <View><Text style={{ fontSize: 20, fontWeight: '700', color: colors.gray[900] }}>{box.priorities.filter((p) => p.done).length}/{box.priorities.filter((p) => p.text).length}</Text><Text style={{ fontSize: 12, color: colors.gray[500] }}>top priorities done</Text></View>
        </View>
        {readOnly ? (
          !!box.reflection && <Text style={{ fontSize: 14, color: colors.gray[800], lineHeight: 20 }}>{box.reflection}</Text>
        ) : (
          <TextInput
            value={box.reflection}
            onChangeText={(t) => update((b) => ({ ...b, reflection: t }))}
            multiline
            placeholder="How did the day go? What got in the way, what moves to tomorrow?"
            placeholderTextColor={colors.gray[400]}
            style={[{ minHeight: 72, fontSize: 14, color: colors.gray[900], borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.md, padding: spacing.sm, textAlignVertical: 'top' }, noOutline]}
          />
        )}
        {mine && (
          <Pressable
            onPress={() => setReportOpen(true)}
            style={({ hovered }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand[200], backgroundColor: hovered ? colors.brand[100] : colors.brand[50] })}
          >
            <Ionicons name="document-text-outline" size={16} color={BRAND} />
            <Text style={{ color: BRAND, fontWeight: '600' }}>{data?.report ? 'Open my day report' : 'Make my day report'}</Text>
          </Pressable>
        )}
        {mine && <DayReportSheet open={reportOpen} onClose={() => setReportOpen(false)} date={data?.date} box={box} initial={data?.report || null} />}
        {sent ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="paper-plane" size={15} color={colors.green[600]} />
              <Text style={{ fontSize: 13, color: colors.gray[700] }}>Sent at {new Date(data.submitted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. It is locked now.</Text>
            </View>
            {mine && !!onMove && <WrongDay date={data.date} onMove={onMove} />}
            {mine && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 13, color: colors.gray[500] }}>{data.seen_by?.length ? 'Seen by' : 'Nobody has opened it yet.'}</Text>
                {(data.seen_by || []).map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Avatar name={p.name} uri={p.profile_picture} size={20} /><Text style={{ fontSize: 13, color: colors.gray[700] }}>{p.name.split(' ')[0]}</Text></View>
                ))}
              </View>
            )}
          </View>
        ) : mine && (
          <View style={{ gap: 6 }}>
            <Pressable
              {...glass('accent')}
              disabled={!data?.can_send || sending}
              onPress={async () => { setSending(true); await onSend(); setSending(false); }}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.md, opacity: data?.can_send ? 1 : 0.5 }}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="paper-plane-outline" size={16} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '600' }}>Send my timebox</Text>
            </Pressable>
            <Text style={{ fontSize: 12, color: colors.gray[500] }}>
              {data?.date > todayYmd() ? 'You can send it on the day itself.' : 'Once sent it is locked, and the people above you can read it.'}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * One day's timebox: the classic page of brain dump, top three and half-hour blocks, plus the end-of-day card.
 * Editable for its owner until it is sent; read-only for everyone else (and for the owner afterwards).
 */
export default function TimeboxDay({ data, box, update, onSend, onMove, onOpenTodo }) {
  const desktop = useIsDesktop();
  const [placing, setPlacing] = useState(null);
  const mine = !!data?.mine;
  const readOnly = !data?.can_edit;
  const date = data?.date;

  useEffect(() => {
    if (!placing || typeof window === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setPlacing(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [placing]);

  // What is planned here is written back to the to-do itself: its date, its start time and how long it takes
  // (the length of the block). It runs after the box has saved, only for blocks that changed since the day was
  // opened, so merely looking at a day never rewrites anything. A task the person may not edit is reported.
  const { updateTodo, todos } = useTodos();
  const synced = useRef({ date: null, sig: new Map() });
  useEffect(() => {
    if (!data?.mine || !data.can_edit || data.date !== date) return undefined;
    const sigOf = (b) => `${date}|${b.start}|${b.end}`;
    if (synced.current.date !== date) {
      // First look at this day: remember how things are, write nothing.
      synced.current = { date, sig: new Map(box.blocks.filter((b) => b.todo_id).map((b) => [b.todo_id, sigOf(b)])) };
      return undefined;
    }
    const changed = box.blocks.filter((b) => b.todo_id && synced.current.sig.get(b.todo_id) !== sigOf(b));
    if (!changed.length) return undefined;
    const timer = setTimeout(async () => {
      let ok = 0;
      const failed = [];
      for (const b of changed) {
        synced.current.sig.set(b.todo_id, sigOf(b)); // one try per change; a refusal is not retried in a loop
        try {
          await updateTodo(b.todo_id, { due_date: date, due_time: b.start, duration_minutes: toMin(b.end) - toMin(b.start) });
          ok += 1;
        } catch {
          failed.push(b.text || 'a task');
        }
      }
      if (ok) showToast({ message: ok === 1 ? 'Task updated with its time' : `${ok} tasks updated with their time`, icon: 'time-outline', tone: 'success' });
      if (failed.length) showToast({ message: `Could not change the time of "${failed[0]}"${failed.length > 1 ? ` and ${failed.length - 1} more` : ''}. You may not be allowed to edit it.`, tone: 'error', icon: 'alert-circle-outline' });
    }, 1500);
    return () => clearTimeout(timer);
  }, [box.blocks, date, data, updateTodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const markSynced = useCallback((id, b) => { synced.current.sig.set(id, `${date}|${b.start}|${b.end}`); }, [date]);
  // Work finished on this day that has a real time (its own date and time, set on the to-do) goes onto the schedule
  // by itself, as a block marked done: it starts at the to-do's time and lasts as long as its time estimate (half an
  // hour when there is none, the smallest block), widened to whole half hours. Nothing is guessed: no time, no block.
  // A clash with something already planned is left alone, and a block the person removes stays removed.
  const me = useAuth().user;
  const boxRef = useRef(box);
  boxRef.current = box;
  useEffect(() => {
    if (!data?.mine || !data.can_edit || data.date !== date || date > todayYmd()) return undefined;
    let cancelled = false;
    (async () => {
      const key = `timebox.skip.${date}`;
      let skip = [];
      try { skip = JSON.parse((await getItemAsync(key)) || '[]'); } catch { skip = []; }
      if (cancelled) return;
      const have = new Set(boxRef.current.blocks.map((b) => b.todo_id).filter(Boolean));
      const dayOf = (t) => (t.done_at ? toYmd(new Date(t.done_at)) : null);
      const mine = (t) => (t.assignee_id ? t.assignee_id === me?.id : t.created_by === me?.id || (t.members || []).some((m) => m.id === me?.id));
      const cands = todos
        .filter((t) => t.is_done && t.due_time && dayOf(t) === date && t.due_date === date && mine(t) && !have.has(t.id) && !skip.includes(t.id) && typeof t.id === 'number')
        .sort((a, b) => (a.due_time < b.due_time ? -1 : 1));
      if (!cands.length) return;
      let blocks = boxRef.current.blocks;
      const added = [];
      const clashedIds = [];
      let clashed = 0;
      for (const t of cands) {
        const startRaw = toMin(t.due_time.slice(0, 5));
        const start = Math.floor(startRaw / STEP) * STEP;
        const minutes = Math.max(STEP, Math.ceil(((startRaw - start) + (t.duration_minutes || STEP)) / STEP) * STEP);
        const next = addBlock(blocks, start, { text: t.title, todo_id: t.id, done: true }, minutes);
        if (!next) { clashed += 1; clashedIds.push(t.id); continue; } // its time is taken; it can still be added from My work
        blocks = next;
        added.push(t);
      }
      if (clashed) showToast({ message: `${clashed} finished task${clashed > 1 ? 's' : ''} clash with planned time. Add ${clashed > 1 ? 'them' : 'it'} from My work.`, icon: 'alert-circle-outline' });
      if (!added.length && !clashed) return;
      // Remember first (a block that is removed later must not come back), then write the blocks.
      try { await setItemAsync(key, JSON.stringify([...skip, ...clashedIds, ...added.map((t) => t.id)])); } catch { /* storage blocked */ }
      if (!added.length) return;
      added.forEach((t) => markSynced(t.id, blocks.find((x) => x.todo_id === t.id)));
      update((b) => ({ ...b, blocks }));
      showToast({ message: added.length === 1 ? '1 finished task added to your timebox' : `${added.length} finished tasks added to your timebox`, icon: 'checkmark-circle-outline', tone: 'success' });
    })();
    return () => { cancelled = true; };
  }, [data?.date, data?.mine, data?.can_edit, date, todos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Moving a day also moves the dates of the to-dos its blocks are linked to, which the schedule had stamped on them.
  const moveDay = useCallback(async (to) => {
    const linked = box.blocks.filter((b) => b.todo_id);
    const ok = await onMove(to);
    if (ok) for (const b of linked) { try { await updateTodo(b.todo_id, { due_date: to }); } catch { /* not allowed to edit it: leave it */ } }
    return ok;
  }, [box.blocks, onMove, updateTodo]);

  const onPlace = useCallback((item) => setPlacing((p) => (p && p.text === item.text ? null : item)), []);
  const parts = useMemo(() => ({
    top: <TopThree box={box} update={update} readOnly={readOnly} onPlace={onPlace} placing={placing} />,
    dump: (!readOnly || box.brain_dump.length > 0) && <BrainDump box={box} update={update} readOnly={readOnly} onPlace={onPlace} placing={placing} />,
    schedule: <Schedule box={box} update={update} readOnly={readOnly} date={date} placing={placing} setPlacing={setPlacing} onOpenTodo={onOpenTodo} markSynced={markSynced} />,
    end: <EndOfDay data={data} box={box} update={update} readOnly={readOnly} onSend={onSend} onMove={onMove ? moveDay : null} mine={mine} />,
  }), [box, update, readOnly, onPlace, placing, date, onOpenTodo, data, onSend, mine, markSynced, onMove, moveDay]);

  if (desktop) {
    return (
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ width: 380, gap: spacing.md }}>{parts.top}{parts.dump}{parts.end}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{parts.schedule}</View>
      </View>
    );
  }
  return <View style={{ gap: spacing.md }}>{parts.top}{parts.dump}{parts.schedule}{parts.end}</View>;
}
