import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Keyboard shortcuts for the desktop web app (no-ops on touch devices).
 *
 * `bindings` maps a key name to a handler. Names: a single character in lower case ('q', '/', '?'),
 * a named key ('Escape', 'Enter', 'Delete', 'ArrowDown'), 'mod+k' (Ctrl or Cmd), or a two-key
 * sequence 'g t' (press g, then t within a second). Letters work with or without Shift held,
 * except '?' which needs it. While a text field has focus only Escape and 'mod+' bindings fire.
 * A handler may return `false` to let the browser keep its default behaviour.
 */
export default function useShortcuts(bindings, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof document === 'undefined') return undefined;
    let pending = null;
    let timer = null;

    const clearPending = () => {
      pending = null;
      clearTimeout(timer);
    };

    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.isComposing) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const name = mod ? `mod+${key}` : key;

      if (typing && name !== 'Escape' && !mod) return;
      const map = ref.current || {};

      if (pending) {
        const combo = `${pending} ${name}`;
        clearPending();
        if (map[combo]) {
          if (map[combo](e) !== false) e.preventDefault();
          return;
        }
      }
      if (!mod && Object.keys(map).some((k) => k.startsWith(`${name} `))) {
        pending = name;
        timer = setTimeout(clearPending, 1000);
        return;
      }
      if (map[name]) {
        if (map[name](e) !== false) e.preventDefault();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearPending();
    };
  }, [enabled]);
}

/** What the "?" sheet lists. Keep in step with the bindings registered by the screens. */
export const SHORTCUT_GROUPS = [
  {
    title: 'Go to',
    items: [
      { keys: ['G', 'H'], label: 'Home' },
      { keys: ['G', 'T'], label: 'To-do and business tasks' },
      { keys: ['G', 'C'], label: 'Chat' },
      { keys: ['G', 'A'], label: 'Approvals' },
      { keys: ['G', 'M'], label: 'Team monitor' },
      { keys: ['G', 'N'], label: 'Notifications' },
      { keys: ['G', 'O'], label: 'Organisation' },
      { keys: ['G', 'P'], label: 'Profile' },
    ],
  },
  {
    title: 'To-do list',
    items: [
      { keys: ['Q'], label: 'Quick add' },
      { keys: ['N'], label: 'New to-do' },
      { keys: ['/'], label: 'Search' },
      { keys: ['J'], altKeys: ['K'], label: 'Next / previous to-do' },
      { keys: ['Enter'], label: 'Open the selected to-do' },
      { keys: ['X'], label: 'Complete or reopen' },
      { keys: ['E'], label: 'Edit the title' },
      { keys: ['S'], label: 'Add a sub-task' },
      { keys: ['1'], altKeys: ['4'], label: 'Set priority 1 to 4' },
      { keys: ['D'], label: 'Set the due date' },
      { keys: ['Delete'], label: 'Delete' },
      { keys: ['Esc'], label: 'Close the panel or clear the selection' },
    ],
  },
  {
    title: 'Views',
    items: [
      { keys: ['V', 'L'], label: 'List layout' },
      { keys: ['V', 'B'], label: 'Board layout' },
      { keys: ['V', 'T'], label: 'Timeline layout' },
      { keys: ['['], label: 'Hide or show the sidebar' },
      { keys: ['?'], label: 'This list' },
    ],
  },
];
