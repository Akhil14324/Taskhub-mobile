import { useCallback, useEffect, useRef, useState } from 'react';
import { startListening, isSpeechSupported } from '../utils/speech';
import { showToast } from '../utils/events';

const BARS = 32;

function errorMessage(code) {
  switch (code) {
    case 'not-allowed': return 'Allow the microphone for this site (iPhone: Settings > Safari > Microphone)';
    case 'service-not-allowed': return 'Turn on Dictation and Siri (iPhone: Settings > General > Keyboard > Enable Dictation)';
    case 'no-speech': return 'Did not catch that. Tap the mic and try again';
    case 'audio-capture': return 'No microphone found';
    case 'network': return 'Speech needs an internet connection';
    case 'aborted': return null;
    default: return 'Voice input is not available here';
  }
}

/**
 * Dictation for a text field. `start(currentText, setText)` begins listening; the spoken words are
 * appended to what was already typed and written through setText as they are heard. `live` is just the
 * spoken part (for the live transcript) and `levels` the recent loudness (for the wave).
 */
export default function useVoiceInput({ lang = 'en-IN', onFinish } = {}) {
  const stopRef = useRef(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const [levels, setLevels] = useState(() => Array(BARS).fill(0));

  const stop = useCallback(() => { stopRef.current?.(); }, []);

  const start = useCallback((currentText, setText) => {
    const base = currentText && !/\s$/.test(currentText) ? `${currentText} ` : (currentText || '');
    const end = () => {
      setListening(false);
      setLive('');
      stopRef.current = null;
      finishRef.current?.();
    };
    const stopFn = startListening({
      lang,
      onLevel: (v) => setLevels((prev) => [...prev.slice(1), v]),
      onText: (spoken) => { setLive(spoken); setText(base + spoken); },
      onEnd: end,
      onError: (code) => {
        end();
        const message = errorMessage(code);
        if (message) showToast({ message, tone: 'error' });
      },
    });
    if (stopFn) {
      stopRef.current = stopFn;
      setLive('');
      setLevels(Array(BARS).fill(0));
      setListening(true);
    } else {
      showToast({ message: 'Voice input is not available here. Open TaskHub in Safari, not the home-screen app', tone: 'error' });
    }
  }, [lang]);

  const toggle = useCallback((currentText, setText) => {
    if (stopRef.current) stop(); else start(currentText, setText);
  }, [start, stop]);

  useEffect(() => () => stopRef.current?.(), []);

  return { listening, live, levels, start, stop, toggle, supported: isSpeechSupported() };
}
