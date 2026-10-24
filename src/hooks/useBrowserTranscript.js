import { useCallback, useEffect, useRef, useState } from 'react';
import { startListening, isSpeechSupported } from '../utils/speech';
import { showToast } from '../utils/events';
import api from '../api/client';

const SAVE_EVERY_MS = 15 * 1000;

const ERRORS = {
  'not-allowed': 'Allow the microphone for this site, then try again.',
  'service-not-allowed': 'The browser will not run speech recognition here. Use Chrome or Edge.',
  'audio-capture': 'No microphone was found.',
  network: 'Free mode needs an internet connection.',
};

/**
 * Free transcription: the browser's own speech recognition (Chrome or Edge) writes the meeting down while
 * it is said. Each finished phrase is saved to the meeting every 15 seconds and again when stopped, so a
 * closed tab loses at most the last few seconds. No paid service is used on our side; the browser's speech
 * service does the work. `onSaved(chars)` reports the total length after each save.
 */
export default function useBrowserTranscript({ id, lang, onSaved }) {
  const stopRef = useRef(null);
  const pending = useRef('');
  const queue = useRef(Promise.resolve());
  const timer = useRef(null);
  const clock = useRef(null);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  const supported = isSpeechSupported();

  // Writes whatever has been heard since the last save. Saves run one after another, so the text keeps its order.
  const save = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const text = pending.current.trim();
      if (!text) return;
      pending.current = '';
      try {
        const res = await api.post(`/meeting-notes/${id}/transcript`, { text }, { timeout: 60000 });
        savedRef.current?.(res.data.chars || 0);
      } catch {
        pending.current = `${text} ${pending.current}`; // keep it and try again with the next save
        showToast({ message: 'Could not save what was just heard. It will be saved with the next part.', tone: 'error' });
      }
    });
    return queue.current;
  }, [id]);

  const finish = useCallback(() => {
    clearInterval(timer.current);
    clearInterval(clock.current);
    clock.current = null;
    stopRef.current = null;
    setListening(false);
    setLive('');
    save();
  }, [save]);

  const start = useCallback(() => {
    if (stopRef.current) return true;
    const stop = startListening({
      lang,
      onFinal: (text) => { pending.current = `${pending.current} ${text}`; },
      onText: (text) => setLive(text.split(' ').slice(-12).join(' ')),
      onEnd: finish,
      onError: (code) => {
        const message = ERRORS[code];
        if (message) showToast({ message, tone: 'error' });
      },
    });
    if (!stop) {
      showToast({ message: 'Free mode needs Chrome or Edge. Use the paid mode on this device.', tone: 'error' });
      return false;
    }
    stopRef.current = stop;
    setStartedAt(Date.now());
    setNow(Date.now());
    setListening(true);
    timer.current = setInterval(save, SAVE_EVERY_MS);
    clock.current = setInterval(() => setNow(Date.now()), 1000);
    return true;
  }, [lang, finish, save]);

  const stop = useCallback(() => { stopRef.current?.(); }, []);

  // Stop when the screen goes away; whatever was heard is still saved.
  useEffect(() => () => {
    if (stopRef.current) stopRef.current();
    clearInterval(timer.current);
    clearInterval(clock.current);
  }, []);

  return {
    supported,
    listening,
    live,
    elapsed: listening ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0,
    start,
    stop,
    save,
  };
}
