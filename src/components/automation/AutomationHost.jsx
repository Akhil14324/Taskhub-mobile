import { useEffect, useRef } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useTodos } from '../../context/TodoContext';
import { emit, showToast } from '../../utils/events';
import { featureOn } from '../../utils/features';
import { playReminder, playMeow, playSound } from '../../utils/feedback';
import { navigate, openNotificationTarget } from '../../navigation/navigationRef';

const SENSOR_CHECK_MS = 5 * 60 * 1000;
const LOCATION_EVERY_MS = 60 * 1000;
const MIN_MOVE_M = 60;

const distance = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * Mounted once (in GlobalHost). It does the parts of an automation that only the open app can do (show a
 * message, flash the alert, make a sound, read aloud, vibrate, jump to a screen) and, only when a switched-on
 * profile needs it, tells the server the battery level and where the device is. Nothing is read or sent
 * unless a profile asks for it, and a browser never shares the location without the person allowing it.
 */
export default function AutomationHost() {
  const { user } = useAuth();
  const { subscribe } = useChat();
  const { todos } = useTodos();
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const on = !!user && featureOn(user.preferences, 'automation');
  const lastPlace = useRef(null);
  const lastSent = useRef(0);

  // What the server asks the app to do.
  useEffect(() => {
    if (!on) return undefined;
    return subscribe('automation:effect', (fx) => {
      try {
        switch (fx.kind) {
          case 'toast': showToast({ message: fx.message, icon: 'flash' }); break;
          case 'alert': emit('alert:show', { title: fx.title, message: fx.message }); break;
          case 'sound':
            if (fx.sound === 'meow') playMeow({ attention: true });
            else if (fx.sound === 'done') playSound('done');
            else playReminder();
            break;
          case 'vibrate': if (navigator.vibrate) navigator.vibrate(fx.ms || 300); break;
          case 'speak':
            if ('speechSynthesis' in window && fx.text) {
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(fx.text));
            }
            break;
          case 'open': if (fx.screen === 'Todos' || fx.screen === 'Dashboard' || fx.screen === 'ChatList') navigate('Main', { screen: fx.screen }); else navigate(fx.screen); break;
          case 'open_todo': openNotificationTarget({ type: 'todo_reminder', todoId: fx.todoId, noAlert: true }); break;
          case 'focus': {
            const t = (todosRef.current || []).find((x) => x.id === fx.todoId);
            emit('focus:open', t ? { todo: { id: t.id, title: t.title } } : {});
            break;
          }
          default: break;
        }
      } catch { /* an effect that the browser refuses is not worth an error */ }
    });
  }, [on, subscribe]);

  // Readings from the device, only the ones a switched-on profile needs.
  useEffect(() => {
    if (!on) return undefined;
    let cancelled = false;
    const cleanups = [];

    const send = (body) => api.put('/automation/device', body, { __skipOops: true }).catch(() => {});

    const startBattery = async () => {
      if (!navigator.getBattery) return;
      try {
        const battery = await navigator.getBattery();
        const report = () => send({ battery: Math.round(battery.level * 100), charging: battery.charging });
        report();
        battery.addEventListener('levelchange', report);
        battery.addEventListener('chargingchange', report);
        cleanups.push(() => { battery.removeEventListener('levelchange', report); battery.removeEventListener('chargingchange', report); });
      } catch { /* the browser keeps it private */ }
    };

    const startLocation = async () => {
      if (!navigator.geolocation) return;
      // Never ask on its own: only follow the location if the person already allowed it for this site.
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' });
        if (!perm || perm.state !== 'granted') return;
      } catch { return; }
      const id = navigator.geolocation.watchPosition((pos) => {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const now = Date.now();
        const moved = !lastPlace.current || distance(lastPlace.current, here) > MIN_MOVE_M;
        if (!moved && now - lastSent.current < LOCATION_EVERY_MS * 5) return;
        if (now - lastSent.current < LOCATION_EVERY_MS) return;
        lastPlace.current = here; lastSent.current = now;
        send(here);
      }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
      cleanups.push(() => navigator.geolocation.clearWatch(id));
    };

    let running = { battery: false, location: false };
    const stopAll = () => { cleanups.splice(0).forEach((f) => f()); running = { battery: false, location: false }; };
    const check = async () => {
      try {
        const res = await api.get('/automation/sensors', { __skipOops: true });
        if (cancelled) return;
        const need = res.data;
        if ((need.battery && !running.battery) || (need.location && !running.location) || (!need.battery && running.battery) || (!need.location && running.location)) {
          stopAll();
          if (need.battery) { running.battery = true; await startBattery(); }
          if (need.location) { running.location = true; await startLocation(); }
        }
      } catch { /* try again at the next check */ }
    };
    check();
    const timer = setInterval(check, SENSOR_CHECK_MS);
    return () => { cancelled = true; clearInterval(timer); stopAll(); };
  }, [on]);

  return null;
}
