import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { glass } from '../../theme/glass';
import useIsDesktop from '../../hooks/useBreakpoint';
import { Avatar } from '../kit';
import { formatTime, todayYmd } from '../../utils/dates';
import { paletteHex, paletteInk } from '../board/model';
import {
  STEP, MAX_PRIORITIES, PRIORITY_COLORS, toMin, toHM, rangeOf, addBlock, firstFree, resize, summarize, hours, nowMin,
} from './model';

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

function TopThree({ box, update, readOnly, onPlace, placing }) {
  const colors = useColors();
  const set = (i, fields) => update((b) => {
    const list = [...b.priorities];
    while (list.length <= i) list.push({ text: '', done: false, todo_id: null });
    list[i] = { ...list[i], ...fields };
    return { ...b, priorities: list };
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
          {!readOnly && !!p.text && <IconBtn icon="time-outline" label="Give it a time" active={placing?.priority === i} onPress={() => onPlace({ text: p.text, priority: i, todo_id: p.todo_id || null, minutes: 60 })} />}
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
  const [draft, setDraft] = useState('');
  const [work, setWork] = useState(null);
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

  const loadWork = async () => {
    if (work) { setWork(null); return; }
    try {
      const res = await api.get('/me/work', { __skipOops: true });
      const seen = new Set([...box.brain_dump, ...box.priorities].map((x) => x.todo_id).filter(Boolean));
      const list = [...res.data.overdue, ...res.data.due_today, ...res.data.waiting_on_me, ...res.data.upcoming].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
      setWork(list.filter((t) => !seen.has(t.id)).slice(0, 30));
    } catch {
      setWork([]);
    }
  };

  return (
    <Card
      title="Brain dump"
      icon="cloud-outline"
      right={!readOnly && (
        <Pressable onPress={loadWork} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={work ? 'chevron-up' : 'briefcase-outline'} size={14} color={BRAND} />
          <Text style={{ fontSize: 13, color: BRAND, fontWeight: '600' }}>{work ? 'Hide' : 'From my work'}</Text>
        </Pressable>
      )}
    >
      {work && (
        <View style={{ backgroundColor: colors.gray[50], borderBottomWidth: 1, borderColor: colors.gray[200], paddingVertical: 4 }}>
          {!work.length && <Text style={{ padding: spacing.md, color: colors.gray[500] }}>Nothing open on your plate.</Text>}
          {work.map((t) => (
            <Pressable key={t.id} onPress={() => { add({ text: t.title, todo_id: t.id }); setWork((w) => w.filter((x) => x.id !== t.id)); }} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: hovered ? colors.gray[100] : 'transparent' })}>
              <Ionicons name="add" size={16} color={BRAND} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[800] }}>{t.title}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>{t.business_name || 'Personal'}</Text>
            </Pressable>
          ))}
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

function Block({ block, index, readOnly, canMark, selected, onSelect, update, onOpenTodo, autoFocus }) {
  const colors = useColors();
  const slots = (toMin(block.end) - toMin(block.start)) / STEP;
  const color = block.priority !== null && block.priority !== undefined ? PRIORITY_COLORS[block.priority] : null;
  const set = (fields) => update((b) => ({ ...b, blocks: b.blocks.map((x, i) => (i === index ? { ...x, ...fields } : x)) }));
  const cycle = () => set({ done: block.done === null || block.done === undefined ? true : block.done === true ? false : null });
  return (
    <Pressable
      onPress={() => onSelect(selected ? null : index)}
      style={{ height: slots * SLOT_H - 4, marginVertical: 2, flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: selected ? BRAND : colors.gray[200], backgroundColor: block.done === true ? colors.green[50] : colors.white }}
    >
      <View style={{ width: 5, backgroundColor: color ? paletteHex(color) : colors.gray[300] }} />
      <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4, justifyContent: slots > 1 ? 'flex-start' : 'center' }}>
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
          {!!block.todo_id && <IconBtn icon="open-outline" label="Open the to-do" onPress={() => onOpenTodo(block.todo_id)} />}
          {canMark && <DoneMark value={block.done} onPress={cycle} disabled={readOnly} />}
        </View>
        {selected && !readOnly && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
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
    </Pressable>
  );
}

function Schedule({ box, update, readOnly, date, placing, setPlacing, onOpenTodo }) {
  const colors = useColors();
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

  const rows = [];
  for (let m = from; m < to;) {
    const idx = box.blocks.findIndex((b) => toMin(b.start) === m);
    const label = m % 60 === 0 ? formatTime(toHM(m)) : '';
    if (idx >= 0) {
      const b = box.blocks[idx];
      const len = toMin(b.end) - m;
      rows.push(
        <View key={m} style={{ flexDirection: 'row' }}>
          <View style={{ width: 62 }}>{Array.from({ length: len / STEP }, (_, k) => (
            <Text key={k} style={{ height: SLOT_H, fontSize: 12, color: colors.gray[500], paddingTop: 2 }}>{(m + k * STEP) % 60 === 0 ? formatTime(toHM(m + k * STEP)) : ''}</Text>
          ))}</View>
          <View style={{ flex: 1 }}>
            <Block block={b} index={idx} readOnly={readOnly} canMark={canMark} selected={selected === idx} onSelect={setSelected} update={update} onOpenTodo={onOpenTodo} autoFocus={fresh === idx} />
          </View>
        </View>
      );
      m += len;
    } else {
      const slot = m;
      rows.push(
        <View key={m} style={{ flexDirection: 'row', height: SLOT_H }}>
          <Text style={{ width: 62, fontSize: 12, color: colors.gray[500], paddingTop: 2 }}>{label}</Text>
          <Pressable
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
      m += STEP;
    }
  }

  return (
    <Card
      title="Schedule"
      icon="time-outline"
      right={<Text style={{ fontSize: 12, color: colors.gray[500] }}>{sum.planned ? `${hours(sum.planned)} planned${canMark && sum.done ? ` · ${hours(sum.done)} done` : ''}` : 'Tap a half hour to plan it'}</Text>}
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
          {now !== null && now >= from && now <= to && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 56, right: 0, top: ((now - from) / STEP) * SLOT_H, height: 2, backgroundColor: colors.red[500] }} />
          )}
        </View>
        {!readOnly && to < 24 * 60 - STEP && !late && <Pressable onPress={() => setLate(true)}><Text style={{ fontSize: 12, color: BRAND, paddingTop: 6 }}>Show later</Text></Pressable>}
        {readOnly && !box.blocks.length && <Text style={{ color: colors.gray[500] }}>No blocks were planned.</Text>}
      </View>
    </Card>
  );
}

function EndOfDay({ data, box, update, readOnly, onSend, mine }) {
  const colors = useColors();
  const [sending, setSending] = useState(false);
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
        {sent ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="paper-plane" size={15} color={colors.green[600]} />
              <Text style={{ fontSize: 13, color: colors.gray[700] }}>Sent at {new Date(data.submitted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. It is locked now.</Text>
            </View>
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
export default function TimeboxDay({ data, box, update, onSend, onOpenTodo }) {
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

  const onPlace = useCallback((item) => setPlacing((p) => (p && p.text === item.text ? null : item)), []);
  const parts = useMemo(() => ({
    top: <TopThree box={box} update={update} readOnly={readOnly} onPlace={onPlace} placing={placing} />,
    dump: (!readOnly || box.brain_dump.length > 0) && <BrainDump box={box} update={update} readOnly={readOnly} onPlace={onPlace} placing={placing} />,
    schedule: <Schedule box={box} update={update} readOnly={readOnly} date={date} placing={placing} setPlacing={setPlacing} onOpenTodo={onOpenTodo} />,
    end: <EndOfDay data={data} box={box} update={update} readOnly={readOnly} onSend={onSend} mine={mine} />,
  }), [box, update, readOnly, onPlace, placing, date, onOpenTodo, data, onSend, mine]);

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
