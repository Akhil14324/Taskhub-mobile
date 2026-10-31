import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import api from '../api/client';
import { feedback } from '../utils/feedback';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { showToast, emit } from '../utils/events';
import { openNotificationTarget } from '../navigation/navigationRef';
import { formatDue } from '../utils/dates';
import {
  labelsFrom, descendantsOf, doneSectionOf, activeSectionOf, placeSectionsOf,
} from '../utils/todoMeta';

const TodoContext = createContext(null);
const DELETE_UNDO_MS = 4000;

function sortTodos(list) {
  return [...list].sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    const ad = a.due_date || '9999-12-31';
    const bd = b.due_date || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.due_time || '99:99';
    const bt = b.due_time || '99:99';
    if (at !== bt) return at < bt ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

export function TodoProvider({ children }) {
  const { user } = useAuth();
  const { subscribe } = useChat();
  const [todos, setTodos] = useState([]);
  const [lists, setLists] = useState([]);
  const [sections, setSections] = useState([]);
  const [filters, setFilters] = useState([]);
  const [favorites, setFavorites] = useState([]); // [{ kind: 'list' | 'filter' | 'label', ref }]
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const pendingDeletes = useRef(new Map());
  const refetchTimer = useRef(null);
  // Read inside callbacks without making them change on every fetch.
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const fetchTodos = useCallback(async () => {
    try {
      const res = await api.get('/todos', { __skipOops: true });
      const hidden = pendingDeletes.current;
      setTodos(sortTodos((res.data.todos || []).filter((t) => !hidden.has(t.id))));
      setLists(res.data.lists || []);
      setSections(res.data.sections || []);
      setFilters(res.data.filters || []);
      setFavorites(res.data.favorites || []);
      setBusinesses(res.data.businesses || []);
    } catch (err) {
      console.warn('[todos] fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await api.get('/todos/insights', { __skipOops: true });
      setInsights(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setTodos([]);
      setLists([]);
      setSections([]);
      setFilters([]);
      setFavorites([]);
      setBusinesses([]);
      setInsights(null);
      setLoading(true);
      return;
    }
    fetchTodos();
    fetchInsights();
  }, [user, fetchTodos, fetchInsights]);

  // Someone ticked / edited / shared a to-do (or we did, the server echoes every change back): fetch only the
  // to-dos named by the events, not the whole list. Events without a to-do id (sections, lists) reload everything.
  const dirtyIds = useRef(new Set());
  const dirtyAll = useRef(false);
  const insightsTimer = useRef(null);
  useEffect(() => {
    if (!user) return undefined;
    const flush = async () => {
      const ids = [...dirtyIds.current];
      const all = dirtyAll.current || ids.length > 6;
      dirtyIds.current = new Set();
      dirtyAll.current = false;
      if (all) { fetchTodos(); return; }
      await Promise.all(ids.map(async (id) => {
        try {
          const res = await api.get(`/todos/${id}`, { __skipOops: true });
          setTodos((prev) => {
            const fresh = [res.data.todo, ...(res.data.subtasks || [])].filter(Boolean);
            const freshIds = new Set(fresh.map((t) => t.id));
            return sortTodos([...prev.filter((t) => !freshIds.has(t.id)), ...fresh.filter((t) => !pendingDeletes.current.has(t.id))]);
          });
        } catch (err) {
          // Gone or no longer visible to us: drop it. Anything else: fall back to a full reload.
          if ([403, 404].includes(err.response?.status)) setTodos((prev) => prev.filter((t) => t.id !== id));
          else fetchTodos();
        }
      }));
    };
    const off = subscribe('todo:changed', (e) => {
      if (e?.todoId > 0) dirtyIds.current.add(e.todoId); else dirtyAll.current = true;
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(flush, 250);
      // The streak and week numbers change slowly: refresh them at most every 2.5 s.
      clearTimeout(insightsTimer.current);
      insightsTimer.current = setTimeout(fetchInsights, 2500);
    });
    return () => { off?.(); clearTimeout(refetchTimer.current); clearTimeout(insightsTimer.current); };
  }, [user, subscribe, fetchTodos, fetchInsights]);

  const upsert = useCallback((todo) => {
    if (!todo) return;
    setTodos((prev) => sortTodos([...prev.filter((t) => t.id !== todo.id), todo]));
  }, []);

  /** The server round trip behind createTodo. `tempId` is the optimistic row to swap for the real one. */
  const createRemote = useCallback(async (payload, { silent = false, tempId = null } = {}) => {
    const res = await api.post('/todos', payload);
    // An assigned to-do goes to the other people's lists, so there is nothing to add to mine.
    if (!res.data.todo) {
      if (tempId) setTodos((prev) => prev.filter((t) => t.id !== tempId));
      if (!silent) {
        const names = (res.data.assigned_names || [res.data.assigned_to?.name || 'them']).map((n) => n.split(' ')[0]);
        const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
        showToast({ message: `Sent to ${who} · not on your list`, tone: 'success', icon: 'person-add' });
      }
      emit('buddy', { type: 'added' });
      return null;
    }
    if (tempId) setTodos((prev) => sortTodos([...prev.filter((t) => t.id !== tempId && t.id !== res.data.todo.id), res.data.todo]));
    else upsert(res.data.todo);
    // A new sub-task changes its parent's counts.
    if (res.data.todo.parent_id) fetchTodos();
    if (!silent) {
      const t = res.data.todo;
      // Say where it went: a dated to-do is on that day, an undated personal one waits in the Inbox (or its list).
      const listName = t.list_id ? listsRef.current.find((l) => l.id === t.list_id)?.name : null;
      const where = t.review_state === 'proposed' ? ` · sent to ${t.business_name} for review`
        : t.business_id ? ` · ${t.business_name}`
          : t.parent_id ? ''
            : ` · ${listName || 'Inbox'}${(t.members || []).length > 1 ? ', shared' : ''}`;
      const due = t.due_date ? ` · ${formatDue(t.due_date)}` : '';
      // A top-level to-do with no steps gets a nudge: the work behind one line is usually several steps.
      const steps = !t.parent_id && !t.is_done
        ? { actionLabel: 'Add steps', onAction: () => openNotificationTarget({ todoId: t.id, noAlert: true }), duration: 5200 }
        : {};
      showToast({ message: `Added${where}${due}${steps.actionLabel ? ' · does it have steps?' : ''}`, tone: 'success', icon: t.business_id ? 'briefcase' : t.due_date ? 'calendar' : 'file-tray', ...steps });
    }
    if (!res.data.todo.parent_id) emit('buddy', { type: 'added' });
    return res.data.todo;
  }, [upsert, fetchTodos]);

  // Plain personal to-dos appear at once and are saved in the background, in the order they were typed.
  // Anything that is handed to someone, or lives in a business, waits for the server (it decides where it goes).
  const tempSeq = useRef(0);
  const createQueue = useRef(Promise.resolve());
  const createTodo = useCallback(async (payload, opts = {}) => {
    const plain = !payload.business_id && !payload.delegate_to && !(payload.delegate_ids || []).length && !payload.assign_to;
    if (!plain) return createRemote(payload, opts);
    const tempId = `tmp-${Date.now()}-${++tempSeq.current}`;
    const temp = {
      status: 'todo', priority: 4, labels: [], members: [], comment_count: 0, subtask_count: 0, recurrence: null,
      ...payload, id: tempId, is_done: false, saving: true, created_at: new Date().toISOString(),
      assignee_id: user?.id ?? null, assignee_name: user?.name || '', created_by: user?.id ?? null, created_by_name: user?.name || '',
      is_member: true, sort_order: 0,
    };
    setTodos((prev) => sortTodos([...prev, temp]));
    createQueue.current = createQueue.current.then(() => createRemote(payload, { ...opts, tempId })).catch((err) => {
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
      showToast({ message: err.response?.data?.error || 'Could not save that to-do. Please try again.', tone: 'error', icon: 'alert-circle' });
    });
    return temp;
  }, [createRemote, user]);

  const updateTodo = useCallback(async (id, patch) => {
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === id ? { ...t, ...patch } : t))));
    try {
      const res = await api.put(`/todos/${id}`, patch);
      upsert(res.data.todo);
      // Moving between lists / sections or nesting also moves sub-tasks.
      if ('list_id' in patch || 'section_id' in patch || 'parent_id' in patch) fetchTodos();
      return res.data.todo;
    } catch (err) {
      fetchTodos();
      throw err;
    }
  }, [upsert, fetchTodos]);

  /**
   * Sections follow the tick: a finished to-do moves into its place's "Completed" / "Done" section, and one
   * reopened from there goes back to "Ongoing" / "In progress" / "To do" (or "No section"). Only top-level
   * items move (sub-tasks stay with their parent); places without such a section are left alone.
   */
  const followSection = useCallback((updated) => {
    if (!updated || updated.parent_id) return;
    const secs = placeSectionsOf(updated, sectionsRef.current);
    const doneSec = doneSectionOf(secs);
    if (!doneSec) return;
    const field = updated.business_id ? 'business_section_id' : 'section_id';
    const current = updated[field] || null;
    let target;
    if (updated.is_done && current !== doneSec.id) target = doneSec.id;
    else if (!updated.is_done && current === doneSec.id) target = activeSectionOf(secs)?.id ?? null;
    else return;
    if (updated.business_id && !(updated.permissions?.can_edit || updated.permissions?.can_assign)) return;
    updateTodo(updated.id, { [field]: target }).catch(() => {});
  }, [updateTodo]);

  const toggleTodo = useCallback(async (todo, { silent = false, keepSection = false } = {}) => {
    // Optimistic: flip immediately so the check animation feels instant. Ticking a parent
    // ticks its sub-tasks; reopening a sub-task reopens a finished parent.
    const completing = !todo.is_done && todo.status !== 'in_review';
    // Work that needs a review does not close on the spot: wait for the server's answer.
    const needsReview = !!todo.business_id && todo.requires_approval && !todo.permissions?.can_edit && !todo.is_done;
    if (!needsReview) {
      // A transition: React renders the (large) list in slices, so the checkbox animation that is already
      // playing never waits for it.
      startTransition(() => setTodos((prev) => {
        const below = completing && !todo.recurrence ? new Set(descendantsOf(todo.id, prev).map((t) => t.id)) : null;
        const above = new Set();
        if (!completing && todo.is_done) {
          const byId = new Map(prev.map((t) => [t.id, t]));
          for (let p = byId.get(todo.parent_id); p; p = byId.get(p.parent_id)) above.add(p.id);
        }
        return prev.map((t) => {
          if (t.id === todo.id) return { ...t, is_done: !todo.is_done, _justToggled: Date.now() };
          if (below?.has(t.id)) return { ...t, is_done: true };
          if (above.has(t.id)) return { ...t, is_done: false };
          return t;
        });
      }));
    }
    if (completing && !needsReview) {
      // After the first frame of the tick, so sound synthesis and the buddy never share it.
      setTimeout(() => {
        feedback.complete();
        emit('buddy', { type: 'complete', todo });
      }, 60);
    }
    try {
      const res = await api.post(`/todos/${todo.id}/toggle`);
      const updated = res.data.todo;
      // Let the strike-through play before the item re-sorts (and, for sections, moves).
      setTimeout(() => {
        startTransition(() => upsert(updated));
        if (!keepSection && !res.data.rolled_to) followSection(updated);
      }, 450);
      fetchInsights();
      if (!silent && (completing || updated.status === 'in_review')) {
        showToast({
          message: updated.status === 'in_review' ? 'Sent for review'
            : res.data.rolled_to ? `Done · next on ${formatDue(res.data.rolled_to)}` : 'Completed',
          tone: 'success',
          icon: res.data.rolled_to ? 'repeat' : 'checkmark-circle',
          actionLabel: res.data.rolled_to ? undefined : 'Undo',
          onAction: () => toggleTodoRef.current?.({ ...updated }, { silent: true }),
        });
      }
      return updated;
    } catch (err) {
      fetchTodos();
      showToast({ message: err.response?.data?.error || 'Could not update the to-do', tone: 'error' });
      return null;
    }
  }, [upsert, fetchInsights, fetchTodos, followSection]);
  const toggleTodoRef = useRef(toggleTodo);
  useEffect(() => { toggleTodoRef.current = toggleTodo; }, [toggleTodo]);

  /** Delete with a short undo window, like Todoist. */
  const deleteTodo = useCallback((todo) => {
    const isCreator = todo.created_by === user?.id;
    const hide = new Set([todo.id]);
    setTodos((prev) => {
      descendantsOf(todo.id, prev).forEach((t) => hide.add(t.id));
      return prev.filter((t) => !hide.has(t.id));
    });
    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(todo.id);
      try {
        await api.delete(`/todos/${todo.id}`);
      } catch {
        fetchTodos();
      }
    }, DELETE_UNDO_MS);
    pendingDeletes.current.set(todo.id, timer);
    showToast({
      message: isCreator || todo.business_id ? 'Deleted' : 'Removed from your list',
      icon: 'trash',
      actionLabel: 'Undo',
      duration: DELETE_UNDO_MS - 200,
      onAction: () => {
        clearTimeout(pendingDeletes.current.get(todo.id));
        pendingDeletes.current.delete(todo.id);
        fetchTodos();
      },
    });
  }, [user?.id, fetchTodos]);

  /** Delete several at once (bulk select): no per-item undo, one refresh at the end. */
  const deleteTodos = useCallback(async (list) => {
    const ids = new Set(list.map((t) => t.id));
    setTodos((prev) => {
      list.forEach((t) => descendantsOf(t.id, prev).forEach((d) => ids.add(d.id)));
      return prev.filter((t) => !ids.has(t.id));
    });
    await Promise.all(list.map((t) => api.delete(`/todos/${t.id}`).catch(() => null)));
    showToast({ message: `Deleted ${list.length}`, icon: 'trash' });
    fetchTodos();
  }, [fetchTodos]);

  const duplicateTodo = useCallback(async (todo, { silent = false } = {}) => {
    const res = await api.post(`/todos/${todo.id}/duplicate`);
    await fetchTodos();
    if (!silent) showToast({ message: 'Duplicated', tone: 'success', icon: 'copy' });
    return res.data.todo;
  }, [fetchTodos]);

  /** Turn my personal to-do into a task of a business (a member's becomes a proposal). */
  const moveToBusiness = useCallback(async (todo, businessId, assignTo) => {
    const res = await api.post(`/todos/${todo.id}/move-to-business`, { business_id: businessId, assign_to: assignTo || undefined });
    upsert(res.data.todo);
    await fetchTodos();
    showToast({
      message: res.data.todo.review_state === 'proposed' ? 'Sent to the business as a proposal' : 'Moved to the business',
      tone: 'success',
      icon: 'briefcase',
    });
    return res.data.todo;
  }, [upsert, fetchTodos]);

  /** Add to-dos fetched separately (older completions) so they can be opened like the rest. */
  const mergeTodos = useCallback((items) => {
    if (!items?.length) return;
    setTodos((prev) => {
      const known = new Set(prev.map((t) => t.id));
      const fresh = items.filter((t) => !known.has(t.id));
      return fresh.length ? sortTodos([...prev, ...fresh]) : prev;
    });
  }, []);

  const removeMember = useCallback(async (todoId, userId) => {
    const res = await api.delete(`/todos/${todoId}/members/${userId}`);
    upsert(res.data.todo);
  }, [upsert]);

  // Manual order (drag & drop): keep the new order locally, then tell the server.
  const reorderTodos = useCallback(async (ids) => {
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    setTodos((prev) => prev.map((t) => (order.has(t.id) ? { ...t, sort_order: order.get(t.id) } : t)));
    try {
      await api.post('/todos/reorder', { ids });
    } catch {
      fetchTodos();
    }
  }, [fetchTodos]);

  // The order of cards on a board is mine alone (the same business task may sit elsewhere for someone else).
  const saveBoardOrder = useCallback(async (ids) => {
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    setTodos((prev) => prev.map((t) => (order.has(t.id) ? { ...t, board_pos: order.get(t.id) } : t)));
    try {
      await api.post('/todos/board-order', { ids });
    } catch {
      fetchTodos();
    }
  }, [fetchTodos]);

  // ---- lists ---------------------------------------------------------------
  const createList = useCallback(async (payload) => {
    const res = await api.post('/todos/lists', payload);
    setLists((prev) => [...prev, res.data.list]);
    return res.data.list;
  }, []);

  const updateList = useCallback(async (id, payload) => {
    const res = await api.put(`/todos/lists/${id}`, payload);
    setLists((prev) => prev.map((l) => (l.id === id ? res.data.list : l)));
    return res.data.list;
  }, []);

  const deleteList = useCallback(async (id) => {
    await api.delete(`/todos/lists/${id}`);
    setLists((prev) => prev.filter((l) => l.id !== id));
    setSections((prev) => prev.filter((s) => s.list_id !== id));
    setTodos((prev) => prev.map((t) => (t.list_id === id ? { ...t, list_id: null, section_id: null } : t)));
  }, []);

  // ---- sections ------------------------------------------------------------
  const createSection = useCallback(async (listId, name, extra = {}) => {
    const url = extra.businessId ? `/todos/businesses/${extra.businessId}/sections`
      : listId ? `/todos/lists/${listId}/sections` : '/todos/sections';
    const res = await api.post(url, { name, description: extra.description, position: extra.position });
    // The server may renumber the others to make room, so take its word for the order.
    if (extra.businessId || (extra.position !== undefined && extra.position !== null)) await fetchTodos();
    else setSections((prev) => [...prev, res.data.section]);
    return res.data.section;
  }, [fetchTodos]);

  /** Change any of { name, description, archived } on a section. */
  const updateSection = useCallback(async (id, patch) => {
    const res = await api.put(`/todos/sections/${id}`, patch);
    setSections((prev) => prev.map((s) => (s.id === id ? res.data.section : s)));
    return res.data.section;
  }, []);

  const duplicateSection = useCallback(async (id) => {
    const res = await api.post(`/todos/sections/${id}/duplicate`);
    await fetchTodos();
    showToast({ message: `Duplicated with ${res.data.copied} to-do${res.data.copied === 1 ? '' : 's'}`, tone: 'success', icon: 'copy' });
    return res.data.section;
  }, [fetchTodos]);

  /** Put a board's sections in a new left-to-right order (ids of all of them). */
  const reorderSections = useCallback(async (ids) => {
    setSections((prev) => {
      const rank = new Map(ids.map((id, i) => [id, i + 1]));
      return prev.map((s) => (rank.has(s.id) ? { ...s, sort_order: rank.get(s.id) } : s)).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    });
    await api.put('/todos/sections/order', { ids }).catch(() => fetchTodos());
  }, [fetchTodos]);

  const renameSection = useCallback(async (id, name) => {
    const res = await api.put(`/todos/sections/${id}`, { name });
    setSections((prev) => prev.map((s) => (s.id === id ? res.data.section : s)));
    return res.data.section;
  }, []);

  const deleteSection = useCallback(async (id) => {
    await api.delete(`/todos/sections/${id}`);
    setSections((prev) => prev.filter((s) => s.id !== id));
    setTodos((prev) => prev.map((t) => (t.section_id === id ? { ...t, section_id: null } : t)));
  }, []);

  // ---- saved filters -------------------------------------------------------
  const saveFilter = useCallback(async ({ id, name, config }) => {
    const res = id
      ? await api.put(`/todos/filters/${id}`, { name, config })
      : await api.post('/todos/filters', { name, config });
    const saved = res.data.filter;
    setFilters((prev) => (id ? prev.map((f) => (f.id === id ? saved : f)) : [...prev, saved]));
    return saved;
  }, []);

  const duplicateFilter = useCallback(async (id) => {
    const res = await api.post(`/todos/filters/${id}/duplicate`);
    setFilters((prev) => [...prev, res.data.filter]);
    return res.data.filter;
  }, []);

  const isFavorite = useCallback((kind, ref) => favorites.some((f) => f.kind === kind && String(f.ref) === String(ref)), [favorites]);

  const toggleFavorite = useCallback(async (kind, ref) => {
    const on = !favorites.some((f) => f.kind === kind && String(f.ref) === String(ref));
    setFavorites((prev) => (on ? [...prev, { kind, ref: String(ref) }] : prev.filter((f) => !(f.kind === kind && String(f.ref) === String(ref)))));
    try {
      await api.put('/todos/favorites', { kind, ref: String(ref), favorite: on });
    } catch {
      fetchTodos();
    }
    return on;
  }, [favorites, fetchTodos]);

  const renameLabel = useCallback(async (from, to) => {
    await api.put(`/todos/labels/${encodeURIComponent(from)}`, { name: to });
    await fetchTodos();
  }, [fetchTodos]);

  const removeLabel = useCallback(async (name) => {
    await api.delete(`/todos/labels/${encodeURIComponent(name)}`);
    await fetchTodos();
  }, [fetchTodos]);

  const deleteFilter = useCallback(async (id) => {
    await api.delete(`/todos/filters/${id}`);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ---- comments ------------------------------------------------------------
  const fetchComments = useCallback(async (todoId) => {
    const res = await api.get(`/todos/${todoId}/comments`, { __skipOops: true });
    return res.data.comments || [];
  }, []);

  const addComment = useCallback(async (todoId, body, mentionIds = [], extra = {}) => {
    const res = await api.post(`/todos/${todoId}/comments`, {
      body, mention_ids: mentionIds, parent_id: extra.parentId || undefined, attachment_ids: extra.attachmentIds || undefined,
    });
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, comment_count: (t.comment_count || 0) + 1 } : t)));
    return res.data.comment;
  }, []);

  const deleteComment = useCallback(async (todoId, commentId) => {
    await api.delete(`/todos/comments/${commentId}`);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, comment_count: Math.max(0, (t.comment_count || 1) - 1) } : t)));
  }, []);

  // ---- history & goal ------------------------------------------------------
  const fetchCompleted = useCallback(async (before) => {
    const res = await api.get('/todos/completed', { params: before ? { before } : {}, __skipOops: true });
    return res.data;
  }, []);

  const setDailyGoal = useCallback(async (goal) => {
    setInsights((prev) => (prev ? { ...prev, goal } : prev));
    try {
      await api.put('/todos/goal', { goal });
    } catch {
      fetchInsights();
    }
  }, [fetchInsights]);

  const shareTodos = useCallback(async ({ conversationIds, todoIds, title, note }) => {
    const res = await api.post('/todos/share', {
      conversation_ids: conversationIds,
      todo_ids: todoIds,
      title,
      note,
    });
    return res.data;
  }, []);

  const importTodos = useCallback(async (items, listId = null) => {
    const res = await api.post('/todos/import', { items, list_id: listId });
    await fetchTodos();
    return res.data.created;
  }, [fetchTodos]);

  // ---- timeline: status, owner, blockers, updates ---------------------------
  const fetchTimeline = useCallback(async (todoId) => {
    const res = await api.get(`/todos/${todoId}/timeline`, { __skipOops: true });
    return res.data;
  }, []);

  const setTodoStatus = useCallback(async (todo, status) => {
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, status } : t)));
    try {
      const res = await api.post(`/todos/${todo.id}/status`, { status });
      upsert(res.data.todo);
      return res.data.todo;
    } catch (err) {
      fetchTodos();
      throw err;
    }
  }, [upsert, fetchTodos]);

  const assignTodoTo = useCallback(async (todoId, userId) => {
    const res = await api.post(`/todos/${todoId}/assign`, { user_id: userId });
    upsert(res.data.todo);
    return res.data.todo;
  }, [upsert]);

  const raiseBlocker = useCallback(async (todoId, payload) => {
    const res = await api.post(`/todos/${todoId}/blockers`, payload);
    upsert(res.data.todo);
    return res.data.todo;
  }, [upsert]);

  const resolveBlocker = useCallback(async (blockerId, note) => {
    const res = await api.post(`/todos/blockers/${blockerId}/resolve`, { note });
    upsert(res.data.todo);
    return res.data.todo;
  }, [upsert]);

  const postUpdate = useCallback(async (todoId, note, progress) => {
    const res = await api.post(`/todos/${todoId}/updates`, { note, progress });
    upsert(res.data.todo);
    return res.data.todo;
  }, [upsert]);

  // ---- business governance: review, approval, warnings, deletion requests ----------
  const reviewTodo = useCallback(async (todoId, decision, note) => {
    const res = await api.post(`/todos/${todoId}/review`, { decision, note });
    upsert(res.data.todo);
    fetchTodos();
    return res.data.todo;
  }, [upsert, fetchTodos]);

  const approveTodo = useCallback(async (todoId, note) => {
    const res = await api.post(`/todos/${todoId}/approve`, { note });
    upsert(res.data.todo);
    fetchInsights();
    return res.data.todo;
  }, [upsert, fetchInsights]);

  const rejectTodo = useCallback(async (todoId, note) => {
    const res = await api.post(`/todos/${todoId}/reject`, { note });
    upsert(res.data.todo);
    return res.data.todo;
  }, [upsert]);

  const warnTodo = useCallback(async (todoId, message) => {
    const res = await api.post(`/todos/${todoId}/warn`, { message });
    upsert(res.data.todo);
    return res.data.todo;
  }, [upsert]);

  const requestDelete = useCallback(async (todoId, reason) => {
    const res = await api.post(`/todos/${todoId}/request-delete`, { reason });
    fetchTodos();
    return res.data.approval;
  }, [fetchTodos]);

  const fetchAssignees = useCallback(async (businessId) => {
    const res = await api.get('/todos/assignees', { params: { business_id: businessId }, __skipOops: true });
    return res.data.users || [];
  }, []);

  const labels = useMemo(() => labelsFrom(todos), [todos]);

  const value = useMemo(() => ({
    todos,
    lists,
    sections,
    filters,
    favorites,
    isFavorite,
    toggleFavorite,
    renameLabel,
    removeLabel,
    duplicateFilter,
    updateSection,
    duplicateSection,
    reorderSections,
    businesses,
    labels,
    loading,
    insights,
    fetchTodos,
    fetchInsights,
    createTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    deleteTodos,
    duplicateTodo,
    moveToBusiness,
    mergeTodos,
    removeMember,
    reorderTodos,
    saveBoardOrder,
    createList,
    updateList,
    deleteList,
    createSection,
    renameSection,
    deleteSection,
    saveFilter,
    deleteFilter,
    fetchComments,
    addComment,
    deleteComment,
    fetchCompleted,
    setDailyGoal,
    fetchTimeline,
    setTodoStatus,
    assignTodoTo,
    raiseBlocker,
    resolveBlocker,
    postUpdate,
    reviewTodo,
    approveTodo,
    rejectTodo,
    warnTodo,
    requestDelete,
    fetchAssignees,
    shareTodos,
    importTodos,
  }), [favorites, isFavorite, toggleFavorite, renameLabel, removeLabel, duplicateFilter, updateSection, duplicateSection, reorderSections, todos, lists, sections, filters, businesses, labels, loading, reviewTodo, approveTodo, rejectTodo, warnTodo, requestDelete, fetchAssignees, insights, fetchTodos, fetchInsights, createTodo, updateTodo,
    toggleTodo, deleteTodo, deleteTodos, duplicateTodo, moveToBusiness, mergeTodos, removeMember, reorderTodos, saveBoardOrder, createList, updateList, deleteList,
    createSection, renameSection, deleteSection, saveFilter, deleteFilter, fetchComments, addComment, deleteComment,
    fetchCompleted, setDailyGoal, fetchTimeline, setTodoStatus, assignTodoTo, raiseBlocker, resolveBlocker, postUpdate,
    shareTodos, importTodos]);

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>;
}

export function useTodos() {
  const ctx = useContext(TodoContext);
  if (!ctx) throw new Error('useTodos must be used within TodoProvider');
  return ctx;
}
