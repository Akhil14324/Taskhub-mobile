import { useEffect, useRef } from 'react';
import { pushOverlay } from '../utils/backStack';

/** While `active`, the phone/browser Back button calls `onClose` instead of leaving the app or screen. */
export default function useBackClose(active, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    return pushOverlay(() => closeRef.current?.());
  }, [active]);
}
