import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from './secureStorage';

/**
 * Every keyboard shortcut in the app, by action id. A combo is a string of chords separated by a
 * space ("g t" = press G, then T); a chord is modifiers plus a key joined by "+" ("alt+space",
 * "mod+shift+k"). `mod` means Ctrl or Cmd. People can replace the combos of any action in the
 * shortcuts window; the choice is stored on the device.
 *
 * `scope` says where an action is live: `global` works on every page, the others only on that page.
 * Two actions clash when they can be live together (see `scopesOverlap`).
 */
export const ACTIONS = [
  { id: 'app.palette', group: 'Search and commands', label: 'Open the command palette', scope: 'global', combos: ['mod+k'] },
  { id: 'app.help', group: 'Search and commands', label: 'Show the keyboard shortcuts', scope: 'global', combos: ['?'] },
  { id: 'nav.home', group: 'Go to', label: 'Home', scope: 'global', combos: ['g h'] },
  { id: 'nav.progress', group: 'Go to', label: 'Progress', scope: 'global', combos: ['g d'] },
  { id: 'nav.todos', group: 'Go to', label: 'To-do and business tasks', scope: 'global', combos: ['g t'] },
  { id: 'nav.chat', group: 'Go to', label: 'Chat', scope: 'global', combos: ['g c'] },
  { id: 'nav.approvals', group: 'Go to', label: 'Approvals', scope: 'global', combos: ['g a'] },
  { id: 'nav.monitor', group: 'Go to', label: 'Team monitor', scope: 'global', combos: ['g m'] },
  { id: 'nav.notifications', group: 'Go to', label: 'Notifications', scope: 'global', combos: ['g n'] },
  { id: 'nav.org', group: 'Go to', label: 'Organisation', scope: 'global', combos: ['g o'] },
  { id: 'nav.profile', group: 'Go to', label: 'Profile and settings', scope: 'global', combos: ['g p'] },

  { id: 'todo.quickAdd', group: 'To-do list', label: 'Quick add', scope: 'todos', combos: ['q'] },
  { id: 'todo.new', group: 'To-do list', label: 'New to-do', scope: 'todos', combos: ['n'] },
  { id: 'todo.search', group: 'To-do list', label: 'Search', scope: 'todos', combos: ['/'] },
  { id: 'todo.next', group: 'To-do list', label: 'Next to-do', scope: 'todos', combos: ['j', 'ArrowDown'] },
  { id: 'todo.prev', group: 'To-do list', label: 'Previous to-do', scope: 'todos', combos: ['k', 'ArrowUp'] },
  { id: 'todo.open', group: 'To-do list', label: 'Open the selected to-do', scope: 'todos', combos: ['Enter', 'e'] },
  { id: 'todo.due', group: 'To-do list', label: 'Open it to set the due date', scope: 'todos', combos: ['d'] },
  { id: 'todo.complete', group: 'To-do list', label: 'Complete or reopen', scope: 'todos', combos: ['x'] },
  { id: 'todo.subtask', group: 'To-do list', label: 'Add a sub-task', scope: 'todos', combos: ['s'] },
  { id: 'todo.delete', group: 'To-do list', label: 'Delete', scope: 'todos', combos: ['Delete', 'Backspace'] },
  { id: 'todo.p1', group: 'To-do list', label: 'Priority 1 (urgent)', scope: 'todos', combos: ['1'] },
  { id: 'todo.p2', group: 'To-do list', label: 'Priority 2', scope: 'todos', combos: ['2'] },
  { id: 'todo.p3', group: 'To-do list', label: 'Priority 3', scope: 'todos', combos: ['3'] },
  { id: 'todo.p4', group: 'To-do list', label: 'Priority 4', scope: 'todos', combos: ['4'] },
  { id: 'todo.sidebar', group: 'To-do list', label: 'Hide or show the lists panel', scope: 'todos', combos: ['['] },
  { id: 'view.list', group: 'To-do layouts', label: 'List layout', scope: 'todos', combos: ['v l'] },
  { id: 'view.board', group: 'To-do layouts', label: 'Board layout', scope: 'todos', combos: ['v b'] },
  { id: 'view.calendar', group: 'To-do layouts', label: 'Calendar layout', scope: 'todos', combos: ['v c'] },
  { id: 'view.timeline', group: 'To-do layouts', label: 'Timeline layout', scope: 'todos', combos: ['v t'] },

  { id: 'cal.today', group: 'Calendar', label: 'Jump to today', scope: 'calendar', combos: ['t'] },
  { id: 'cal.prev', group: 'Calendar', label: 'Previous period', scope: 'calendar', combos: ['ArrowLeft'] },
  { id: 'cal.next', group: 'Calendar', label: 'Next period', scope: 'calendar', combos: ['ArrowRight'] },
  { id: 'cal.month', group: 'Calendar', label: 'Month view', scope: 'calendar', combos: ['c m'] },
  { id: 'cal.week', group: 'Calendar', label: 'Week view', scope: 'calendar', combos: ['c w'] },
  { id: 'cal.day', group: 'Calendar', label: 'Day view', scope: 'calendar', combos: ['c d'] },
  { id: 'cal.agenda', group: 'Calendar', label: 'Agenda view', scope: 'calendar', combos: ['c a'] },

  { id: 'chat.next', group: 'Chat', label: 'Next conversation', scope: 'chat', combos: ['ArrowDown'] },
  { id: 'chat.prev', group: 'Chat', label: 'Previous conversation', scope: 'chat', combos: ['ArrowUp'] },

  { id: 'approvals.next', group: 'Approvals', label: 'Next item', scope: 'approvals', combos: ['j', 'ArrowDown'] },
  { id: 'approvals.prev', group: 'Approvals', label: 'Previous item', scope: 'approvals', combos: ['k', 'ArrowUp'] },
  { id: 'approvals.approve', group: 'Approvals', label: 'Approve the selected item', scope: 'approvals', combos: ['a'] },
  { id: 'approvals.decline', group: 'Approvals', label: 'Decline the selected item', scope: 'approvals', combos: ['r'] },
];

/** Keys that work as they always did and cannot be reassigned. */
export const FIXED = [
  { keys: 'Esc', label: 'Close a window, dialog or the open panel' },
  { keys: 'Tab / Shift+Tab', label: 'Move to the next / previous button' },
  { keys: 'Enter / Space', label: 'Press the focused button' },
  { keys: 'Enter', label: 'In a dialog: confirm' },
  { keys: 'Enter / Shift+Enter', label: 'Chat: send / new line' },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
export const actionById = (id) => BY_ID.get(id);

/** Can a "page" action and another be live at the same moment? */
export function scopesOverlap(a, b) {
  if (a === 'global' || b === 'global' || a === b) return true;
  return (a === 'todos' && b === 'calendar') || (a === 'calendar' && b === 'todos');
}

// ---- combo text ---------------------------------------------------------------

const MOD_ORDER = ['mod', 'ctrl', 'alt', 'shift', 'meta'];
const KEY_NAMES = { ' ': 'space', Spacebar: 'space' };
const isMac = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/** The chord a key event makes, or null for a bare modifier key. */
export function chordOf(e) {
  const raw = KEY_NAMES[e.key] || e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified'].includes(raw)) return null;
  const key = raw.length === 1 ? raw.toLowerCase() : raw;
  const mods = [];
  if (e.ctrlKey && e.metaKey) { mods.push('ctrl', 'meta'); } else if (e.ctrlKey || e.metaKey) mods.push('mod');
  if (e.altKey) mods.push('alt');
  // Shift on a printable symbol is already in the key ("?" is shift+/); only letters, digits and named keys carry it.
  if (e.shiftKey && (raw.length > 1 || /[a-z0-9]/i.test(raw))) mods.push('shift');
  return [...MOD_ORDER.filter((m) => mods.includes(m)), key].join('+');
}

export const splitCombo = (combo) => String(combo).trim().split(/\s+/).filter(Boolean);

const KEY_LABEL = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Delete: 'Del', ' ': 'Space', space: 'Space',
};
/** "alt+space" -> ['Alt', 'Space'] */
export function chordKeys(chord) {
  return chord.split('+').map((p) => {
    if (p === 'mod') return isMac() ? 'Cmd' : 'Ctrl';
    if (p === 'ctrl') return 'Ctrl';
    if (p === 'meta') return isMac() ? 'Cmd' : 'Win';
    if (p === 'alt') return isMac() ? 'Option' : 'Alt';
    if (p === 'shift') return 'Shift';
    return KEY_LABEL[p] || (p.length === 1 ? p.toUpperCase() : p);
  });
}
/** "g t" -> "G then T"; "alt+space" -> "Alt + Space" */
export function comboText(combo) {
  return splitCombo(combo).map((c) => chordKeys(c).join(' + ')).join(' then ');
}
/** Short text for a hint next to a menu entry: the first combo of the action, or ''. */
export function hintText(id) {
  const first = effective(id)[0];
  return first ? splitCombo(first).map((c) => chordKeys(c).join('+')).join(' ') : '';
}

// ---- the store ----------------------------------------------------------------

const STORAGE_KEY = 'shortcuts.custom';
let custom = {}; // id -> combos[] (an empty array = switched off)
const listeners = new Set();
let version = 0;

const emit = () => { version += 1; listeners.forEach((l) => l()); };
const persist = () => { SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(custom)).catch(() => {}); };

SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.keys(parsed).forEach((id) => { if (!BY_ID.has(id) || !Array.isArray(parsed[id])) delete parsed[id]; });
    custom = parsed;
    emit();
  } catch (e) { /* corrupted: use the defaults */ }
}).catch(() => {});

export function effective(id) {
  if (custom[id]) return custom[id];
  return BY_ID.get(id)?.combos || [];
}
export const isCustomised = (id) => !!custom[id];

export function setCombos(id, combos) {
  custom = { ...custom, [id]: combos };
  persist();
  emit();
}
export function resetAction(id) {
  const next = { ...custom };
  delete next[id];
  custom = next;
  persist();
  emit();
}
export function resetAll() {
  custom = {};
  persist();
  emit();
}

/** Re-renders the component whenever any shortcut changes. */
export function useShortcutVersion() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version, () => 0);
}

/** Hint text for an action that stays current when the person changes the shortcut. */
export function useHint() {
  useShortcutVersion();
  return hintText;
}

/** One chord sequence is a start of another (or the same): they could not tell apart. */
const prefixClash = (a, b) => {
  const x = splitCombo(a); const y = splitCombo(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) if (x[i] !== y[i]) return false;
  return true;
};

/** The other action that already uses this combo (or a prefix / extension of it) where both can be live. */
export function findClash(id, combo) {
  const me = BY_ID.get(id);
  for (const other of ACTIONS) {
    if (other.id === id || !scopesOverlap(me.scope, other.scope)) continue;
    if (effective(other.id).some((c) => prefixClash(c, combo))) return other;
  }
  return null;
}

/** Take the combo (and any that overlap it) away from another action. */
export function stealCombo(fromId, combo) {
  setCombos(fromId, effective(fromId).filter((c) => !prefixClash(c, combo)));
}

// ---- dispatcher: one keyboard listener for the whole app ----------------------

const instances = new Set(); // { current: { bindings, enabled } } refs of mounted useShortcuts calls
let pending = [];
let pendingTimer = null;
let installed = false;

const clearPending = () => { pending = []; clearTimeout(pendingTimer); };

function onKey(e) {
  if (e.defaultPrevented || e.isComposing) return;
  const chord = chordOf(e);
  if (!chord) return;
  const el = document.activeElement;
  const tag = el?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
  const hasMod = /(^|\+)(mod|ctrl|meta|alt)\+/.test(chord);
  if (typing && chord !== 'Escape' && !hasMod) return;
  // Enter / Space on a focused button presses that button, not a shortcut.
  const onButton = el && el !== document.body && (el.getAttribute?.('role') === 'button' || el.getAttribute?.('role') === 'link' || tag === 'BUTTON' || tag === 'A');
  if (onButton && (chord === 'Enter' || chord === 'space')) return;

  const live = [...instances].map((r) => r.current).filter((c) => c && c.enabled).reverse(); // page handlers first
  const seq = [...pending, chord];
  let longer = false;
  for (const inst of live) {
    for (const id of Object.keys(inst.bindings)) {
      for (const combo of (BY_ID.has(id) ? effective(id) : [id])) {
        const parts = splitCombo(combo);
        if (parts.length < seq.length || !seq.every((c, i) => c === parts[i])) continue;
        if (parts.length > seq.length) { longer = true; continue; }
        clearPending();
        if (inst.bindings[id](e) !== false) { e.preventDefault(); return; }
      }
    }
  }
  if (longer) {
    pending = seq;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(clearPending, 1000);
    e.preventDefault();
    return;
  }
  clearPending();
}

export function registerShortcuts(ref) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => {};
  instances.add(ref);
  if (!installed) { document.addEventListener('keydown', onKey); installed = true; }
  return () => { instances.delete(ref); };
}
