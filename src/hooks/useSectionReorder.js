import { useEffect } from 'react';
import { Platform } from 'react-native';

const MARK_BEFORE = 'inset 0 3px 0 #dc2626';
const MARK_AFTER = 'inset 0 -3px 0 #dc2626';

/**
 * Drag a section by its title to a new place (desktop browsers; on touch use "Move earlier / later").
 *
 * The container holds one wrapper per section marked `dataSet={{ sectionId }}`; the title inside it is
 * the handle (`dataSet={{ sectionHandle: '1' }}`, draggable). A wrapper marked `dataSet={{ sectionTop: '1' }}`
 * (the "No section" group) means "before the first section". onReorder(ids) gets every section id in its new order.
 * To-do rows have their own drag (useWebReorder); the two never start from the same element.
 */
export default function useSectionReorder(containerRef, { enabled, onReorder }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;
    const root = containerRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;

    let dragged = null;
    let mark = null;
    let place = null; // { target: element | null, after: boolean }

    const wrapperOf = (el) => (el && el.closest ? el.closest('[data-section-id]') : null);
    const topOf = (el) => (el && el.closest ? el.closest('[data-section-top]') : null);
    const clear = () => {
      if (mark) mark.style.boxShadow = '';
      mark = null;
    };

    const onDragStart = (e) => {
      const handle = e.target && e.target.closest ? e.target.closest('[data-section-handle]') : null;
      const wrapper = wrapperOf(handle);
      if (!wrapper) return;
      dragged = wrapper;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', wrapper.dataset.sectionId);
      if (e.dataTransfer.setDragImage && handle) e.dataTransfer.setDragImage(handle, 20, 14);
      wrapper.style.opacity = '0.5';
    };

    const onDragOver = (e) => {
      if (!dragged) return;
      const top = topOf(e.target);
      const wrapper = wrapperOf(e.target);
      clear();
      if (wrapper && wrapper !== dragged) {
        e.preventDefault();
        const rect = wrapper.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        place = { target: wrapper, after };
        mark = wrapper;
        wrapper.style.boxShadow = after ? MARK_AFTER : MARK_BEFORE;
      } else if (top) {
        e.preventDefault();
        place = { target: null, after: false }; // before the first section
        mark = top;
        top.style.boxShadow = MARK_AFTER;
      } else if (!wrapper) {
        place = null;
      }
    };

    const onDrop = (e) => {
      if (!dragged || !place) return;
      e.preventDefault();
      const others = [...root.querySelectorAll('[data-section-id]')].filter((w) => w !== dragged);
      let at = 0;
      if (place.target) at = others.indexOf(place.target) + (place.after ? 1 : 0);
      others.splice(at, 0, dragged);
      const ids = others.map((w) => Number(w.dataset.sectionId));
      clear();
      place = null;
      onReorder(ids);
    };

    const onDragEnd = () => {
      if (dragged) dragged.style.opacity = '';
      clear();
      dragged = null;
      place = null;
    };

    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);
    return () => {
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
      onDragEnd();
    };
  }, [containerRef, enabled, onReorder]);
}
