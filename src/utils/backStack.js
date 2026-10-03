import { Platform } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Browser/Android back button for the PWA.
 *
 * The app never pushes browser history, so the first Back press leaves the site. Instead we keep one extra
 * history entry ("sentinel") while something can be backed out of: an open pop-up/sheet, or a screen that
 * has somewhere to go back to. Back then pops the sentinel, we close the top pop-up (or go back one screen),
 * and push a fresh sentinel if more is left. With nothing left, Back behaves normally and leaves the app.
 */
const enabled = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.history;

const overlays = [];
let navBackable = false;
let sentinel = false;
let ignorePops = 0;

const backable = () => overlays.length > 0 || navBackable;

function sync() {
  if (!enabled) return;
  if (backable() && !sentinel) {
    window.history.pushState({ taskhubBack: true }, '');
    sentinel = true;
  } else if (!backable() && sentinel) {
    // Closed from the UI rather than with Back: drop the now-useless entry without reacting to it.
    sentinel = false;
    ignorePops += 1;
    window.history.back();
  }
}

if (enabled) {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops -= 1; return; }
    if (!sentinel) return;
    sentinel = false;
    if (overlays.length) {
      overlays.pop().close();
    } else if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
    navBackable = navigationRef.isReady() && navigationRef.canGoBack();
    sync();
  });
}

/** Register an open pop-up. Returns the function that unregisters it. */
export function pushOverlay(close) {
  if (!enabled) return () => {};
  const entry = { close };
  overlays.push(entry);
  sync();
  return () => {
    const i = overlays.indexOf(entry);
    if (i >= 0) overlays.splice(i, 1);
    sync();
  };
}

/** Called whenever navigation state changes. */
export function syncNavigationBack() {
  if (!enabled) return;
  navBackable = navigationRef.isReady() && navigationRef.canGoBack();
  sync();
}
