import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

/** The sprints of a business with their totals (and velocity), without the task lists. */
export function useSprintList(businessId) {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => {
    if (!businessId) return null;
    try {
      const res = await api.get('/sprints', { params: { business_id: businessId }, __skipOops: true });
      setData(res.data);
      return res.data;
    } catch {
      setData({ sprints: [], velocity: { average: null, completed: [] } });
      return null;
    }
  }, [businessId]);
  useEffect(() => { setData(null); reload(); }, [reload]);
  return { data, reload };
}

/** One sprint with its tasks, backlog, burndown and capacity. */
export function useSprintDetail(sprintId) {
  const [detail, setDetail] = useState(null);
  const reload = useCallback(async () => {
    if (!sprintId) { setDetail(null); return null; }
    try {
      const res = await api.get(`/sprints/${sprintId}`, { __skipOops: true });
      setDetail(res.data);
      return res.data;
    } catch {
      setDetail(null);
      return null;
    }
  }, [sprintId]);
  useEffect(() => { reload(); }, [reload]);
  return { detail, setDetail, reload };
}

/** Which sprint to show first: the running one, else the next planned one. */
export function defaultSprintId(sprints) {
  const pick = (sprints || []).find((s) => s.status === 'active') || (sprints || []).find((s) => s.status === 'planned') || (sprints || [])[0];
  return pick ? pick.id : null;
}
