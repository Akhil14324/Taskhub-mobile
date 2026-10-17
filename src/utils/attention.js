import { playReminder } from './feedback';

/**
 * Ways a wellbeing reminder (water, stretch) gets noticed when people tend to wave it away:
 *  - the reminder chime (the "reminder sound" setting, on by default),
 *  - when TaskHub is in a background tab or minimised: a system notification that stays until it is
 *    dealt with (only if notifications are already allowed; this never asks for permission), and
 *  - the browser tab's title flashing until the person comes back.
 * All of it is local to this device; nothing goes to the server.
 */
let flashTimer = null;
let baseTitle = null;

function stopFlash() {
  if (flashTimer) clearInterval(flashTimer);
  flashTimer = null;
  if (baseTitle !== null && typeof document !== 'undefined') document.title = baseTitle;
  baseTitle = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (document.visibilityState === 'visible') stopFlash();
}

/** Alternate the tab title with `text` until the page is looked at again. */
export function flashTitle(text) {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible' && document.hasFocus?.()) return;
  stopFlash();
  baseTitle = document.title;
  let on = false;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? text : baseTitle;
  }, 1000);
  document.addEventListener('visibilitychange', onVisible);
}

async function systemNotification(title, body, tag) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const options = { body, tag, renotify: true, requireInteraction: true, icon: '/icon-192.png', badge: '/favicon-48.png', data: { kind: tag } };
    if (reg?.showNotification) await reg.showNotification(title, options);
    else new Notification(title, options); // eslint-disable-line no-new
  } catch { /* notifications unavailable */ }
}

/** Ask for attention: chime, title flash and (in the background) a system notification. */
export function grabAttention({ title, body, tag = 'wellbeing', chime = true }) {
  if (chime) playReminder();
  flashTitle(title);
  systemNotification(title, body, tag);
}
