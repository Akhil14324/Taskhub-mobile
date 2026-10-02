import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors, useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTodos } from '../../context/TodoContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { useNowTick } from './TimeHealth';
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

    // Flowchart steps: every event, in order, with the gap since the previous one and, for a status
    // change or a blocker, how long it lasted.
    const steps = events.map((e, i) => {
      const at = ms(e.created_at);
      const prev = i > 0 ? ms(events[i - 1].created_at) : null;
      let held = null;
      const next = statusAfter(e);
      if (next && next !== 'done') {
        const seg = segs.find((s) => s.status === next && Math.abs(s.from - at) < 2000);
        if (seg) held = { label: `Stayed ${STATUS[next]?.label || next}`, seconds: secs(seg.from, seg.to), running: !!seg.running };
      }
      if (e.kind === 'blocker_raised') {
        const b = blockers.find((x) => Math.abs(x.from - at) < 5000);
        if (b) held = { label: b.open ? 'Still blocked' : 'Blocked for', seconds: secs(b.from, b.to), running: b.open, bad: true };
      }
      return { e, at, gap: prev ? secs(prev, at) : null, held };
    });

    const byStatus = {};
    segs.forEach((s) => { byStatus[s.status] = (byStatus[s.status] || 0) + secs(s.from, s.to); });
    return { start, end, finished, segs, blockers, steps, byStatus, total: Math.max(1, end - start) };
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

      <Text style={styles.heading}>Gantt</Text>
      <View style={styles.track}>
        {model.segs.map((s, i) => (
          <View
            key={i}
            style={[styles.seg, { flex: Math.max(s.to - s.from, model.total * 0.02), backgroundColor: shade(s.status) }]}
          />
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
            <Text style={styles.legendText}>Blocked {formatSeconds(model.blockers.reduce((n, b) => n + secs(b.from, b.to), 0))}</Text>
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

      <Text style={styles.heading}>Flow</Text>
      {model.steps.map((step, i) => {
        const who = step.e.user_id === user?.id ? 'You' : (step.e.user_name || 'Someone');
        const d = describeEntry(step.e, who);
        const bad = d.tone === 'bad';
        const good = d.tone === 'good';
        const tone = bad ? red : good ? healthColor('green', theme) : colors.gray[500];
        return (
          <View key={step.e.id}>
            {step.gap !== null && (
              <View style={styles.link}>
                <View style={styles.linkLine} />
                <View style={styles.linkPill}>
                  <Ionicons name="arrow-down" size={11} color={colors.gray[500]} />
                  <Text style={styles.linkText}>{step.gap >= 60 ? formatSeconds(step.gap) : 'right after'}</Text>
                </View>
                <View style={styles.linkLine} />
              </View>
            )}
            <View style={[styles.node, { borderColor: bad ? red : colors.gray[200] }]}>
              <View style={[styles.nodeIcon, { backgroundColor: bad ? healthTint('red', theme, 0.16) : good ? healthTint('green', theme, 0.16) : colors.gray[100] }]}>
                <Ionicons name={d.icon} size={16} color={tone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nodeTitle}>{d.title}</Text>
                {!!d.detail && <Text style={styles.nodeDetail}>{d.detail}</Text>}
                <Text style={styles.nodeTime}>{fmtStamp(step.at)}</Text>
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
      {!model.finished && (
        <View style={styles.link}>
          <View style={styles.linkLine} />
          <View style={styles.linkPill}><Text style={styles.linkText}>in progress, {formatSeconds(secs(model.steps.length ? model.steps[model.steps.length - 1].at : model.start, now))} since the last step</Text></View>
        </View>
      )}
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
