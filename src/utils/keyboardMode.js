// Android Chrome normally shrinks the whole page when the keyboard opens (the app asks for that with
// interactive-widget=resizes-content, which chat and forms rely on). Re-laying out a full board around a
// keyboard that is still sliding in stalls painting for about a second, so a dialog that grows out of the
// to-do bar could not animate. While such a dialog is open the keyboard is switched to overlay mode instead
// (the VirtualKeyboard API): nothing is re-laid out, the keyboard just covers the page, and the dialog lifts
// itself by the keyboard's height. Browsers without the API (iOS Safari) are unchanged.

let holds = 0;
let remembered = 0;

const api = () => (typeof navigator !== 'undefined' && navigator.virtualKeyboard ? navigator.virtualKeyboard : null);

/** Keep the keyboard over the page until the returned function is called. Safe to call more than once. */
export function holdKeyboardOverlay() {
  const vk = api();
  if (!vk) return () => {};
  holds += 1;
  try { vk.overlaysContent = true; } catch { /* leave the page as it was */ }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds = Math.max(0, holds - 1);
    if (!holds) { try { vk.overlaysContent = false; } catch { /* nothing to undo */ } }
  };
}

export const overlayActive = () => holds > 0 && !!api();

/** The keyboard's height from the VirtualKeyboard API, only while it overlays the page. */
export function overlayKeyboardHeight() {
  const vk = api();
  return vk && vk.overlaysContent ? Math.round(vk.boundingRect.height) : 0;
}

export function rememberKeyboard(height) {
  if (height > 120) remembered = height;
}

/** How tall the keyboard probably is before it has shown (the last one seen, else a typical phone's). */
export function expectedKeyboard(windowHeight) {
  return remembered || Math.round(windowHeight * 0.36);
}
