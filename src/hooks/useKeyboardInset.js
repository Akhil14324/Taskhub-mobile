import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { overlayKeyboardHeight, rememberKeyboard } from '../utils/keyboardMode';

/**
 * Height of the on-screen keyboard overlapping the bottom of the window.
 * - Native: from Keyboard events.
 * - Web: iOS Safari only shrinks the *visual* viewport, so fixed bottom sheets end up
 *   behind the keyboard; measure the gap with window.visualViewport.
 */
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return undefined;
      const vk = typeof navigator !== 'undefined' ? navigator.virtualKeyboard : null;
      const update = () => {
        // In overlay mode (see utils/keyboardMode.js) the page does not shrink, so the keyboard's own rectangle is the truth.
        const gap = Math.max(window.innerHeight - vv.height - vv.offsetTop, overlayKeyboardHeight());
        if (gap > 60) rememberKeyboard(gap);
        setInset(gap > 60 ? Math.round(gap) : 0);
      };
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      if (vk) vk.addEventListener('geometrychange', update);
      update();
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
        if (vk) vk.removeEventListener('geometrychange', update);
      };
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setInset(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener(hideEvt, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
