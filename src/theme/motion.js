// Spring physics for every touchable thing (Apple's "response + damping ratio", converted to the
// stiffness / damping / mass Reanimated wants). Damping ratio 1 = no overshoot; below 1 bounces.
// Default to ~1 for UI that just appears; bounce only where a gesture carried momentum.
export function apple(response, ratio = 1, mass = 1) {
  return {
    mass,
    stiffness: mass * (2 * Math.PI / response) ** 2,
    damping: (4 * Math.PI * ratio * mass) / response,
  };
}

export const SPRING = {
  smooth: apple(0.4, 1),        // move / reposition, nothing to overshoot
  sheet: apple(0.34, 0.86),     // sheets and dialogs arriving
  press: apple(0.26, 0.85),     // finger down: a soft, visible compression (not a snap)
  release: apple(0.58, 0.55),   // finger up: one clear overshoot, then rest. Long enough to feel, short enough to stay out of the way
  pop: apple(0.38, 0.55),       // check marks, badges
  momentum: apple(0.42, 0.8),   // after a flick, with the release velocity handed in
  layout: apple(0.42, 0.88),    // list items reordering / entering / leaving
  screen: apple(0.42, 0.9),     // a whole module arriving (tab / route / layout change): quick, it must never feel like waiting
  morph: apple(0.9, 0.9),       // one surface becoming another (capsule gathers into a bubble, flies, unfolds)
  panel: apple(0.55, 0.96),     // sidebars opening and closing
};

/**
 * The same spring as a CSS easing, for animations the browser runs on its compositor (Web Animations API):
 * they keep moving while JavaScript is busy rendering the screen that just arrived. Returns
 * { easing, duration } with the spring's step response sampled into `linear()`; browsers without
 * `linear()` (Safari before 17.2) get a close cubic-bezier. `settle` is how near to rest counts as done.
 */
const cssSprings = new Map();
export function springCss(spring, settle = 0.004) {
  const cached = cssSprings.get(spring);
  if (cached) return cached;
  const w = Math.sqrt(spring.stiffness / spring.mass);
  const z = Math.min(1, spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass)));
  const wd = w * Math.sqrt(1 - z * z);
  const at = (t) => (z >= 1
    ? 1 - Math.exp(-w * t) * (1 + w * t)
    : 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)));
  // Settled once the envelope of the remaining motion is below `settle`.
  const amp = z >= 1 ? 1 : 1 + (z * w) / wd;
  let duration = 0.05;
  while (duration < 2 && amp * Math.exp(-z * w * duration) * (z >= 1 ? 1 + w * duration : 1) > settle) duration += 0.01;
  const N = 40;
  const points = [];
  for (let i = 0; i <= N; i += 1) points.push(i === N ? 1 : +at((duration * i) / N).toFixed(4));
  const linear = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  const out = {
    easing: linear ? `linear(${points.join(', ')})` : 'cubic-bezier(0.2, 0.9, 0.25, 1)',
    duration: Math.round(duration * 1000),
  };
  cssSprings.set(spring, out);
  return out;
}

/** Where a flick would come to rest (Apple's deceleration projection). velocity in px/s. */
export function project(velocity, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Resistance past an edge: the further you pull, the less it follows. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  'worklet';
  const sign = overshoot < 0 ? -1 : 1;
  const o = Math.abs(overshoot);
  return sign * ((o * dimension * constant) / (dimension + constant * o));
}
