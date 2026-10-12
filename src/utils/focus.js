// Focus mode bookkeeping that other parts of the app need to read without importing the screen.
let active = false;

/** True while a focus session is running: banners and reminders hold back. */
export const isFocusActive = () => active;
export function setFocusActive(value) { active = !!value; }

const statsKey = (userId) => `th.focus.stats.${userId}`;

/** Minutes and sessions focused today (kept on this device). */
export function focusToday(userId, day) {
  try {
    const saved = JSON.parse(localStorage.getItem(statsKey(userId)) || 'null');
    if (saved && saved.day === day) return saved;
  } catch { /* storage blocked */ }
  return { day, minutes: 0, sessions: 0 };
}

export function addFocus(userId, day, minutes) {
  const next = focusToday(userId, day);
  next.minutes += minutes;
  next.sessions += 1;
  try { localStorage.setItem(statsKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

// Pop-ups that ask for attention (water, stretch) take turns instead of stacking.
const popups = new Set();
export function setPopup(name, open) { if (open) popups.add(name); else popups.delete(name); }
export const anyPopup = () => popups.size > 0;
