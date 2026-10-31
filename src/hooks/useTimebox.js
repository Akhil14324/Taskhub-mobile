import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { useChat } from '../context/ChatContext';
import { showToast } from '../utils/events';
import { emptyBox } from '../components/timebox/model';

/**
 * One day's timebox (GET/PUT /api/timebox/day/:date). Edits apply at once and are saved 700 ms after the last
 * change (and before leaving the day), so typing never waits on the network. `userId` reads someone below you.
 */
export default function useTimebox(date, userId = null) {
  const { subscribe } = useChat();
  const [data, setData] = useState(null);
  const [box, setBox] = useState(emptyBox());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const dirty = useRef(false);
  const timer = useRef(null);
  const lastSave = useRef(0);
  const latest = useRef({ date, box });
  latest.current = { date, box };

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/timebox/day/${date}`, { params: userId ? { user_id: userId } : {}, __skipOops: true });
      setData(res.data);
      setError(null);
      if (!dirty.current) setBox(res.data.box || emptyBox());
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not load this timebox');
    }
  }, [date, userId]);

  const save = useCallback(async (forDate = latest.current.date, forBox = latest.current.box) => {
    clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    lastSave.current = Date.now();
    setSaving(true);
    try {
      const res = await api.put(`/timebox/day/${forDate}`, forBox, { __skipOops: true });
      if (forDate === latest.current.date) setData(res.data);
      if (res.data.warnings?.length) showToast({ message: res.data.warnings[0], icon: 'alert-circle-outline' });
      return true;
    } catch (e) {
      dirty.current = true;
      showToast({ message: e?.response?.data?.error || 'Not saved. It will try again with your next change.', icon: 'cloud-offline-outline' });
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  // A new day: save what was typed on the old one, then load.
  useEffect(() => {
    setData(null);
    load();
    return () => { if (dirty.current) save(latest.current.date, latest.current.box); };
  }, [date, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Another device changed this day. The echo of this screen's own save is ignored: reloading would drop what is
  // only on screen so far (an empty block the server does not store yet).
  useEffect(() => subscribe('timebox:changed', (p) => {
    if (p?.date !== date || (p.user_id && p.user_id !== userId)) return;
    if (dirty.current || Date.now() - lastSave.current < 5000) return;
    load();
  }), [subscribe, date, userId, load]);

  const update = useCallback((fn) => {
    setBox((b) => {
      const next = typeof fn === 'function' ? fn(b) : fn;
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => save(latest.current.date, next), 700);
      return next;
    });
  }, [save]);

  const send = useCallback(async () => {
    if (!(await save())) return false;
    try {
      const res = await api.post(`/timebox/day/${date}/send`);
      setData(res.data);
      return true;
    } catch (e) {
      showToast({ message: e?.response?.data?.error || 'Could not send it', icon: 'alert-circle-outline' });
      return false;
    }
  }, [date, save]);

  return { data, box, update, saving, error, send, reload: load };
}
