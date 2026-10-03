import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../context/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/theme';
import { STATUS, formatSeconds } from '../../utils/timeline';

const NODE_W = 124;
const LINK_MIN = 92;
const ms = (v) => new Date(v).getTime();

const fmtStamp = (t) => {
  const d = new Date(t);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

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

/** Every stretch where both the status and the holder stayed the same, oldest first. */
export function buildStages(todo, entries, now) {
  const events = (entries || []).filter((e) => e.type === 'event');
  const start = ms(todo.created_at);
  const finished = todo.is_done && todo.done_at ? ms(todo.done_at) : null;
  const created = events.find((e) => e.kind === 'created');
  const firstAssign = events.find((e) => e.kind === 'assigned');
  let holder = firstAssign
    ? (firstAssign.from_value || null)
    : (todo.assignee_name || created?.user_name || todo.creator_name || null);
  let status = 'todo';
  let cursor = start;
  const stages = [];
  const close = (at) => {
    if (at > cursor) stages.push({ status, holder, from: cursor, to: at });
    cursor = Math.max(cursor, at);
  };
  let ended = null;
  for (const e of events) {
    const at = ms(e.created_at);
    if (e.kind === 'created') continue;
    if (e.kind === 'assigned') {
      const next = e.to_value || null;
      if (next !== holder) { close(at); holder = next; }
      continue;
    }
    const next = statusAfter(e);
    if (!next || next === status) continue;
    close(at);
    if (next === 'done') { ended = at; break; }
    status = next;
  }
  const end = ended || finished || now;
  if (!ended) {
    if (finished) close(finished);
    else if (end > cursor) stages.push({ status, holder, from: cursor, to: end, running: true });
  }
  return { stages, start, end, done: !!(ended || finished), running: !(ended || finished) };
}

/**
 * The path one task took, as a flow chart: a pill per stage (status), with an arrow to the next one that
 * says how long the stage lasted and who held it. Rows zig-zag so it fits any width.
 */
export default function StatusFlow({ todo, entries, now }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const flow = useMemo(() => buildStages(todo, entries, now), [todo, entries, now]);

  const shade = (s) => ({
    todo: colors.gray[300],
    in_progress: colors.brand[600],
    in_review: colors.brand[400],
    blocked: colors.brand[900],
    on_hold: colors.gray[500],
  }[s] || colors.gray[300]);
  const light = (s) => s === 'todo' || s === 'in_review';

  // Nodes: each stage, then the end (Done, or "Now" while it is still open).
  const nodes = flow.stages.map((s, i) => ({ key: `s${i}`, label: STATUS[s.status]?.label || s.status, bg: shade(s.status), ink: light(s.status) ? colors.gray[900] : '#fff', at: s.from, stage: s }));
  nodes.push(flow.done
    ? { key: 'end', label: 'Done', bg: colors.brand[700], ink: '#fff', at: flow.end, icon: 'checkmark-circle' }
    : { key: 'end', label: 'Now', bg: colors.gray[100], ink: colors.gray[700], at: flow.end, outline: true });

  const perRow = Math.max(1, Math.floor((Math.max(width, NODE_W) + LINK_MIN) / (NODE_W + LINK_MIN)));
  const rows = [];
  for (let i = 0; i < nodes.length; i += perRow) rows.push(nodes.slice(i, i + perRow));

  const total = Math.max(0, Math.round((flow.end - flow.start) / 1000));

  const Link = ({ stage, reverse }) => (
    <View style={styles.link}>
      <Text style={styles.linkTop} numberOfLines={1}>{formatSeconds(Math.round((stage.to - stage.from) / 1000))}{stage.running ? ' so far' : ''}</Text>
      <View style={styles.lineRow}>
        {reverse && <Ionicons name="caret-back" size={11} color={colors.gray[400]} style={styles.headLeft} />}
        <View style={styles.dash} />
        {!reverse && <Ionicons name="caret-forward" size={11} color={colors.gray[400]} style={styles.headRight} />}
      </View>
      <Text style={styles.linkBottom} numberOfLines={1}>{stage.holder || 'Open to all'}</Text>
    </View>
  );

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {rows.map((row, r) => {
        const reverse = r % 2 === 1;
        const lastOfRow = row[row.length - 1];
        const wraps = r < rows.length - 1 && lastOfRow.stage;
        return (
          <View key={r}>
            <View style={[styles.row, reverse && { flexDirection: 'row-reverse' }]}>
              {row.map((n, i) => (
                <View key={n.key} style={[styles.cell, i < row.length - 1 && { flex: 1 }]}>
                  <View style={[styles.cellRow, reverse && { flexDirection: 'row-reverse' }]}>
                    <View style={styles.nodeCol}>
                      <View style={[styles.pill, { backgroundColor: n.bg }, n.outline && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gray[400] }]}>
                        {!!n.icon && <Ionicons name={n.icon} size={14} color={n.ink} />}
                        <Text style={[styles.pillText, { color: n.ink }]} numberOfLines={1}>{n.label}</Text>
                      </View>
                      <Text style={styles.stamp} numberOfLines={1}>{n.key === 'end' && !flow.done ? 'right now' : fmtStamp(n.at)}</Text>
                    </View>
                    {i < row.length - 1 && n.stage && <Link stage={n.stage} reverse={reverse} />}
                  </View>
                </View>
              ))}
            </View>
            {r < rows.length - 1 && (
              <View style={[styles.drop, { alignItems: reverse ? 'flex-start' : 'flex-end' }]}>
                <View style={[styles.dropInner, reverse ? { paddingLeft: NODE_W / 2 - 1 } : { paddingRight: NODE_W / 2 - 1 }, reverse && { flexDirection: 'row-reverse' }]}>
                  {wraps && lastOfRow.stage ? (
                    <View style={[styles.dropLabel, reverse ? { marginLeft: 8, alignItems: 'flex-start' } : { marginRight: 8, alignItems: 'flex-end' }]}>
                      <Text style={styles.linkBottom}>{lastOfRow.stage.holder || 'Open to all'}</Text>
                      <Text style={styles.linkTop}>{formatSeconds(Math.round((lastOfRow.stage.to - lastOfRow.stage.from) / 1000))}</Text>
                    </View>
                  ) : null}
                  <View style={styles.vdash} />
                </View>
              </View>
            )}
          </View>
        );
      })}
      <Text style={styles.total}>
        {flow.done ? 'Took' : 'Open for'} {formatSeconds(total)} across {flow.stages.length} stage{flow.stages.length === 1 ? '' : 's'}
      </Text>
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  wrap: { backgroundColor: c.gray[50], borderRadius: radius.lg, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  cell: { },
  cellRow: { flexDirection: 'row', alignItems: 'flex-start' },
  nodeCol: { width: NODE_W, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, width: NODE_W, paddingHorizontal: 10, borderRadius: 17 },
  pillText: { fontSize: fontSize.sm, fontWeight: '700' },
  stamp: { fontSize: 10, color: c.gray[400], marginTop: 4 },
  link: { flex: 1, minWidth: LINK_MIN - 24, paddingHorizontal: 6, marginTop: -7 },
  linkTop: { fontSize: 11, fontWeight: '700', color: c.gray[700], textAlign: 'center' },
  linkBottom: { fontSize: 11, color: c.gray[500], textAlign: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', height: 20 },
  dash: { flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: c.gray[400] },
  headRight: { marginLeft: -3 },
  headLeft: { marginRight: -3 },
  drop: { paddingVertical: 2 },
  dropInner: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  dropLabel: { },
  vdash: { width: 0, height: 44, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: c.gray[400] },
  total: { marginTop: spacing.md, fontSize: fontSize.xs, fontWeight: '700', color: c.gray[600], textAlign: 'center' },
});
