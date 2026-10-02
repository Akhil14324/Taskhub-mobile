import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import useShortcuts from '../hooks/useShortcuts';
import QuickAddSheet from './todos/QuickAddSheet';
import TemplatesSheet from './todos/TemplatesSheet';
import CommandPalette from './CommandPalette';
import Celebration from './engage/Celebration';
import { configureFeedback } from '../utils/feedback';
import { on, openPalette, showToast } from '../utils/events';
import { takeSharedText } from '../utils/shareTarget';
import { todayYmd } from '../utils/dates';

/**
 * Sheets that can be opened from anywhere (a chat message, the command palette, the phone's share
 * sheet) through the event bus in utils/events.js. Mounted once, next to the navigator.
 */
export default function GlobalHost() {
  const { user } = useAuth();
  const [quick, setQuick] = useState(null); // { text, defaults }
  const [templates, setTemplates] = useState(null);
  const [palette, setPalette] = useState(false);

  configureFeedback(user?.preferences);
  useShortcuts({ 'app.palette': () => { openPalette(); } }, !!user);

  useEffect(() => {
    const offs = [
      on('quickadd:open', (p) => setQuick({ text: p?.text || '', defaults: p?.defaults || { due_date: todayYmd() } })),
      on('templates:open', (p) => setTemplates(p || {})),
      on('palette:open', () => setPalette(true)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Something shared to TaskHub from another app becomes a draft to-do.
  useEffect(() => {
    if (!user) return;
    const text = takeSharedText();
    if (text) {
      setQuick({ text, defaults: { due_date: null } });
      showToast({ message: 'Shared to TaskHub. Add a date and save it.', icon: 'share-outline' });
    }
  }, [user]);

  return (
    <>
      <QuickAddSheet visible={!!quick} onClose={() => setQuick(null)} defaults={quick?.defaults || {}} initialText={quick?.text || ''} />
      <TemplatesSheet visible={!!templates} onClose={() => setTemplates(null)} defaults={templates || {}} />
      <CommandPalette visible={palette} onClose={() => setPalette(false)} />
      <Celebration />
    </>
  );
}
