import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { showToast } from '../utils/events';
import { todayYmd } from '../utils/dates';

// The one running timer a person can have, shared by the task window, the Time tab and the header pill.
let state = { timer: null, loaded: false };
const listeners = new Set();

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export async function loadTimer() {
  try {
    const today = todayYmd();
    const res = await api.get('/time/mine', { params: { from: today, to: today }, __skipOops: true });
    set({ timer: res.data.timer, loaded: true });
  } catch {
    set({ loaded: true });
  }
}

export async function startTimer(todoId) {
  try {
    const res = await api.post('/time/timer/start', { todo_id: todoId });
    set({ timer: res.data.timer });
    showToast({ message: 'Timer started', icon: 'timer-outline' });
    return true;
  } catch (err) {
    showToast({ message: err.response?.data?.error || 'Could not start the timer', icon: 'alert-circle' });
    return false;
  }
}

export async function stopTimer(note = '') {
  try {
    await api.post('/time/timer/stop', { note });
    set({ timer: null });
    showToast({ message: 'Time logged. A manager will review it.', icon: 'timer-outline' });
    return true;
  } catch (err) {
    showToast({ message: err.response?.data?.error || 'Could not stop the timer', icon: 'alert-circle' });
    return false;
  }
}

/** The running timer ({ todo_id, title, started_at } or null) and a way to start or stop it. */
export default function useTimer() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(state);
    if (!state.loaded) loadTimer();
    return () => { listeners.delete(setSnapshot); };
  }, []);
  const start = useCallback((todoId) => startTimer(todoId), []);
  const stop = useCallback((note) => stopTimer(note), []);
  return { timer: snapshot.timer, start, stop, reload: loadTimer };
}
