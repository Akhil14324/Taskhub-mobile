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
  press: apple(0.2, 0.7),       // finger down: fast and tight
  release: apple(0.34, 0.5),    // finger up: the liquid wobble
  pop: apple(0.38, 0.55),       // check marks, badges
  momentum: apple(0.42, 0.8),   // after a flick, with the release velocity handed in
  layout: apple(0.38, 0.9),     // list items reordering / entering / leaving
};

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
