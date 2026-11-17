import { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColors } from '../../context/ThemeContext';

const BOX_W = 190;
const BOX_H = 58;
const GAP_X = 28;
const GAP_Y = 46;

/**
 * Rows of boxes for a flow chart: a box sits one row below the lowest box that points to it, so the arrows
 * read top to bottom. A loop cannot push boxes down for ever (rows are capped at the number of boxes).
 */
export function layoutFlow(nodes, edges) {
  const level = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const e of edges) {
      const want = level.get(e.from) + 1;
      if (want > level.get(e.to) && want < nodes.length) { level.set(e.to, want); moved = true; }
    }
    if (!moved) break;
  }
  const rows = [];
  for (const n of nodes) {
    const l = level.get(n.id);
    if (!rows[l]) rows[l] = [];
    rows[l].push(n);
  }
  const filled = rows.filter(Boolean);
  const widest = Math.max(...filled.map((r) => r.length));
  const width = widest * BOX_W + (widest - 1) * GAP_X;
  const pos = new Map();
  filled.forEach((row, y) => {
    const rowW = row.length * BOX_W + (row.length - 1) * GAP_X;
    row.forEach((n, x) => pos.set(n.id, { x: (width - rowW) / 2 + x * (BOX_W + GAP_X), y: y * (BOX_H + GAP_Y) }));
  });
  return { pos, width, height: filled.length * BOX_H + (filled.length - 1) * GAP_Y };
}

/** A flow chart the AI described ({ nodes, edges }): boxes in rows with arrows between them. */
export default function FlowChart({ flow }) {
  const colors = useColors();
  const { pos, width, height } = useMemo(() => layoutFlow(flow.nodes, flow.edges), [flow]);
  const pad = 12;

  const look = (kind) => {
    if (kind === 'start') return { borderColor: colors.green[500], backgroundColor: colors.green[50], borderRadius: BOX_H / 2 };
    if (kind === 'end') return { borderColor: colors.gray[400], backgroundColor: colors.gray[100], borderRadius: BOX_H / 2 };
    if (kind === 'decision') return { borderColor: colors.amber[500], backgroundColor: colors.amber[50], borderRadius: 10, borderStyle: 'dashed' };
    return { borderColor: colors.gray[300], backgroundColor: colors.white, borderRadius: 10 };
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: pad, flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ width, height }}>
        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
          {flow.edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const down = b.y > a.y;
            // Out of the bottom and into the top when the target is lower; otherwise around the side.
            const x1 = a.x + BOX_W / 2;
            const y1 = down ? a.y + BOX_H : a.y + BOX_H / 2;
            const x2 = b.x + BOX_W / 2;
            const y2 = down ? b.y - 5 : b.y + BOX_H / 2;
            const mid = (y1 + y2) / 2;
            const d = down
              ? `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
              : `M ${a.x + BOX_W} ${y1} C ${a.x + BOX_W + 40} ${y1}, ${b.x + BOX_W + 40} ${y2}, ${b.x + BOX_W + 5} ${y2}`;
            const tip = down
              ? `M ${x2 - 5} ${y2 - 5} L ${x2} ${y2 + 2} L ${x2 + 5} ${y2 - 5}`
              : `M ${b.x + BOX_W + 11} ${y2 - 5} L ${b.x + BOX_W + 3} ${y2} L ${b.x + BOX_W + 11} ${y2 + 5}`;
            return (
              <Path key={i} d={`${d} ${tip}`} stroke={colors.gray[400]} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            );
          })}
        </Svg>
        {flow.edges.filter((e) => e.label).map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b || b.y <= a.y) return null;
          return (
            <Text key={`l${i}`} numberOfLines={1} style={{ position: 'absolute', left: (a.x + b.x) / 2 + BOX_W / 2 + 6, top: (a.y + BOX_H + b.y) / 2 - 8, fontSize: 11, fontWeight: '600', color: colors.gray[600], backgroundColor: colors.white, paddingHorizontal: 3 }}>
              {e.label}
            </Text>
          );
        })}
        {flow.nodes.map((n) => {
          const p = pos.get(n.id);
          return (
            <View key={n.id} style={[{ position: 'absolute', left: p.x, top: p.y, width: BOX_W, height: BOX_H, borderWidth: 1.5, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, look(n.kind)]}>
              <Text numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16, fontWeight: '600', color: colors.gray[900], textAlign: 'center' }}>{n.label}</Text>
              {!!n.who && <Text numberOfLines={1} style={{ fontSize: 11, color: colors.gray[600], marginTop: 1 }}>{n.who}</Text>}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
