// "Water" press: for a moment the pressed control's pixels ripple like a disturbed surface. One shared SVG
// displacement filter (#th-water, in public/index.html) is borrowed by the pressed element and its scale is
// driven as a damped wave, so it swells on touch and rings out to flat. Web only; a no-op elsewhere.
let map = null;
let raf = 0;
let owner = null;
let startedAt = 0;
let strength = 0;

function stop() {
  cancelAnimationFrame(raf);
  if (owner) owner.style.filter = '';
  if (map) map.setAttribute('scale', '0');
  owner = null;
}

export function waterPress(node, power = 1) {
  if (typeof document === 'undefined' || !node || !node.style) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  map = map || document.getElementById('th-water-map');
  if (!map) return;
  stop();
  owner = node;
  strength = 11 * power;
  startedAt = performance.now();
  node.style.filter = 'url(#th-water)';
  const tick = (now) => {
    const t = (now - startedAt) / 1000;
    const DUR = 0.75;
    if (t >= DUR) { stop(); return; }
    // swell fast, ring out: amplitude decays while the wave oscillates
    const amp = Math.exp(-t * 5.2) * Math.sin(t * 22) ** 2 + Math.exp(-t * 3.5) * Math.min(1, t * 14) * 0.45;
    map.setAttribute('scale', String(Math.max(0, strength * amp)));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
