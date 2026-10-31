import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { useChat } from '../context/ChatContext';

// The boards the person may see (GET /api/boards), shared by the sidebar and the Boards home, refreshed when
// any board changes shape (board:changed).
let cache = null;
const listeners = new Set();
let inflight = null;

async function load() {
  if (!inflight) {
    inflight = api.get('/boards', { __skipOops: true })
      .then((res) => {
        cache = res.data.boards || [];
        listeners.forEach((fn) => fn(cache));
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function refreshBoards() {
  return load().catch(() => cache);
}

// The catalog of column types (GET /api/boards/catalog) changes only with a deploy: fetched once per session.
let catalog = null;
let catalogInflight = null;
export function loadCatalog() {
  if (catalog) return Promise.resolve(catalog);
  if (!catalogInflight) {
    catalogInflight = api.get('/boards/catalog', { __skipOops: true })
      .then((res) => { catalog = res.data; return catalog; })
      .finally(() => { catalogInflight = null; });
  }
  return catalogInflight;
}

export function useCatalog() {
  const [value, setValue] = useState(catalog);
  useEffect(() => {
    let alive = true;
    if (!catalog) loadCatalog().then((c) => alive && setValue(c)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return value;
}

export default function useBoards() {
  const { subscribe } = useChat();
  const [boards, setBoards] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    listeners.add(setBoards);
    load().catch(() => {}).finally(() => setLoading(false));
    return () => { listeners.delete(setBoards); };
  }, []);

  useEffect(() => subscribe('board:changed', () => { load().catch(() => {}); }), [subscribe]);

  const refresh = useCallback(() => refreshBoards(), []);
  return { boards, loading, refresh };
}
