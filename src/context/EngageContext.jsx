import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';

const EngageContext = createContext(null);

/**
 * Everything that keeps people coming back: the day's streak, who is waiting on you, kudos.
 * `myDay` is refreshed whenever a to-do changes, so the streak ring and the "all clear" state stay live.
 */
export function EngageProvider({ children }) {
  const { user } = useAuth();
  const { subscribe } = useChat();
  const [myDay, setMyDay] = useState(null);
  const [kudosTick, setKudosTick] = useState(0);
  const timer = useRef(null);

  const refreshMyDay = useCallback(async () => {
    try {
      const res = await api.get('/engage/myday', { __skipOops: true });
      setMyDay(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user) { setMyDay(null); return undefined; }
    refreshMyDay();
    const off = subscribe('todo:changed', () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(refreshMyDay, 700);
    });
    const offKudos = subscribe('kudos:new', () => { setKudosTick((n) => n + 1); refreshMyDay(); });
    return () => { clearTimeout(timer.current); off(); offKudos(); };
  }, [user, subscribe, refreshMyDay]);

  const setRest = useCallback(async (rest) => {
    const res = rest ? await api.post('/engage/rest') : await api.delete('/engage/rest');
    setMyDay((d) => ({ ...(d || {}), ...res.data }));
    return res.data;
  }, []);

  const sendKudos = useCallback(async ({ toUserId, todoId, reason, message }) => {
    const res = await api.post('/engage/kudos', { to_user_id: toUserId, todo_id: todoId, reason, message });
    return res.data;
  }, []);

  const loadKudos = useCallback(async (scope = 'company', limit = 30) => {
    const res = await api.get('/engage/kudos', { params: { scope, limit }, __skipOops: true });
    return res.data;
  }, []);

  const loadRecap = useCallback(async (week = 0) => {
    const res = await api.get('/engage/recap', { params: { week }, __skipOops: true });
    return res.data;
  }, []);

  // To-do ids somebody else is held up on until this person acts (for the "waiting on you" badge).
  const waitingIds = useMemo(() => new Set((myDay?.waiting_on_you || []).map((w) => w.todo_id)), [myDay]);

  const value = useMemo(
    () => ({ myDay, refreshMyDay, setRest, sendKudos, loadKudos, loadRecap, waitingIds, kudosTick }),
    [myDay, refreshMyDay, setRest, sendKudos, loadKudos, loadRecap, waitingIds, kudosTick]
  );
  return <EngageContext.Provider value={value}>{children}</EngageContext.Provider>;
}

export function useEngage() {
  const ctx = useContext(EngageContext);
  if (!ctx) throw new Error('useEngage must be used inside EngageProvider');
  return ctx;
}
