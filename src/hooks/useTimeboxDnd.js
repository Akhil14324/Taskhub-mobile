import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Ref callback: make a view draggable (web). Its `dataSet={{ tbDrag: JSON }}` says what is being dragged. */
export const makeDraggable = (node) => {
  if (node && node.setAttribute) node.setAttribute('draggable', 'true');
};

/**
 * Drag a task or a block onto a half-hour slot of the schedule (desktop browsers; touch keeps tap-to-place).
 * Draggables carry data-tb-drag = JSON ({ kind: 'task' | 'block', ... }); free slots carry data-tb-slot = the
 * start in minutes. `onDrop(payload, startMinutes)` runs when one is dropped on the other.
 */
export default function useTimeboxDnd({ enabled, onDrop }) {
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof document === 'undefined') return undefined;
    let payload = null;
    let dragging = null;
    let over = null;
    const clear = () => {
      if (over) { over.style.boxShadow = ''; over.style.background = ''; }
      over = null;
    };
    const onStart = (e) => {
      const el = e.target?.closest?.('[data-tb-drag]');
      if (!el) return;
      try { payload = JSON.parse(el.dataset.tbDrag); } catch { payload = null; return; }
      dragging = el;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'timebox');
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(el.closest('[data-tb-row]') || el, 20, 16);
      el.style.opacity = '0.5';
    };
    const onOver = (e) => {
      if (!payload) return;
      const slot = e.target?.closest?.('[data-tb-slot]');
      if (!slot) { clear(); return; }
      e.preventDefault();
      if (over !== slot) {
        clear();
        over = slot;
        slot.style.boxShadow = 'inset 0 0 0 2px #D4621A';
        slot.style.background = 'rgba(212,98,26,0.14)';
      }
    };
    const onDropEvent = (e) => {
      if (!payload) return;
      const slot = e.target?.closest?.('[data-tb-slot]');
      if (!slot) return;
      e.preventDefault();
      const p = payload;
      const start = Number(slot.dataset.tbSlot);
      clear();
      payload = null;
      dropRef.current?.(p, start);
    };
    const onEnd = () => {
      clear();
      if (dragging) dragging.style.opacity = '';
      dragging = null;
      payload = null;
    };
    document.addEventListener('dragstart', onStart);
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDropEvent);
    document.addEventListener('dragend', onEnd);
    return () => {
      document.removeEventListener('dragstart', onStart);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('drop', onDropEvent);
      document.removeEventListener('dragend', onEnd);
      clear();
    };
  }, [enabled]);
}
