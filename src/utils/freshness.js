import { useRef } from 'react';

/**
 * Guards a screen that reloads from the server against its own stale answers.
 *
 * A reload that was already on its way when the person changed something carries the OLD state. Showing it
 * puts their change back (a finished task reappearing, a posted comment vanishing) until the next reload
 * fixes it a few seconds later. Wrap every change in `edit(fn)` and every reload in `fresh(request, apply)`:
 * an answer that began before a change, or arrives while one is still saving, is dropped and asked again.
 *
 *   const guard = useFreshness();
 *   const load = () => guard.fresh(() => api.get('/x'), (res) => setData(res.data));
 *   const save = () => guard.edit(() => api.post('/x', body));
 */
export function useFreshness(retryMs = 300) {
  const state = useRef({ inflight: 0, version: 0 });
  const api = useRef(null);
  if (!api.current) {
    api.current = {
      /** Run a change; reloads that overlap it are dropped. */
      async edit(fn) {
        const s = state.current;
        s.inflight += 1;
        s.version += 1;
        try {
          return await fn();
        } finally {
          s.inflight -= 1;
          s.version += 1;
        }
      },
      /** Run a reload; `apply` only sees an answer that no change overlapped. Returns true when applied. */
      async fresh(request, apply, { force = false, tries = 0 } = {}) {
        const s = state.current;
        const startedAt = s.version;
        const res = await request();
        if (!force && tries < 8 && (s.inflight > 0 || s.version !== startedAt)) {
          // Too old to trust: ask again once the change has settled.
          await new Promise((r) => setTimeout(r, retryMs));
          return api.current.fresh(request, apply, { tries: tries + 1 });
        }
        apply(res);
        return true;
      },
    };
  }
  return api.current;
}
