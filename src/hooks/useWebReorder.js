import { useEffect } from 'react';
import { Platform } from 'react-native';

const DROP_MARK = 'inset 0 2px 0 #dc2626';
const DROP_MARK_AFTER = 'inset 0 -2px 0 #dc2626';

/**
 * Drag-and-drop reordering for web (desktop browsers; touch screens keep the swipe gestures).
 *
 * The container holds rows marked `dataSet={{ todoRow: <id>, group: <key> }}`. Inside a row, the
 * element marked `dataSet={{ dragHandle: '1' }}` and given draggable="true" starts the drag.
 * Rows only reorder within their own group (a section / list). onReorder(ids) gets the new
 * order of that group's row ids.
 */
export default function useWebReorder(containerRef, { enabled, onReorder }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;
    const root = containerRef.current;
    if (!root || typeof root.addEventListener !== 'function') return undefined;

    let dragRow = null;
    let overRow = null;
    const rowOf = (el) => (el && el.closest ? el.closest('[data-todo-row]') : null);
    const clearMark = () => {
      if (overRow) overRow.style.boxShadow = '';
      overRow = null;
    };

    const onDragStart = (e) => {
      const handle = e.target && e.target.closest ? e.target.closest('[data-drag-handle]') : null;
      const row = rowOf(handle);
      if (!row) return;
      dragRow = row;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.todoRow);
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 24, 20);
      row.style.opacity = '0.45';
    };

    const onDragOver = (e) => {
      if (!dragRow) return;
      const row = rowOf(e.target);
      if (!row || row === dragRow || row.dataset.group !== dragRow.dataset.group) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (overRow && overRow !== row) overRow.style.boxShadow = '';
      overRow = row;
      row.style.boxShadow = after ? DROP_MARK_AFTER : DROP_MARK;
      row.dataset.dropAfter = after ? '1' : '0';
    };

    const onDrop = (e) => {
      if (!dragRow || !overRow) return;
      e.preventDefault();
      const group = dragRow.dataset.group;
      const after = overRow.dataset.dropAfter === '1';
      const rows = [...root.querySelectorAll('[data-todo-row]')].filter((r) => r.dataset.group === group && r !== dragRow);
      const targetIndex = rows.indexOf(overRow);
      rows.splice(after ? targetIndex + 1 : targetIndex, 0, dragRow);
      const ids = rows.map((r) => Number(r.dataset.todoRow));
      clearMark();
      onReorder(ids);
    };

    const onDragEnd = () => {
      if (dragRow) dragRow.style.opacity = '';
      clearMark();
      dragRow = null;
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

/** Ref callback that makes a handle element draggable (web only). */
export function makeDraggable(el) {
  if (el && typeof el.setAttribute === 'function') el.setAttribute('draggable', 'true');
}
