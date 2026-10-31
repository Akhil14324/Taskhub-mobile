import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { useChat } from '../context/ChatContext';
import { showToast } from '../utils/events';
import { refreshBoards } from './useBoards';

/**
 * One board (GET /api/boards/:id) kept live: board:changed reloads its shape, todo:changed for one of its
 * items reloads its items. Every edit is optimistic and goes through the server's own rules:
 *   built-in columns -> the to-do endpoints (PUT /todos/:id, /status, /toggle, /blockers, /assign)
 *   custom columns   -> PUT /boards/:id/items/:todoId/values/:columnId
 * A refused change puts the old value back and says why.
 */
export default function useBoard(boardId) {
  const { subscribe } = useChat();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const dataRef = useRef(null);
  dataRef.current = data;
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await api.get(`/boards/${boardId}`, { __skipOops: true });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.status === 404 ? 'This board is not there, or it is not shared with you.' : 'Could not load this board.');
    }
  }, [boardId]);

  const reloadSoon = useCallback((ms = 250) => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, ms);
  }, [load]);

  useEffect(() => {
    setData(null);
    load();
    return () => clearTimeout(reloadTimer.current);
  }, [load]);

  useEffect(() => {
    const offBoard = subscribe('board:changed', (p) => { if (Number(p?.boardId) === Number(boardId)) reloadSoon(150); });
    const offTodo = subscribe('todo:changed', (p) => {
      const items = dataRef.current?.items || [];
      if (!p?.todoId || p.action === 'created' || items.some((t) => t.id === Number(p.todoId))) reloadSoon(350);
    });
    return () => { offBoard(); offTodo(); };
  }, [subscribe, boardId, reloadSoon]);

  // ---- local patching -------------------------------------------------------------------------------
  const patchItem = useCallback((id, patch) => {
    setData((d) => d && { ...d, items: d.items.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }, []);
  const putItem = useCallback((todo) => {
    if (!todo) return;
    setData((d) => d && { ...d, items: d.items.some((t) => t.id === todo.id) ? d.items.map((t) => (t.id === todo.id ? todo : t)) : [...d.items, todo] });
  }, []);

  const fail = useCallback((err, fallback = 'That did not work') => {
    showToast({ message: err?.response?.data?.error || fallback, tone: 'error', icon: 'alert-circle' });
    reloadSoon(0);
  }, [reloadSoon]);

  // ---- items ---------------------------------------------------------------------------------------
  const updateFields = useCallback(async (item, patch) => {
    patchItem(item.id, patch);
    try {
      const res = await api.put(`/todos/${item.id}`, patch);
      putItem(res.data.todo);
    } catch (err) { fail(err); }
  }, [patchItem, putItem, fail]);

  /** Move an item to the stage a status label stands for, through the endpoint that owns that stage. */
  const setStatus = useCallback(async (item, target, { note } = {}) => {
    if (!target || target === item.status) return;
    if (target === 'in_review') {
      showToast({ message: 'Finish it to send it for review', icon: 'information-circle' });
      return;
    }
    const previous = { status: item.status, is_done: item.is_done };
    patchItem(item.id, { status: target, is_done: target === 'done' });
    try {
      if (target === 'done') {
        await api.post(`/todos/${item.id}/toggle`);
      } else {
        if (item.is_done) await api.post(`/todos/${item.id}/toggle`);
        if (target === 'blocked') {
          await api.post(`/todos/${item.id}/blockers`, { kind: 'issue', note: note || 'Stuck' });
        } else if (target !== 'todo' || !item.is_done) {
          await api.post(`/todos/${item.id}/status`, { status: target });
        }
      }
      reloadSoon(0);
    } catch (err) {
      patchItem(item.id, previous);
      fail(err);
    }
  }, [patchItem, reloadSoon, fail]);

  const assign = useCallback(async (item, userId) => {
    patchItem(item.id, { assignee_id: userId });
    try {
      if (userId) {
        const res = await api.post(`/todos/${item.id}/assign`, { user_id: userId });
        putItem(res.data.todo);
      } else {
        const res = await api.put(`/todos/${item.id}`, { assigned_user_id: null });
        putItem(res.data.todo);
      }
    } catch (err) { fail(err); }
  }, [patchItem, putItem, fail]);

  const setValue = useCallback(async (item, column, value) => {
    const before = dataRef.current?.values?.[item.id]?.[column.id];
    setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: value } } });
    try {
      const res = await api.put(`/boards/${boardId}/items/${item.id}/values/${column.id}`, { value });
      setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: res.data.value } } });
    } catch (err) {
      setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: before } } });
      fail(err);
    }
  }, [boardId, fail]);

  /** Add or take back the current person's vote (the server only ever changes their own). */
  const vote = useCallback(async (item, column, on) => {
    try {
      const res = await api.put(`/boards/${boardId}/items/${item.id}/values/${column.id}`, { vote: !!on });
      setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: res.data.value } } });
    } catch (err) { fail(err); }
  }, [boardId, fail]);

  /** Fill an AI column for some items (OpenAI on the server). */
  const aiFill = useCallback(async (column, itemIds) => {
    try {
      showToast({ message: `Filling ${column.title} for ${itemIds.length} item${itemIds.length === 1 ? '' : 's'}…`, icon: 'sparkles' });
      const res = await api.post(`/boards/${boardId}/columns/${column.id}/ai-fill`, { item_ids: itemIds }, { timeout: 180000 });
      setData((d) => {
        if (!d) return d;
        const values = { ...d.values };
        for (const [id, v] of Object.entries(res.data.values || {})) values[id] = { ...(values[id] || {}), [column.id]: v };
        return { ...d, values };
      });
    } catch (err) { fail(err, 'Could not fill it'); }
  }, [boardId, fail]);

  const addItem = useCallback(async (title, { groupId = null, parentId = null, values = undefined, fields = {} } = {}) => {
    const clean = String(title || '').trim();
    if (!clean) return null;
    try {
      const res = await api.post(`/boards/${boardId}/items`, { title: clean, group_id: groupId, parent_id: parentId, values, ...fields });
      if (res.data.todo) putItem(res.data.todo);
      else showToast({ message: `Sent to ${res.data.assigned_to?.name || 'them'}`, tone: 'success', icon: 'person-add' });
      reloadSoon(400);
      return res.data.todo || null;
    } catch (err) { fail(err, 'Could not add it'); return null; }
  }, [boardId, putItem, reloadSoon, fail]);

  // ---- board shape -----------------------------------------------------------------------------------
  const shape = useCallback(async (method, path, body, { refreshList = false } = {}) => {
    try {
      const res = await api[method](`/boards/${boardId}${path}`, body);
      await load();
      if (refreshList) refreshBoards();
      return res.data;
    } catch (err) { fail(err); return null; }
  }, [boardId, load, fail]);

  const actions = {
    reload: load,
    updateFields,
    setStatus,
    assign,
    setValue,
    vote,
    aiFill,
    addItem,
    rename: (name) => shape('patch', '', { name }, { refreshList: true }),
    updateBoard: (patch) => shape('patch', '', patch, { refreshList: true }),
    addColumn: (spec) => shape('post', '/columns', spec),
    updateColumn: (col, patch) => shape('patch', `/columns/${col.id}`, patch),
    removeColumn: (col) => shape('delete', `/columns/${col.id}`),
    orderColumns: (ids) => shape('put', '/columns/order', { ids }),
    addLabel: (col, label) => shape('post', `/columns/${col.id}/labels`, label),
    updateLabel: (col, label, patch) => shape('patch', `/columns/${col.id}/labels/${label.id}`, patch),
    removeLabel: (col, label) => shape('delete', `/columns/${col.id}/labels/${label.id}`),
    addGroup: (group) => shape('post', '/groups', group),
    updateGroup: (group, patch) => shape('patch', `/groups/${group.id}`, patch),
    orderGroups: (ids) => shape('put', '/groups/order', { ids }),
    addView: (view) => shape('post', '/views', view),
    updateView: (view, patch) => shape('patch', `/views/${view.id}`, patch),
    removeView: (view) => shape('delete', `/views/${view.id}`),
  };

  return { data, error, loading: !data && !error, ...actions };
}
