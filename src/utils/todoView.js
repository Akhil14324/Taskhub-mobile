import { useEffect, useState } from 'react';
import { navigationRef } from '../navigation/navigationRef';

// Which to-do view (today | upcoming | inbox | list:<id> | biz:<id> | filters | ...) the To-do screen shows,
// so the sidebar and the phone tab bar can highlight it.
let current = null;
const subs = new Set();

export function setTodoView(view) {
  if (view === current) return;
  current = view;
  subs.forEach((fn) => fn(view));
}

export function useTodoView() {
  const [view, setView] = useState(current);
  useEffect(() => {
    subs.add(setView);
    setView(current);
    return () => { subs.delete(setView); };
  }, []);
  return view;
}

/** The views reached from the phone tab bar; anything else is opened from Browse. */
export const TAB_VIEWS = ['inbox', 'today', 'upcoming'];

/** Show a to-do view from anywhere (sidebar, Browse, palette). */
export function openTodoView(view) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'Todos', params: { view } });
}
