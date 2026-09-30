import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { showToast } from '../utils/events';
import { formatDue } from '../utils/dates';

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
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const pendingDeletes = useRef(new Map());
  const refetchTimer = useRef(null);

  const fetchTodos = useCallback(async () => {
    try {
      const res = await api.get('/todos', { __skipOops: true });
      const hidden = pendingDeletes.current;
      setTodos(sortTodos((res.data.todos || []).filter((t) => !hidden.has(t.id))));
      setLists(res.data.lists || []);
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
      setInsights(null);
      setLoading(true);
      return;
    }
    fetchTodos();
    fetchInsights();
  }, [user, fetchTodos, fetchInsights]);

  // Someone ticked / edited / shared a to-do with us → refresh (debounced).
  useEffect(() => {
    if (!user) return undefined;
    return subscribe('todo:changed', () => {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        fetchTodos();
        fetchInsights();
      }, 350);
    });
  }, [user, subscribe, fetchTodos, fetchInsights]);

  const upsert = useCallback((todo) => {
    if (!todo) return;
    setTodos((prev) => sortTodos([...prev.filter((t) => t.id !== todo.id), todo]));
  }, []);

  const createTodo = useCallback(async (payload) => {
    const res = await api.post('/todos', payload);
    upsert(res.data.todo);
    const due = res.data.todo.due_date ? ` · ${formatDue(res.data.todo.due_date)}` : '';
    const shared = (res.data.todo.members || []).length > 1 ? ' · shared' : '';
    showToast({ message: `Added${due}${shared}`, tone: 'success', icon: 'checkmark-circle' });
    return res.data.todo;
  }, [upsert]);

  const updateTodo = useCallback(async (id, patch) => {
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === id ? { ...t, ...patch } : t))));
    try {
      const res = await api.put(`/todos/${id}`, patch);
      upsert(res.data.todo);
      return res.data.todo;
    } catch (err) {
      fetchTodos();
      throw err;
    }
  }, [upsert, fetchTodos]);

  const toggleTodo = useCallback(async (todo, { silent = false } = {}) => {
    // Optimistic: flip immediately so the check animation feels instant.
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, is_done: !todo.is_done, _justToggled: Date.now() } : t)));
    try {
      const res = await api.post(`/todos/${todo.id}/toggle`);
      const updated = res.data.todo;
      // Let the strike-through play before the item re-sorts.
      setTimeout(() => upsert(updated), 450);
      fetchInsights();
      if (!silent && !todo.is_done) {
        showToast({
          message: res.data.rolled_to ? `Done · next on ${formatDue(res.data.rolled_to)}` : 'Completed',
          tone: 'success',
          icon: res.data.rolled_to ? 'repeat' : 'checkmark-circle',
          actionLabel: res.data.rolled_to ? undefined : 'Undo',
          onAction: () => toggleTodoRef.current?.({ ...updated }, { silent: true }),
        });
      }
      return updated;
    } catch (err) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, is_done: todo.is_done } : t)));
      showToast({ message: err.response?.data?.error || 'Could not update the to-do', tone: 'error' });
      return null;
    }
  }, [upsert, fetchInsights]);
  const toggleTodoRef = useRef(toggleTodo);
  useEffect(() => { toggleTodoRef.current = toggleTodo; }, [toggleTodo]);

  /** Delete with a short undo window, like Todoist. */
  const deleteTodo = useCallback((todo) => {
    const isCreator = todo.created_by === user?.id;
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
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
      message: isCreator ? 'To-do deleted' : 'Removed from your list',
      icon: 'trash',
      actionLabel: 'Undo',
      duration: DELETE_UNDO_MS - 200,
      onAction: () => {
        clearTimeout(pendingDeletes.current.get(todo.id));
        pendingDeletes.current.delete(todo.id);
        upsert(todo);
      },
    });
  }, [user?.id, upsert, fetchTodos]);

  const removeMember = useCallback(async (todoId, userId) => {
    const res = await api.delete(`/todos/${todoId}/members/${userId}`);
    upsert(res.data.todo);
  }, [upsert]);

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
    setTodos((prev) => prev.map((t) => (t.list_id === id ? { ...t, list_id: null } : t)));
  }, []);

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

  const value = useMemo(() => ({
    todos,
    lists,
    loading,
    insights,
    fetchTodos,
    fetchInsights,
    createTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    removeMember,
    createList,
    updateList,
    deleteList,
    shareTodos,
    importTodos,
  }), [todos, lists, loading, insights, fetchTodos, fetchInsights, createTodo, updateTodo, toggleTodo, deleteTodo,
    removeMember, createList, updateList, deleteList, shareTodos, importTodos]);

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>;
}

export function useTodos() {
  const ctx = useContext(TodoContext);
  if (!ctx) throw new Error('useTodos must be used within TodoProvider');
  return ctx;
}
