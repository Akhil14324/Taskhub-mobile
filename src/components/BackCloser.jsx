import useBackClose from '../hooks/useBackClose';

/** Render-anywhere form of `useBackClose` for screens that inline their own pop-ups. */
export default function BackCloser({ active, onClose }) {
  useBackClose(active, onClose);
  return null;
}
