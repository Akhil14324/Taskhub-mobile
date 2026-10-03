import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { useNowTick } from './TimeHealth';
import StatusFlow from './StatusFlow';
import { STATUS, BLOCKER_KINDS, describeEntry, formatSeconds, healthColor, healthTint } from '../../utils/timeline';

const ms = (v) => new Date(v).getTime();
const secs = (a, b) => Math.max(0, Math.round((b - a) / 1000));

/** The status a log entry moves the to-do into (mirrors the backend's utils/segments.js). */
function statusAfter(e) {
  switch (e.kind) {
    case 'status': return e.to_value || null;
    case 'submitted': return 'in_review';
    case 'changes_requested': return 'in_progress';
    case 'reopened': return e.to_value || 'todo';
    case 'completed': return e.meta?.recurring ? 'todo' : 'done';
    default: return null;
  }
}

/** The log entries that count as an "update" on the way to done; priority, due-date and edit changes do not. */
const MILESTONES = new Set(['update', 'blocker_raised', 'blocker_cleared', 'submitted', 'changes_requested', 'approved']);

const fmtStamp = (t) => {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
};

/**
 * One task from the day it started until it was finished: a Gantt strip of every stretch it spent in a
 * status (with blockers on their own lane), then a flowchart of every step with the time each one took.
 */
export default function TaskJourney({ todo }) {
  const colors = useColors();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { fetchTimeline } = useTodos();
  const now = useNowTick(30000);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchTimeline(todo.id));
    } catch {
      // keep what we had
    }
  }, [fetchTimeline, todo.id]);
  useEffect(() => { load(); }, [load, todo.updated_at, todo.status, todo.assignee_id, todo.open_blocker_count, todo.is_done]);

  const model = useMemo(() => {
    if (!data) return null;
    const events = (data.entries || []).filter((e) => e.type === 'event');
    const start = ms(todo.created_at);
    const finished = todo.is_done && todo.done_at ? ms(todo.done_at) : null;
    const end = finished || now;

    // Status stretches.
    const segs = [];
    let status = 'todo';
    let cursor = start;
    for (const e of events) {
      const next = statusAfter(e);
      if (!next || next === status) continue;
      const at = ms(e.created_at);
      if (at > cursor) segs.push({ status, from: cursor, to: at });
      cursor = Math.max(cursor, at);
      if (next === 'done') { status = 'done'; break; }
      status = next;
    }
    if (status !== 'done' && end > cursor) segs.push({ status, from: cursor, to: end, running: !finished });

    // Blockers: their own lane.
    const blockers = (data.blockers || []).map((b) => ({
      ...b, from: ms(b.raised_at), to: b.resolved_at ? ms(b.resolved_at) : end, open: !b.resolved_at,
    }));

    // Milestones: only the moments that report progress (updates, blockers, review hand-ins), not every
    // edit. Each one knows how long it took since the start and since the milestone before it.
    const marks = [];
    let prevAt = start;
    for (const e of events) {
      if (!MILESTONES.has(e.kind)) continue;
      const at = Math.min(end, Math.max(prevAt, ms(e.created_at)));
      let held = null;
      if (e.kind === 'blocker_raised') {
        const b = blockers.find((x) => Math.abs(x.from - at) < 5000);
        if (b) held = { label: b.open ? 'Still stuck' : 'Stuck for', seconds: secs(b.from, b.to), running: b.open };
      }
      marks.push({ n: marks.length + 1, e, at, sinceStart: secs(start, at), sinceLast: secs(prevAt, at), held });
      prevAt = at;
    }
    // Legs: start → first milestone → … → finish (or now).
    const points = [start, ...marks.map((m) => m.at), end];
    const legs = points.slice(0, -1).map((from, i) => ({
      from, to: points[i + 1], seconds: secs(from, points[i + 1]),
      toMark: marks[i] || null, last: i === marks.length,
    }));
    const gaps = marks.map((m) => m.sinceLast);
    const longest = gaps.length ? Math.max(...gaps) : 0;
    const average = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

    const byStatus = {};
    segs.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + secs(s.from, s.to); });
    return { start, end, finished, segs, blockers, marks, legs, longest, average, byStatus, total: Math.max(1, end - start) };
  }, [data, todo.created_at, todo.is_done, todo.done_at, now]);

  if (!model) return <Text style={styles.empty}>Loading the journey...</Text>;

  const shade = (s) => ({
    todo: colors.gray[300],
    in_progress: colors.brand[600],
    in_review: colors.brand[400],
    blocked: colors.brand[900],
    on_hold: colors.gray[500],
  }[s] || colors.gray[300]);
  const red = healthColor('red', theme);

  const totalSeconds = secs(model.start, model.end);

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>
            {model.finished ? `Finished in ${formatSeconds(totalSeconds)}` : `Running for ${formatSeconds(totalSeconds)}`}
          </Text>
          <Text style={styles.summaryText}>
            Started {fmtStamp(model.start)}{model.finished ? ` · finished ${fmtStamp(model.finished)}` : ' · not finished yet'}
          </Text>
        </View>
      </View>

      <Text style={styles.heading}>Flow</Text>
      <StatusFlow todo={todo} entries={data.entries} now={now} />

      <View style={styles.stats}>
        {[
          { label: 'Total time', value: formatSeconds(totalSeconds), strong: true },
          { label: 'Active time', value: formatSeconds(Math.max(0, totalSeconds - (model.byStatus.on_hold || 0))) },
          { label: 'Updates', value: String(model.marks.length) },
          { label: model.marks.length ? 'To first update' : 'No update yet', value: model.marks.length ? formatSeconds(model.marks[0].sinceStart) : '-' },
          { label: 'Between updates (avg)', value: model.marks.length > 1 ? formatSeconds(model.average) : '-' },
          { label: 'Longest wait', value: model.marks.length ? formatSeconds(model.longest) : '-' },
        ].map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, s.strong && { color: colors.brand[700] }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>Gantt</Text>
      <View style={styles.pins}>
        {model.marks.map((m) => {
          const bad = m.e.kind === 'blocker_raised';
          return (
            <View
              key={m.n}
              style={[styles.pin, { left: `${Math.min(97, ((m.at - model.start) / model.total) * 100)}%`, backgroundColor: bad ? red : colors.brand[600] }]}
            >
              <Text style={styles.pinText}>{m.n}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.track}>
        {model.segs.map((s, i) => (
          <View
            key={i}
            style={[styles.seg, { flex: Math.max(s.to - s.from, model.total * 0.02), backgroundColor: shade(s.status) }]}
          />
        ))}
      </View>
      <Text style={styles.laneLabel}>Time between updates</Text>
      <View style={styles.legs}>
        {model.legs.map((l, i) => (
          <View
            key={i}
            style={[styles.leg, { flex: Math.max(l.to - l.from, model.total * 0.04), backgroundColor: i % 2 ? colors.brand[100] : colors.brand[200] }]}
          >
            <Text style={styles.legText} numberOfLines={1}>{formatSeconds(l.seconds)}</Text>
          </View>
        ))}
      </View>
      {model.blockers.length > 0 && (
        <View style={styles.lane}>
          {model.blockers.map((b) => {
            const left = ((b.from - model.start) / model.total) * 100;
            const width = Math.max(((b.to - b.from) / model.total) * 100, 1.5);
            return (
              <View key={b.id} style={[styles.blockBar, { left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, backgroundColor: healthTint('red', theme, 0.28), borderColor: red }]} />
            );
          })}
        </View>
      )}
      <View style={styles.axis}>
        <Text style={styles.axisText}>{fmtStamp(model.start)}</Text>
        <Text style={styles.axisText}>{model.finished ? fmtStamp(model.finished) : 'now'}</Text>
      </View>
      <View style={styles.legend}>
        {Object.keys(model.byStatus).map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: shade(k) }]} />
            <Text style={styles.legendText}>{STATUS[k]?.label || k} {formatSeconds(model.byStatus[k])}</Text>
          </View>
        ))}
        {model.blockers.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: healthTint('red', theme, 0.4), borderWidth: 1, borderColor: red }]} />
            <Text style={styles.legendText}>Stuck {formatSeconds(model.blockers.reduce((n, b) => n + secs(b.from, b.to), 0))}</Text>
          </View>
        )}
      </View>

      {model.blockers.length > 0 && (
        <>
          <Text style={styles.heading}>Roadblocks and dependencies</Text>
          {model.blockers.map((b) => {
            const kind = BLOCKER_KINDS[b.kind] || BLOCKER_KINDS.issue;
            const on = b.blocked_by_todo_title || b.blocked_by_user_name;
            return (
              <View key={b.id} style={[styles.block, { borderColor: b.open ? red : colors.gray[200] }]}>
                <Ionicons name={kind.icon} size={18} color={b.open ? red : colors.gray[500]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockTitle}>{kind.short}{on ? `: ${on}` : ''}</Text>
                  {!!b.note && <Text style={styles.blockNote}>{b.note}</Text>}
                  <Text style={styles.blockMeta}>
                    Raised {fmtStamp(b.from)}{b.open ? ' · still open' : ` · cleared ${fmtStamp(b.to)}`}
                  </Text>
                </View>
                <Text style={[styles.blockDur, { color: b.open ? red : colors.gray[700] }]}>{formatSeconds(secs(b.from, b.to))}</Text>
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.heading}>Updates</Text>
      <View style={styles.startNode}>
        <Ionicons name="flag" size={14} color={colors.brand[600]} />
        <Text style={styles.startText}>Started {fmtStamp(model.start)}</Text>
      </View>
      {model.marks.length === 0 && <Text style={styles.empty}>No updates were posted {model.finished ? 'before it was finished.' : 'yet.'}</Text>}
      {model.marks.map((step) => {
        const who = step.e.user_id === user?.id ? 'You' : (step.e.user_name || 'Someone');
        const d = describeEntry(step.e, who);
        const bad = d.tone === 'bad';
        const good = d.tone === 'good';
        const tone = bad ? red : good ? healthColor('green', theme) : colors.gray[500];
        return (
          <View key={step.e.id}>
            <View style={styles.link}>
              <View style={styles.linkLine} />
              <View style={styles.linkPill}>
                <Ionicons name="arrow-down" size={11} color={colors.gray[500]} />
                <Text style={styles.linkText}>{step.sinceLast >= 60 ? formatSeconds(step.sinceLast) : 'right after'}{step.n === 1 ? ' from the start' : ' since the last one'}</Text>
              </View>
              <View style={styles.linkLine} />
            </View>
            <View style={[styles.node, { borderColor: bad ? red : colors.gray[200] }]}>
              <View style={[styles.nodeIcon, { backgroundColor: bad ? healthTint('red', theme, 0.16) : good ? healthTint('green', theme, 0.16) : colors.gray[100] }]}>
                <Ionicons name={d.icon} size={16} color={tone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nodeTitle}>{d.title}</Text>
                {!!d.detail && <Text style={styles.nodeDetail}>{d.detail}</Text>}
                <Text style={styles.nodeTime}>#{step.n} · {fmtStamp(step.at)} · {formatSeconds(step.sinceStart)} after the start</Text>
                {!!step.e.meta?.progress && <Text style={styles.nodeTime}>Progress {step.e.meta.progress}%</Text>}
                {step.held && (
                  <View style={[styles.held, { backgroundColor: step.held.bad ? healthTint('red', theme, 0.14) : colors.gray[100] }]}>
                    <Ionicons name="time-outline" size={12} color={step.held.bad ? red : colors.gray[600]} />
                    <Text style={[styles.heldText, { color: step.held.bad ? red : colors.gray[700] }]}>
                      {step.held.label} {formatSeconds(step.held.seconds)}{step.held.running && !step.held.bad ? ' so far' : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })}
      {(() => {
        const last = model.legs[model.legs.length - 1];
        return (
          <>
            <View style={styles.link}>
              <View style={styles.linkLine} />
              <View style={styles.linkPill}>
                <Ionicons name="arrow-down" size={11} color={colors.gray[500]} />
                <Text style={styles.linkText}>
                  {model.finished
                    ? `${formatSeconds(last.seconds)} ${model.marks.length ? 'from the last update' : 'from the start'} to finishing`
                    : `${formatSeconds(last.seconds)} ${model.marks.length ? 'since the last update' : 'since the start'}, still going`}
                </Text>
              </View>
              <View style={styles.linkLine} />
            </View>
            <View style={[styles.node, { borderColor: model.finished ? healthColor('green', theme) : colors.gray[200] }]}>
              <View style={[styles.nodeIcon, { backgroundColor: model.finished ? healthTint('green', theme, 0.16) : colors.gray[100] }]}>
                <Ionicons name={model.finished ? 'checkmark-circle' : 'hourglass-outline'} size={16} color={model.finished ? healthColor('green', theme) : colors.gray[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nodeTitle}>{model.finished ? 'Marked complete' : 'Not complete yet'}</Text>
                <Text style={styles.nodeTime}>{model.finished ? fmtStamp(model.finished) : `now · ${fmtStamp(now)}`}</Text>
                <View style={[styles.held, { backgroundColor: colors.gray[100] }]}>
                  <Ionicons name="time-outline" size={12} color={colors.gray[600]} />
                  <Text style={[styles.heldText, { color: colors.gray[700] }]}>
                    Total {formatSeconds(totalSeconds)}{model.finished ? '' : ' so far'}
                  </Text>
                </View>
              </View>
            </View>
          </>
        );
      })()}
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm, paddingBottom: spacing.lg },
  empty: { fontSize: fontSize.sm, color: c.gray[500], padding: spacing.md },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.gray[50], borderRadius: radius.lg, padding: spacing.md },
  summaryTitle: { fontSize: fontSize.md, fontWeight: '800', color: c.gray[900] },
  summaryText: { fontSize: fontSize.xs, color: c.gray[500], marginTop: 2 },
  heading: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: c.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm },
  track: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: c.gray[100], gap: 1 },
  seg: { height: 18 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  stat: { flexGrow: 1, flexBasis: 90, backgroundColor: c.gray[50], borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: spacing.md },
  statValue: { fontSize: fontSize.md, fontWeight: '800', color: c.gray[900] },
  statLabel: { fontSize: 10, fontWeight: '600', color: c.gray[500], marginTop: 1 },
  pins: { height: 22, position: 'relative' },
  pin: { position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 9, marginLeft: -9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.white },
  pinText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  laneLabel: { fontSize: 10, fontWeight: '700', color: c.gray[400], marginTop: 6, marginBottom: 3 },
  legs: { flexDirection: 'row', height: 22, borderRadius: 6, overflow: 'hidden', gap: 1 },
  leg: { height: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  legText: { fontSize: 10, fontWeight: '700', color: c.gray[800] },
  startNode: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  startText: { fontSize: fontSize.sm, fontWeight: '700', color: c.gray[800] },
  lane: { height: 10, marginTop: 4, position: 'relative' },
  blockBar: { position: 'absolute', top: 0, height: 10, borderRadius: 5, borderWidth: 1 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 10, color: c.gray[500] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: fontSize.xs, color: c.gray[700], fontWeight: '600' },
  block: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  blockTitle: { fontSize: fontSize.sm, fontWeight: '700', color: c.gray[900] },
  blockNote: { fontSize: fontSize.sm, color: c.gray[600], marginTop: 1 },
  blockMeta: { fontSize: 11, color: c.gray[500], marginTop: 2 },
  blockDur: { fontSize: fontSize.sm, fontWeight: '800' },
  link: { alignItems: 'center', paddingVertical: 2 },
  linkLine: { width: 2, height: 8, backgroundColor: c.gray[200] },
  linkPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: c.gray[100] },
  linkText: { fontSize: 11, fontWeight: '600', color: c.gray[600] },
  node: { flexDirection: 'row', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, backgroundColor: c.white },
  nodeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nodeTitle: { fontSize: fontSize.sm, fontWeight: '700', color: c.gray[900] },
  nodeDetail: { fontSize: fontSize.sm, color: c.gray[600], marginTop: 2, lineHeight: 18 },
  nodeTime: { fontSize: 11, color: c.gray[400], marginTop: 3 },
  held: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  heldText: { fontSize: 11, fontWeight: '700' },
});
