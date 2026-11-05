import { useEffect } from 'react';
import { onBusy } from '../utils/busy';
import { BRAND } from '../theme/theme';

const SHOW_AFTER_MS = 120; // fast requests never flash the bar
const MIN_SHOW_MS = 400;   // once shown it stays long enough to be seen

const CSS = `
#th-busybar{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483646;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .18s ease-out}
#th-busybar.on{opacity:1}
#th-busybar>i{position:absolute;top:0;bottom:0;left:0;width:40%;border-radius:2px;background:${BRAND};animation:th-busy 1.05s ease-in-out infinite}
@keyframes th-busy{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
html.th-busy, html.th-busy *{cursor:progress !important}
@media (prefers-reduced-motion: reduce){#th-busybar>i{animation-duration:2.4s}}
`;

/**
 * A thin bar across the top of the screen while something the person did is waiting on the server
 * (every request in api/client.js without `__skipOops`), and a "progress" mouse cursor.
 * It is a plain element on document.body, not a React Native View: react-native-web gives every View
 * `z-index: 0`, which trapped the old bar under the screens, and it is switched on and off directly by the
 * busy counter, so no React render (or a busy JS thread) can hold it back.
 */
export default function BusyBar() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (!document.getElementById('th-busybar-css')) {
      const style = document.createElement('style');
      style.id = 'th-busybar-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const bar = document.createElement('div');
    bar.id = 'th-busybar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Working');
    bar.appendChild(document.createElement('i'));
    document.body.appendChild(bar);

    let showTimer = null;
    let hideTimer = null;
    let shownAt = 0;
    let on = false;
    const show = () => { on = true; shownAt = Date.now(); bar.classList.add('on'); document.documentElement.classList.add('th-busy'); };
    const hide = () => { on = false; bar.classList.remove('on'); document.documentElement.classList.remove('th-busy'); };
    const off = onBusy((n) => {
      if (n > 0) {
        clearTimeout(hideTimer); hideTimer = null;
        if (!on && !showTimer) showTimer = setTimeout(() => { showTimer = null; show(); }, SHOW_AFTER_MS);
      } else {
        clearTimeout(showTimer); showTimer = null;
        if (on && !hideTimer) hideTimer = setTimeout(() => { hideTimer = null; hide(); }, Math.max(0, MIN_SHOW_MS - (Date.now() - shownAt)));
      }
    });
    return () => { off(); clearTimeout(showTimer); clearTimeout(hideTimer); hide(); bar.remove(); };
  }, []);
  return null;
}
