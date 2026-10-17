import api from '../api/client';
import { showToast } from './events';

/** The bell on a task: ping whoever is doing it. The server rate-limits repeats. */
export async function nudgeTodo(todo) {
  try {
    const res = await api.post(`/todos/${todo.id}/nudge`, null, { __skipOops: true });
    const names = (res.data?.names || [todo.assignee_name]).filter(Boolean).map((n) => n.split(' ')[0]);
    const who = names.length ? names.join(' and ') : 'them';
    showToast({ message: `Reminder sent to ${who}`, icon: 'notifications', tone: 'success' });
  } catch (err) {
    showToast({ message: err.response?.data?.error || 'Could not send the reminder', tone: 'error' });
  }
}
