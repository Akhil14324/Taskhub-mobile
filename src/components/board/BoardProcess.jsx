import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../../api/client';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, BRAND } from '../../theme/theme';
import { paletteHex, paletteInk } from './model';
import { progressMapOf } from '../../utils/progress';
import { formatDue } from '../../utils/dates';
import { BoardActivity } from './BoardViews';

// The Activity tab of a board. It answers "where did this task's time go": the task as a chain of its steps with
// the time each took, the time spent in each stage, who held it, what it waited for and what blocked it. The
// numbers come from GET /boards/:id/items/:todoId/process (backend utils/process.js). The plain log of every
// change is still there behind "Log".

const STAGE = {
  todo: ['Not started', 'grey'], in_progress: ['Working on it', 'orange'], blocked: ['Stuck', 'red'],
  in_review: ['In review', 'purple'], on_hold: ['On hold', 'indigo'], done: ['Done', 'green'],
};

/** 5400 -> "1h 30m", 200000 -> "2d 7h". Short on purpose: these sit inside small boxes. */
export function span(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return 'under 1m';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return d < 10 && h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}
const day = (iso) => (iso ? formatDue(String(iso).slice(0, 10)) : '');

function Tile({ label, value, note, tone }) {
  const colors = useColors();
  const ink = tone === 'bad' ? colors.red[600] : tone === 'good' ? colors.green[600] : colors.gray[900];
  return (
    <View style={{ flexGrow: 1, flexBasis: 150, minWidth: 0, borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, gap: 3, backgroundColor: colors.white }}>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: colors.gray[600] }}>{label}</Text>
      <Text numberOfLines={1} style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {!!note && <Text numberOfLines={2} style={{ fontSize: 12, color: colors.gray[500], lineHeight: 16 }}>{note}</Text>}
    </View>
  );
}

function Section({ title, hint, children }) {
  const colors = useColors();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>{title}</Text>
        {!!hint && <Text style={{ fontSize: 12, color: colors.gray[500] }}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

/** One box of the chain. `kind`: start | wait | step | end. */
function Node({ kind, title, big, lines = [], color, dashed, share, onPress, depth = 0, narrow }) {
  const colors = useColors();
  const edge = color ? paletteHex(color) : colors.gray[300];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ hovered }) => ({
      width: narrow ? undefined : 172, alignSelf: narrow ? 'stretch' : undefined, minHeight: narrow ? undefined : 112, borderRadius: radius.lg, borderWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderColor: colors.gray[200],
      borderTopWidth: 4, borderTopColor: edge, backgroundColor: hovered && onPress ? colors.gray[50] : colors.white, paddingHorizontal: 12, paddingVertical: 10, gap: 4,
    })}>
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', color: colors.gray[500] }}>
        {kind === 'start' ? 'Added' : kind === 'end' ? 'Finish' : kind === 'wait' ? 'Waited for' : depth ? 'Step inside a step' : 'Step'}
      </Text>
      <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900], lineHeight: 17 }}>{title}</Text>
      {!!big && <Text style={{ fontSize: 18, fontWeight: '700', color: colors.gray[900], fontVariant: ['tabular-nums'] }}>{big}</Text>}
      {lines.filter(Boolean).map((l, i) => <Text key={i} numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>{l}</Text>)}
      {share !== null && share !== undefined && (
        <View style={{ marginTop: 'auto', gap: 3 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.gray[100] }}><View style={{ width: `${share}%`, height: 4, borderRadius: 2, backgroundColor: edge }} /></View>
          <Text style={{ fontSize: 11, color: colors.gray[500] }}>{share}% of the step time</Text>
        </View>
      )}
    </Pressable>
  );
}

const Arrow = ({ narrow }) => {
  const colors = useColors();
  return <View style={{ justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2, paddingVertical: narrow ? 3 : 0 }}><Ionicons name={narrow ? 'arrow-down' : 'arrow-forward'} size={16} color={colors.gray[400]} /></View>;
};

function Bars({ rows, total }) {
  const colors = useColors();
  const max = Math.max(1, ...rows.map((r) => r.seconds));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text numberOfLines={1} style={{ width: 96, fontSize: 13, color: colors.gray[800] }}>{r.label}</Text>
          <View style={{ flex: 1, height: 12, borderRadius: 3, backgroundColor: colors.gray[100] }}>
            <View style={{ width: `${(r.seconds / max) * 100}%`, height: 12, borderRadius: 3, backgroundColor: paletteHex(r.color || 'dark_orange') }} />
          </View>
          <Text style={{ width: 96, textAlign: 'right', fontSize: 12, color: colors.gray[700], fontVariant: ['tabular-nums'] }}>
            {span(r.seconds)}{total ? `  ${Math.round((r.seconds / total) * 100)}%` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Detail({ boardId, todoId, labelOf, onOpenItem, onBack }) {
  const colors = useColors();
  const narrow = useWindowDimensions().width < 600;
  const link = { flexDirection: narrow ? 'column' : 'row' };
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    api.get(`/boards/${boardId}/items/${todoId}/process`, { __skipOops: true })
      .then((r) => live && setData(r.data))
      .catch((e) => live && setError(e.response?.data?.error || 'Could not load this task'));
    return () => { live = false; };
  }, [boardId, todoId]);

  if (error) return <Text style={{ padding: spacing.xl, color: colors.red[600] }}>{error}</Text>;
  if (!data) return <ActivityIndicator color={BRAND} style={{ marginTop: spacing.xxl }} />;
  const { task, numbers: n, steps, stages, holders } = data;
  const st = labelOf(task.status);
  const stageTotal = stages.reduce((a, s) => a + s.seconds, 0);
  const leaves = steps.filter((s) => s.leaf);
  const over = n.estimate_s && n.steps_time_s ? n.steps_time_s - n.estimate_s : null;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: 120 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!onBack && <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back to the tasks"><Ionicons name="chevron-back" size={22} color={colors.gray[700]} /></Pressable>}
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.gray[900] }}>{task.title}</Text>
          <Pressable onPress={() => onOpenItem(task.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300] }}>
            <Ionicons name="open-outline" size={14} color={colors.gray[800]} /><Text style={{ fontSize: 13, color: colors.gray[800] }}>Open task</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ backgroundColor: paletteHex(st.color), borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: paletteInk(st.color) }}>{st.label}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.gray[600] }}>
            {[task.assignee_name || 'Nobody yet', `added ${day(task.created_at)}`, task.done_at ? `finished ${day(task.done_at)}` : task.due_date ? `due ${formatDue(task.due_date)}` : 'no due date'].join('  ·  ')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile label={task.is_done ? 'Start to finish' : 'Open for'} value={span(n.total_s)} note={task.is_done ? 'From added to done' : 'Since it was added'} />
        <Tile label="Worked on" value={span(n.working_s)} note="Without stuck, hold and review time" />
        <Tile label="Before it started" value={n.started ? span(n.before_start_s) : 'Not started'} note={n.started ? 'From given to first worked on' : `Waiting ${span(n.before_start_s)} so far`} tone={!n.started && n.before_start_s > 3 * 86400 ? 'bad' : undefined} />
        <Tile label="Stuck" value={n.blocked_s ? span(n.blocked_s) : 'Never'} note={n.blockers ? `${n.blockers} blocker${n.blockers === 1 ? '' : 's'} raised` : 'No blockers raised'} tone={n.blocked_s ? 'bad' : undefined} />
        <Tile label="Waiting on other tasks" value={data.waits_for.length ? span(n.waiting_on_others_s) : 'Nothing'} note={data.waits_for.length ? `Depends on ${data.waits_for.length} task${data.waits_for.length === 1 ? '' : 's'}` : 'It depends on no other task'} />
        <Tile label="Steps" value={n.steps_total ? `${n.steps_done} of ${n.steps_total}` : 'None'} note={n.slowest_step ? `Longest: ${n.slowest_step.title} (${span(n.slowest_step.took_s)})` : n.steps_total ? 'No step worked on yet' : 'Add sub-tasks to see each step'} />
        <Tile label="Against the estimate" value={over === null ? 'No estimate' : over > 0 ? `${span(over)} over` : `${span(-over)} under`} note={n.estimate_s ? `Estimated ${span(n.estimate_s)}` : 'Give steps a time needed'} tone={over === null ? undefined : over > 0 ? 'bad' : 'good'} />
        <Tile label="Against the due date" value={n.late_days === null ? 'No date' : n.late_days ? `${n.late_days}d late` : 'On time'} note={[n.date_changes ? `date moved ${n.date_changes}x` : null, n.handoffs ? `handed over ${n.handoffs}x` : null, n.reopened ? `reopened ${n.reopened}x` : null].filter(Boolean).join(', ') || 'Date never moved'} tone={n.late_days ? 'bad' : n.late_days === 0 ? 'good' : undefined} />
      </View>

      <Section title="The task, step by step" hint={leaves.length ? 'Each box is a step with the time it took. The bar is its share of all step time.' : 'This task has no steps, so there is only its start and finish.'}>
        <View style={narrow ? { gap: 0 } : { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 2 }}>
          <Node narrow={narrow} kind="start" title={day(task.created_at)} lines={[task.creator_name ? `by ${task.creator_name}` : null]} color="grey" />
          {data.waits_for.map((w) => (
            <View key={`w${w.id}`} style={link}>
              <Arrow narrow={narrow} />
              <Node narrow={narrow} kind="wait" dashed title={w.title} big={span(w.waited_s) || '0m'} color={w.is_done ? 'green' : 'red'} lines={[w.assignee_name, w.is_done ? `done ${day(w.done_at)}` : 'not done yet']} onPress={() => onOpenItem(w.id)} />
            </View>
          ))}
          {leaves.map((s) => {
            const look = STAGE[s.status] || STAGE.todo;
            return (
              <View key={s.id} style={link}>
                <Arrow narrow={narrow} />
                <Node
                  narrow={narrow} kind="step" depth={s.depth} title={s.title} color={look[1]} share={s.took_s ? s.share : null}
                  big={s.took_s !== null ? span(s.took_s) : 'Not started'}
                  lines={[s.assignee_name, s.is_done ? `done ${day(s.done_at)}` : s.took_s !== null ? `${look[0]}, still running` : `waiting ${span(s.wait_s)}`, s.blocked_s ? `stuck ${span(s.blocked_s)}` : null]}
                  onPress={() => onOpenItem(s.id)}
                />
              </View>
            );
          })}
          <View style={link}>
            <Arrow narrow={narrow} />
            <Node narrow={narrow} kind="end" title={task.is_done ? day(task.done_at) : 'Not finished yet'} color={task.is_done ? 'green' : 'grey'} big={task.is_done ? span(n.total_s) : ''} lines={[task.is_done ? 'in all' : task.due_date ? `due ${formatDue(task.due_date)}` : null]} />
          </View>
        </View>
      </Section>

      {stages.length > 0 && (
        <Section title="Where the time went" hint="Time the task spent in each stage.">
          <View style={{ flexDirection: 'row', height: 26, borderRadius: radius.sm, overflow: 'hidden' }}>
            {stages.map((s) => { const l = labelOf(s.status); return <View key={s.status} style={{ flex: s.seconds, minWidth: 3, backgroundColor: paletteHex(l.color) }} />; })}
          </View>
          <Bars total={stageTotal} rows={stages.map((s) => { const l = labelOf(s.status); return { key: s.status, label: l.label, color: l.color, seconds: s.seconds }; })} />
        </Section>
      )}

      {holders.length > 0 && (
        <Section title="Who held it" hint="How long the task sat with each person.">
          <Bars total={holders.reduce((a, h) => a + h.seconds, 0)} rows={holders.map((h, i) => ({ key: `${h.id}-${i}`, label: h.name, seconds: h.seconds }))} />
        </Section>
      )}

      {data.needed_by.length > 0 && (
        <Section title="Waiting for this task" hint="These cannot move until this one is done.">
          {data.needed_by.map((d) => (
            <Pressable key={d.id} onPress={() => onOpenItem(d.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.gray[100] }}>
              <Ionicons name={d.is_done ? 'checkmark-circle' : 'time-outline'} size={16} color={d.is_done ? colors.green[600] : colors.gray[500]} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{d.title}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>{[d.assignee_name, d.due_date ? formatDue(d.due_date) : null].filter(Boolean).join('  ·  ')}</Text>
            </Pressable>
          ))}
        </Section>
      )}

      {data.blockers.length > 0 && (
        <Section title="What blocked it">
          {data.blockers.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.gray[100] }}>
              <Ionicons name="hand-left-outline" size={16} color={b.resolved_at ? colors.gray[500] : colors.red[600]} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.gray[900] }}>{b.note || (b.on ? `Waiting on ${b.on}` : 'Blocked')}</Text>
                <Text style={{ fontSize: 12, color: colors.gray[500] }}>{[b.on && b.note ? `on ${b.on}` : null, `raised ${day(b.raised_at)}`, b.resolved_at ? `cleared ${day(b.resolved_at)}` : 'still open'].filter(Boolean).join('  ·  ')}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[800] }}>{span(b.seconds)}</Text>
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

export default function BoardProcess({ board, items, onOpenItem }) {
  const colors = useColors();
  const wide = useWindowDimensions().width >= 900;
  const [mode, setMode] = useState('process');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const statusCol = board.columns.find((c) => c.system_key === 'status');
  const labelOf = (status) => {
    const l = (statusCol?.labels || []).find((x) => x.maps_to === status);
    return l ? { label: l.label, color: l.color } : { label: STAGE[status]?.[0] || status, color: STAGE[status]?.[1] || 'grey' };
  };
  const prog = useMemo(() => progressMapOf(items), [items]);
  // Tasks with steps first (they have the most to show), open before done, then the newest.
  const top = useMemo(() => items.filter((t) => !t.parent_id && typeof t.id === 'number')
    .filter((t) => !q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(a.is_done) - Number(b.is_done) || (prog.get(b.id)?.total || 0) - (prog.get(a.id)?.total || 0) || String(b.created_at).localeCompare(String(a.created_at))),
  [items, q, prog]);
  const current = picked && top.some((t) => t.id === picked) ? picked : wide ? top[0]?.id : null;

  const switcher = (
    <View style={{ flexDirection: 'row', backgroundColor: colors.gray[100], borderRadius: radius.md, padding: 3 }}>
      {[['process', 'By task'], ['log', 'Log']].map(([k, l]) => (
        <Pressable key={k} onPress={() => setMode(k)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: mode === k ? colors.white : 'transparent' }}>
          <Text style={{ fontSize: 13, fontWeight: mode === k ? '600' : '400', color: colors.gray[800] }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (mode === 'log') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', padding: spacing.md }}>{switcher}</View>
        <BoardActivity board={board} onOpenItem={onOpenItem} />
      </View>
    );
  }

  const list = (
    <View style={{ width: wide ? 320 : '100%', flex: wide ? undefined : 1, borderRightWidth: wide ? 1 : 0, borderColor: colors.gray[200] }}>
      <View style={{ padding: spacing.md, gap: 10 }}>
        <View style={{ flexDirection: 'row' }}>{switcher}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: 10 }}>
          <Ionicons name="search" size={15} color={colors.gray[500]} />
          <TextInput value={q} onChangeText={setQ} placeholder="Find a task" placeholderTextColor={colors.gray[400]} style={{ flex: 1, paddingVertical: 8, fontSize: 14, color: colors.gray[900], outlineStyle: 'none' }} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {top.map((t) => {
          const p = prog.get(t.id);
          const l = labelOf(t.is_done ? 'done' : t.status || 'todo');
          const on = t.id === current;
          return (
            <Pressable key={t.id} onPress={() => setPicked(t.id)} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: on ? colors.brand[50] : hovered ? colors.gray[50] : 'transparent', borderLeftWidth: 3, borderLeftColor: on ? BRAND : 'transparent' })}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: paletteHex(l.color) }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: on ? '600' : '400', color: colors.gray[900] }}>{t.title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.gray[500] }}>
                  {[t.assignee_name, p?.total > 1 ? `${p.done} of ${p.total} steps` : null, l.label].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
              {!wide && <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />}
            </Pressable>
          );
        })}
        {!top.length && <Text style={{ padding: spacing.lg, color: colors.gray[500], fontSize: 13 }}>No task matches.</Text>}
      </ScrollView>
    </View>
  );

  if (!wide) {
    return current
      ? <Detail boardId={board.board.id} todoId={current} labelOf={labelOf} onOpenItem={onOpenItem} onBack={() => setPicked(null)} />
      : list;
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {list}
      <View style={{ flex: 1, minWidth: 0 }}>
        {current
          ? <Detail key={current} boardId={board.board.id} todoId={current} labelOf={labelOf} onOpenItem={onOpenItem} />
          : <Text style={{ padding: spacing.xl, color: colors.gray[500] }}>This board has no tasks yet.</Text>}
      </View>
    </View>
  );
}
