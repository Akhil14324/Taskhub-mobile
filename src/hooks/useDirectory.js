import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

// Shared, lightly cached list of everyone in the organisation (for @mentions and pickers).
let cache = null;
let cacheAt = 0;
let inflight = null;
const TTL_MS = 2 * 60 * 1000;

async function loadDirectory(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = api.get('/org/directory', { __skipOops: true })
      .then((res) => {
        cache = res.data.users || [];
        cacheAt = Date.now();
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidateDirectory() {
  cache = null;
}

export default function useDirectory() {
  const [people, setPeople] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async (force = false) => {
    try {
      setPeople(await loadDirectory(force));
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { people, loading, refresh };
}

/** Case-insensitive match on name or username. */
export function filterPeople(people, query, { excludeIds = [], limit = 8 } = {}) {
  const q = String(query || '').toLowerCase();
  const skip = new Set(excludeIds.map(Number));
  return people
    .filter((p) => !skip.has(Number(p.id)))
    .filter((p) => !q || p.username?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.username?.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.username?.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
