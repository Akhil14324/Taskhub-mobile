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
  // A reload that was already on its way when the person changed something carries the OLD state; showing
  // it made a finished task pop back under "Hide done" until the next reload fixed it. `inflight` counts
  // the changes still being saved and `version` ticks whenever one starts or ends: a reload that began
  // before that (or while one is saving) is dropped and asked again a moment later.
  const inflight = useRef(0);
  const version = useRef(0);
  const loadRef = useRef(null);

  // `force` is for a reload that is itself the last step of a change (the answer must be shown).
  const load = useCallback(async (opts) => {
    if (!boardId) return;
    const force = opts?.force === true;
    const startedAt = version.current;
    try {
      const res = await api.get(`/boards/${boardId}`, { __skipOops: true });
      if (!force && (inflight.current > 0 || version.current !== startedAt)) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => loadRef.current?.(), 300);
        return;
      }
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.status === 404 ? 'This board is not there, or it is not shared with you.' : 'Could not load this board.');
    }
  }, [boardId]);
  loadRef.current = load;

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
  // On "My to-dos" a group is one of the person's lists, so an item's group is its list_id.
  const patchItem = useCallback((id, patch) => {
    setData((d) => d && {
      ...d,
      items: d.items.map((t) => (t.id === id ? { ...t, ...patch, ...(d.board.kind === 'my_todos' && 'list_id' in patch ? { business_section_id: patch.list_id || null } : {}) } : t)),
    });
  }, []);
  const putItem = useCallback((todo) => {
    if (!todo) return;
    setData((d) => {
      if (!d) return d;
      const next = d.board.kind === 'my_todos' && !todo.parent_id ? { ...todo, business_section_id: todo.list_id || null } : todo;
      return { ...d, items: d.items.some((t) => t.id === todo.id) ? d.items.map((t) => (t.id === todo.id ? next : t)) : [...d.items, next] };
    });
  }, []);

  const fail = useCallback((err, fallback = 'That did not work') => {
    showToast({ message: err?.response?.data?.error || fallback, tone: 'error', icon: 'alert-circle' });
    reloadSoon(0);
  }, [reloadSoon]);

  // ---- undo (Ctrl+Z, F-BRD-12): each cell change remembers how to put the old value back -------------
  const history = useRef([]);
  const undoing = useRef(false);
  const remember = useCallback((label, run) => {
    if (undoing.current) return;
    history.current = [...history.current.slice(-29), { label, run }];
  }, []);

  // ---- items ---------------------------------------------------------------------------------------
  const updateFields = useCallback(async (item, patch) => {
    remember(item.title, () => updateFields(item, Object.fromEntries(Object.keys(patch).map((k) => [k, item[k] ?? null]))));
    patchItem(item.id, patch);
    try {
      const res = await api.put(`/todos/${item.id}`, patch);
      putItem(res.data.todo);
    } catch (err) { fail(err); }
  }, [patchItem, putItem, fail, remember]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Set what an item waits for. The server moves it (and what waits for it) when it would start too early. */
  const setDepends = useCallback(async (item, ids) => {
    const before = item.depends_on || [];
    remember(item.title, () => setDepends(item, before.map((d) => d.id)));
    patchItem(item.id, { depends_on: ids.map((id) => { const t = dataRef.current?.items.find((x) => x.id === id); return { id, title: t?.title || '', due_date: t?.due_date || null }; }) });
    try {
      const res = await api.put(`/boards/${boardId}/items/${item.id}/depends-on`, { ids });
      putItem(res.data.todo);
      if (res.data.moved?.length) {
        showToast({ message: `${res.data.moved.length === 1 ? 'Dates moved' : `${res.data.moved.length} tasks moved`} to come after what it waits for`, icon: 'calendar' });
        reloadSoon(0);
      }
    } catch (err) {
      patchItem(item.id, { depends_on: before });
      fail(err, 'Could not set that');
    }
  }, [boardId, patchItem, putItem, fail, remember, reloadSoon]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Move an item to the stage a status label stands for, through the endpoint that owns that stage. */
  const setStatus = useCallback(async (item, target, { note } = {}) => {
    if (!target || target === item.status) return;
    if (target === 'in_review') {
      showToast({ message: 'Finish it to send it for review', icon: 'information-circle' });
      return;
    }
    const previous = { status: item.status, is_done: item.is_done };
    remember(item.title, () => setStatus({ ...item, status: target, is_done: target === 'done' }, previous.status));
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
  }, [patchItem, reloadSoon, fail, remember]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = useCallback(async (item, userId) => {
    remember(item.title, () => assign({ ...item, assignee_id: userId }, item.assignee_id || null));
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
  }, [patchItem, putItem, fail, remember]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = useCallback(async (item, column, value) => {
    const before = dataRef.current?.values?.[item.id]?.[column.id];
    remember(`${column.title} of ${item.title}`, () => setValue(item, column, before ?? null));
    setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: value } } });
    try {
      const res = await api.put(`/boards/${boardId}/items/${item.id}/values/${column.id}`, { value });
      setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: res.data.value } } });
    } catch (err) {
      setData((d) => d && { ...d, values: { ...d.values, [item.id]: { ...(d.values[item.id] || {}), [column.id]: before } } });
      fail(err);
    }
  }, [boardId, fail, remember]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Put back the last change made on this board from this screen. */
  const undo = useCallback(async () => {
    const last = history.current.pop();
    if (!last) { showToast({ message: 'Nothing to undo', icon: 'arrow-undo-outline' }); return; }
    undoing.current = true;
    try { await last.run(); } finally { undoing.current = false; }
    showToast({ message: `Undone: ${last.label}`, icon: 'arrow-undo' });
  }, []);

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
    // The row appears at once (greyed until the server answers); the real one replaces it.
    const tempId = -Date.now();
    const now = new Date().toISOString();
    setData((d) => d && {
      ...d,
      items: [...d.items, {
        id: tempId, title: clean, board_id: Number(boardId), business_section_id: groupId, parent_id: parentId,
        is_done: false, status: 'todo', priority: 4, labels: [], members: [], created_at: now, updated_at: now,
        subtask_done_count: 0, comment_count: 0, open_blocker_count: 0, pending: true, ...fields,
      }],
    });
    try {
      const res = await api.post(`/boards/${boardId}/items`, { title: clean, group_id: groupId, parent_id: parentId, values, ...fields });
      setData((d) => d && { ...d, items: d.items.filter((t) => t.id !== tempId) });
      if (res.data.todo) putItem(res.data.todo);
      else showToast({ message: `Sent to ${res.data.assigned_to?.name || 'them'}`, tone: 'success', icon: 'person-add' });
      reloadSoon(800);
      return res.data.todo || null;
    } catch (err) {
      setData((d) => d && { ...d, items: d.items.filter((t) => t.id !== tempId) });
      fail(err, 'Could not add it');
      return null;
    }
  }, [boardId, putItem, reloadSoon, fail]);

  // ---- board shape -----------------------------------------------------------------------------------
  // What the board is busy with right now ("Creating column…"), so the screen can show progress instead of
  // leaving people to click again. Several can run at once; each label is removed when its work ends.
  const [busy, setBusy] = useState([]);
  const track = useCallback(async (label, fn) => {
    setBusy((b) => [...b, label]);
    inflight.current += 1;
    version.current += 1;
    try {
      return await fn();
    } finally {
      inflight.current -= 1;
      version.current += 1;
      setBusy((b) => {
        const i = b.indexOf(label);
        return i < 0 ? b : [...b.slice(0, i), ...b.slice(i + 1)];
      });
    }
  }, []);

  const shape = useCallback((method, path, body, { refreshList = false, label = 'Saving…' } = {}) => track(label, async () => {
    try {
      const res = await api[method](`/boards/${boardId}${path}`, body);
      await load({ force: true });
      if (refreshList) refreshBoards();
      return res.data;
    } catch (err) { fail(err); return null; }
  }), [boardId, load, fail, track]);

  const saving = (label, fn) => (...args) => track(label, () => fn(...args));

  /**
   * Shape changes show at once: `apply` edits the board in memory, the request runs behind it, `reconcile`
   * swaps in the server's answer, and a refused change puts everything back. No full reload is waited for.
   */
  const instant = useCallback((label, apply, send, reconcile) => track(label, async () => {
    const before = dataRef.current;
    setData((d) => d && apply(d));
    try {
      const res = await send();
      if (reconcile) setData((d) => d && reconcile(d, res.data));
      return res.data;
    } catch (err) {
      setData(before);
      fail(err);
      return null;
    }
  }), [track, fail]);

  const byOrder = (list, ids) => {
    const rank = new Map(ids.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9));
  };

  const actions = {
    reload: load,
    undo,
    canUndo: () => history.current.length > 0,
    updateFields: saving('Saving…', updateFields),
    setStatus: saving('Saving…', setStatus),
    setDepends: saving('Saving…', setDepends),
    assign: saving('Saving…', assign),
    setValue: saving('Saving…', setValue),
    vote: saving('Saving…', vote),
    aiFill,
    addItem: saving('Adding…', addItem),
    rename: (name) => shape('patch', '', { name }, { refreshList: true, label: 'Renaming…' }),
    updateBoard: (patch) => shape('patch', '', patch, { refreshList: true }),
    addColumn: (spec) => {
      const tempId = -Date.now();
      return instant(
        'Creating column…',
        (d) => ({ ...d, columns: [...d.columns, {
          id: tempId, board_id: Number(boardId), kind: spec.kind || 'text', title: spec.title || 'New column', width: 160,
          settings: spec.settings || {}, system_key: spec.system_key || null, pending: true,
          sort_order: (d.columns[d.columns.length - 1]?.sort_order || 0) + 1,
        }] }),
        () => api.post(`/boards/${boardId}/columns`, spec),
        (d, body) => ({ ...d, columns: d.columns.map((c) => (c.id === tempId ? body.column : c)) }),
      );
    },
    updateColumn: (col, patch) => instant(
      'Saving column…',
      (d) => ({ ...d, columns: d.columns.map((c) => (c.id === col.id ? { ...c, ...patch } : c)) }),
      () => api.patch(`/boards/${boardId}/columns/${col.id}`, patch),
    ),
    removeColumn: (col) => instant(
      'Deleting column…',
      (d) => ({ ...d, columns: d.columns.filter((c) => c.id !== col.id) }),
      () => api.delete(`/boards/${boardId}/columns/${col.id}`),
    ),
    orderColumns: (ids) => instant(
      'Moving column…',
      (d) => ({ ...d, columns: byOrder(d.columns, ids) }),
      () => api.put(`/boards/${boardId}/columns/order`, { ids }),
    ),
    addLabel: (col, label) => shape('post', `/columns/${col.id}/labels`, label),
    updateLabel: (col, label, patch) => shape('patch', `/columns/${col.id}/labels/${label.id}`, patch),
    removeLabel: (col, label) => shape('delete', `/columns/${col.id}/labels/${label.id}`),
    orderLabels: (col, ids) => shape('put', `/columns/${col.id}/labels/order`, { ids }),
    addGroup: (group) => {
      const tempId = -Date.now();
      return instant(
        'Creating group…',
        (d) => ({ ...d, groups: [...d.groups, { id: tempId, description: '', archived: false, ...group, sort_order: (d.groups[d.groups.length - 1]?.sort_order || 0) + 1 }] }),
        () => api.post(`/boards/${boardId}/groups`, group),
        (d, body) => (body?.group ? { ...d, groups: d.groups.map((g) => (g.id === tempId ? body.group : g)) } : d),
      );
    },
    updateGroup: (group, patch) => instant(
      'Saving group…',
      (d) => ({ ...d, groups: patch.archived ? d.groups.filter((g) => g.id !== group.id) : d.groups.map((g) => (g.id === group.id ? { ...g, ...patch } : g)) }),
      () => api.patch(`/boards/${boardId}/groups/${group.id}`, patch),
    ),
    duplicateGroup: (group) => shape('post', `/groups/${group.id}/duplicate`, { with_items: true }, { label: 'Duplicating group…' }),
    removeGroup: (group) => instant(
      'Deleting group…',
      (d) => ({
        ...d,
        groups: d.groups.filter((g) => g.id !== group.id),
        items: d.items.map((t) => (t.business_section_id === group.id ? { ...t, business_section_id: null } : t)),
      }),
      () => api.delete(`/boards/${boardId}/groups/${group.id}`),
    ),
    orderGroups: (ids) => instant(
      'Moving group…',
      (d) => ({ ...d, groups: byOrder(d.groups, ids) }),
      () => api.put(`/boards/${boardId}/groups/order`, { ids }),
    ),
    addView: (view) => shape('post', '/views', view, { label: 'Adding view…' }),
    updateView: (view, patch) => shape('patch', `/views/${view.id}`, patch),
    removeView: (view) => shape('delete', `/views/${view.id}`),
  };

  return { data, error, loading: !data && !error, busy, ...actions };
}
