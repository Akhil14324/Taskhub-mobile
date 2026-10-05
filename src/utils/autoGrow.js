/** Makes a multiline web TextInput as tall as its text (react-native-web's does not grow, and never shrinks back). */
export default function autoGrow(el) {
  if (!el || !el.style) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/** True while a touch screen's on-screen keyboard is up (a hardware keyboard on a tablet does not shrink the view). */
export function virtualKeyboardUp() {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return false;
  const vv = window.visualViewport;
  if (vv && window.innerHeight - vv.height > 120) return true;
  const top = (window.__maxInnerHeight = Math.max(window.__maxInnerHeight || 0, window.innerHeight));
  return window.innerHeight < top * 0.85; // Android resizes the page instead
}
