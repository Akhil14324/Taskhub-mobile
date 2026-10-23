import { PALETTE, frameSize } from './sprites';

const pathCache = new WeakMap();
/** One path per colour, each pixel run on a row merged into one rectangle. */
function paths(rows) {
  let out = pathCache.get(rows);
  if (out) return out;
  const byColour = {};
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x += 1; continue; }
      let n = 1;
      while (row[x + n] === ch) n += 1;
      if (!byColour[ch]) byColour[ch] = [];
      byColour[ch].push(`M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  out = Object.keys(byColour).map((ch) => ({ ch, d: byColour[ch].join('') }));
  pathCache.set(rows, out);
  return out;
}

/** A pixel-art frame as an SVG (web only). `palette` maps the frame's characters to colours. */
export function Sprite({ rows, scale, flip, style, palette = PALETTE }) {
  const { w, h } = frameSize(rows);
  return (
    <svg
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', transform: flip ? 'scaleX(-1)' : undefined, ...style }}
      aria-hidden="true"
    >
      {paths(rows).map((p) => <path key={p.ch} fill={palette[p.ch] || '#000'} d={p.d} />)}
    </svg>
  );
}
