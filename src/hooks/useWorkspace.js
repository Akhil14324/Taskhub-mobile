import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

// One business's epics, releases and WIP limits, shared by every screen that shows them.
const cache = new Map(); // businessId -> overview
const listeners = new Set();

function publish(overview) {
  cache.set(overview.business_id, overview);
  listeners.forEach((fn) => fn(overview));
}

/** Epics, releases and work-in-progress limits of a business. `apply` takes any response that carries a fresh overview. */
export default function useWorkspace(businessId) {
  const [data, setData] = useState(() => (businessId ? cache.get(businessId) || null : null));

  const reload = useCallback(async () => {
    if (!businessId) return null;
    try {
      const res = await api.get('/workspace/overview', { params: { business_id: businessId }, __skipOops: true });
      publish(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [businessId]);

  useEffect(() => {
    setData(businessId ? cache.get(businessId) || null : null);
    const onChange = (next) => { if (next.business_id === businessId) setData(next); };
    listeners.add(onChange);
    reload();
    return () => { listeners.delete(onChange); };
  }, [businessId, reload]);

  const apply = useCallback((next) => { if (next?.business_id) publish(next); }, []);
  return { data, reload, apply };
}
