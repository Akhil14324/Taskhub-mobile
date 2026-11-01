import { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Path, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { useColors } from '../../context/ThemeContext';
import { paletteHex } from '../board/model';

/** The ten chart types a widget can draw: [key, label, icon, orientation]. */
export const CHART_TYPES = [
  ['column', 'Column', 'bar-chart-outline'],
  ['stacked_column', 'Stacked column', 'layers-outline'],
  ['pct_stacked_column', '100% stacked column', 'reorder-four-outline'],
  ['bar', 'Bar', 'menu-outline'],
  ['stacked_bar', 'Stacked bar', 'albums-outline'],
  ['pct_stacked_bar', '100% stacked bar', 'reorder-three-outline'],
  ['line', 'Line', 'trending-up-outline'],
  ['smooth_line', 'Smooth line', 'pulse-outline'],
  ['stacked_line', 'Stacked line', 'stats-chart-outline'],
  ['pct_stacked_line', '100% stacked line', 'analytics-outline'],
];

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/** A smooth path through points (Catmull-Rom turned into cubic curves). */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
const linePath = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');

/**
 * One chart over { categories: [{ key, label }], series: [{ key, label, color, values }] }. `type` is one of
 * CHART_TYPES. Stacked types pile the series up, 100% types show each category's share, line types connect the
 * categories (smooth ones with curves, stacked ones add the series up and fill under each line).
 */
export default function Chart({ data, type = 'column', height = 220, showLegend = true, showLabels = true }) {
  const colors = useColors();
  const [w, setW] = useState(0);
  const cats = data?.categories || [];
  const series = data?.series || [];
  if (!cats.length || !series.length) return <Text style={{ color: colors.gray[500], fontSize: 13 }}>Nothing to show.</Text>;

  const horizontal = type.endsWith('bar');
  const isLine = type.includes('line');
  const pct = type.startsWith('pct_');
  const stacked = type.startsWith('stacked_') || pct;
  const smooth = type === 'smooth_line';
  const tot = cats.map((_, i) => series.reduce((n, s) => n + (s.values[i] || 0), 0));
  const val = (s, i) => (pct ? (tot[i] ? (s.values[i] / tot[i]) * 100 : 0) : s.values[i] || 0);
  // Stacked totals decide the axis; clustered ones use the biggest single value.
  const maxV = pct ? 100 : stacked ? Math.max(...tot) : Math.max(...series.flatMap((s) => s.values));
  // Counts are whole numbers: a small chart gets a tick at every number, a big one four even steps.
  const top = pct ? 100 : maxV <= 4 ? Math.max(1, maxV) : niceMax(maxV);
  const steps = pct || top > 4 ? 4 : top;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => (top / steps) * i);
  const fmt = (v) => (pct ? `${Math.round(v)}%` : String(Math.round(v * 10) / 10));

  const padL = horizontal ? 96 : 34;
  const padB = horizontal ? 18 : 40;
  const padT = 10;
  const padR = 14;
  const plotW = Math.max(40, w - padL - padR);
  const plotH = Math.max(40, height - padT - padB);
  const n = cats.length;
  const hex = (s) => paletteHex(s.color || 'blue');
  const text = colors.gray[600];
  const grid = colors.gray[200];
  const cut = (s, m) => (s.length > m ? `${s.slice(0, m - 1)}…` : s);

  const bars = [];
  if (!isLine) {
    const band = (horizontal ? plotH : plotW) / n;
    const groupW = Math.min(band * 0.72, 64);
    const per = stacked ? groupW : groupW / series.length;
    cats.forEach((c, i) => {
      const start = (horizontal ? padT : padL) + i * band + (band - groupW) / 2;
      let acc = 0;
      series.forEach((s, j) => {
        const v = val(s, i);
        if (!v) return;
        const len = (v / top) * (horizontal ? plotW : plotH);
        const off = stacked ? (acc / top) * (horizontal ? plotW : plotH) : 0;
        acc += stacked ? v : 0;
        const pos = stacked ? start : start + j * per;
        const thick = per - (stacked ? 0 : 2);
        const rect = horizontal
          ? { x: padL + off, y: pos, width: len, height: thick }
          : { x: pos, y: padT + plotH - off - len, width: thick, height: len };
        bars.push(
          <G key={`${c.key}${s.key}`}>
            <Rect {...rect} rx={2} fill={hex(s)} />
            {showLabels && ((horizontal ? len : len) > 18) && thick > 12 && (
              <SvgText x={rect.x + rect.width / 2} y={rect.y + rect.height / 2 + 4} fontSize={11} fill="#fff" textAnchor="middle" stroke="rgba(0,0,0,0.35)" strokeWidth={0.4}>{fmt(v)}</SvgText>
            )}
          </G>
        );
      });
    });
  }

  const paths = [];
  if (isLine) {
    const xAt = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v) => padT + plotH - (v / top) * plotH;
    const cum = series.map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) { let acc = 0; series.forEach((s, j) => { acc += val(s, i); cum[j][i] = stacked ? acc : val(s, i); }); }
    // Draw the top-most (largest) first so the lower ones sit in front.
    [...series.keys()].reverse().forEach((j) => {
      const s = series[j];
      const pts = cum[j].map((v, i) => [xAt(i), yAt(v)]);
      const d = smooth ? smoothPath(pts) : linePath(pts);
      if (stacked) {
        const below = j ? cum[j - 1].map((v, i) => [xAt(i), yAt(v)]).reverse() : [[xAt(n - 1), yAt(0)], [xAt(0), yAt(0)]];
        paths.push(<Path key={`a${s.key}`} d={`${d} L ${below[0][0]} ${below[0][1]} ${below.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(' ')} Z`} fill={hex(s)} opacity={0.28} />);
      }
      paths.push(<Path key={`l${s.key}`} d={d} stroke={hex(s)} strokeWidth={2.2} fill="none" strokeLinejoin="round" />);
      pts.forEach((p, i) => paths.push(<Circle key={`${s.key}${i}`} cx={p[0]} cy={p[1]} r={3.2} fill={colors.white} stroke={hex(s)} strokeWidth={2} />));
    });
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {ticks.map((tv, i) => {
            const pos = horizontal ? padL + (tv / top) * plotW : padT + plotH - (tv / top) * plotH;
            return (
              <G key={i}>
                {horizontal
                  ? <Line x1={pos} y1={padT} x2={pos} y2={padT + plotH} stroke={grid} strokeWidth={1} />
                  : <Line x1={padL} y1={pos} x2={padL + plotW} y2={pos} stroke={grid} strokeWidth={1} />}
                {horizontal
                  ? <SvgText x={pos} y={height - 3} fontSize={10} fill={text} textAnchor="middle">{fmt(tv)}</SvgText>
                  : <SvgText x={padL - 6} y={pos + 3} fontSize={10} fill={text} textAnchor="end">{fmt(tv)}</SvgText>}
              </G>
            );
          })}
          {bars}
          {paths}
          {cats.map((c, i) => {
            if (horizontal) {
              const band = plotH / n;
              return <SvgText key={c.key} x={padL - 6} y={padT + i * band + band / 2 + 4} fontSize={11} fill={colors.gray[700]} textAnchor="end">{cut(c.label, 14)}</SvgText>;
            }
            const x = isLine ? padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW) : padL + (plotW / n) * i + plotW / n / 2;
            // Many categories: show every other label so they do not run into each other.
            if (n > 8 && i % 2) return null;
            const anchor = isLine && n > 1 ? (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') : 'middle';
            return <SvgText key={c.key} x={anchor === 'start' ? padL - 4 : anchor === 'end' ? padL + plotW + 4 : x} y={height - padB + 16} fontSize={11} fill={colors.gray[700]} textAnchor={anchor}>{cut(c.label.replace('Week of ', ''), n > 6 ? 9 : 14)}</SvgText>;
          })}
        </Svg>
      )}
      {showLegend && series.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
          {series.map((s) => (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: hex(s) }} />
              <Text style={{ fontSize: 12, color: colors.gray[700] }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
