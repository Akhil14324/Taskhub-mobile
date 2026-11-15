import { useEffect, useState } from 'react';
import api from '../api/client';

// How much each person is carrying (open, late, due in the next 7 days), from GET /org/load. Counts only.
// Shared and cached for a minute, so every person picker shows the same numbers without asking again.
let cache = null;
let cacheAt = 0;
let inflight = null;
const TTL_MS = 60 * 1000;

function fetchLoad() {
  if (cache && Date.now() - cacheAt < TTL_MS) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api.get('/org/load', { __skipOops: true })
      .then((res) => { cache = res.data.load || {}; cacheAt = Date.now(); return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** { [userId]: { open, late, week } }; empty until the first answer. */
export default function useLoad(active = true) {
  const [load, setLoad] = useState(cache || {});
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    fetchLoad().then((l) => live && setLoad(l)).catch(() => {});
    return () => { live = false; };
  }, [active]);
  return load;
}

/** "5 open · 2 late · 3 this week" (this week = due in the next 7 days), or "Nothing open" for someone with room. */
export function loadText(l) {
  if (!l || !l.open) return 'Nothing open';
  return [`${l.open} open`, l.late ? `${l.late} late` : null, l.week ? `${l.week} this week` : null].filter(Boolean).join(' · ');
}
