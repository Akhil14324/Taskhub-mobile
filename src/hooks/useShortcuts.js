import { useEffect, useRef } from 'react';
import { registerShortcuts, ACTIONS, FIXED } from '../utils/shortcutRegistry';

/**
 * Keyboard shortcuts for the desktop web app (no-ops on touch devices).
 *
 * `bindings` maps an action id from `utils/shortcutRegistry.js` ('todo.quickAdd', 'nav.home') to its
 * handler. The keys themselves come from the registry, so people can change them in the shortcuts
 * window. The literal name 'Escape' is also accepted (always Esc, not changeable). While a text field
 * has focus only combos with Ctrl / Cmd / Alt and Esc fire. A handler may return `false` to let the
 * browser keep its default behaviour (and let another handler have the key).
 */
export default function useShortcuts(bindings, enabled = true) {
  const ref = useRef({ bindings, enabled });
  ref.current = { bindings, enabled };
  useEffect(() => registerShortcuts(ref), []);
}

export { ACTIONS, FIXED };
