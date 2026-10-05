import { motionReduced } from '../utils/feedback';

/**
 * Whether this person asked the app for less motion (Settings > Reduce motion). The operating-system flag is
 * deliberately not consulted: many laptops ship with "animation effects" off, and that silently turned every
 * spring in the app into an instant jump on desktop. Reanimated's own switch is set once in App.jsx.
 */
export default function useReducedMotion() {
  return motionReduced();
}
