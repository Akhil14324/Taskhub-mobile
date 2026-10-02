// "Share to TaskHub": the installed PWA is listed in the phone's share sheet (manifest share_target, GET).
// The browser opens /share-target?title=&text=&url=; we keep what was shared and return to the app's root,
// and GlobalHost opens quick add with it once the person is signed in.
const KEY = 'taskhub.share';

export function captureShare() {
  if (typeof window === 'undefined' || window.location.pathname !== '/share-target') return;
  try {
    const q = new URLSearchParams(window.location.search);
    const parts = [q.get('title'), q.get('text'), q.get('url')].map((v) => (v || '').trim()).filter(Boolean);
    // Many apps put the link inside the text as well: drop the repeats.
    const unique = parts.filter((p, i) => !parts.some((o, j) => j !== i && o.includes(p) && o.length > p.length));
    const text = [...new Set(unique)].join(' ').trim();
    if (text) window.sessionStorage.setItem(KEY, text);
  } catch { /* storage unavailable */ }
  try { window.history.replaceState({}, '', '/'); } catch { /* ignore */ }
}

export function takeSharedText() {
  if (typeof window === 'undefined') return null;
  try {
    const text = window.sessionStorage.getItem(KEY);
    if (text) window.sessionStorage.removeItem(KEY);
    return text || null;
  } catch {
    return null;
  }
}

captureShare();
