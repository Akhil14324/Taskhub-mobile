import { useEffect } from 'react';
import api from '../../api/client';
import { getCurrentRouteName, navigateWhenReady } from '../../navigation/navigationRef';
import { todayYmd } from '../../utils/dates';

// The start screens: only when the app opened on one of these does the timebox take over (not after a
// notification tap or a link that opened something else).
const START_ROUTES = [undefined, 'Main', 'Dashboard', 'Todos', 'ChatList'];

/**
 * First thing every morning: the first time the app opens on a day (from 4 AM, per device), it goes to today's
 * timebox unless it was already sent. Renders nothing.
 */
export default function TimeboxMorning({ userId }) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return undefined;
    const key = `th.timebox.morning.${userId}`;
    const today = todayYmd();
    let seen = null;
    try { seen = window.localStorage.getItem(key); } catch { /* private mode: just ask the server */ }
    if (seen === today || new Date().getHours() < 4) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/timebox/day/today', { __skipOops: true });
        if (cancelled) return;
        try { window.localStorage.setItem(key, today); } catch { /* ignore */ }
        if (res.data.status !== 'sent' && START_ROUTES.includes(getCurrentRouteName())) navigateWhenReady('Timebox');
      } catch { /* offline: try again next time the app opens */ }
    }, 900);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userId]);
  return null;
}
