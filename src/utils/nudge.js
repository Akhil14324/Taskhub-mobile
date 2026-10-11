import api from '../api/client';
import { showToast } from './events';

/** The bell on a task: ping whoever is doing it. The server rate-limits repeats. */
export async function nudgeTodo(todo) {
  try {
    await api.post(`/todos/${todo.id}/nudge`, null, { __skipOops: true });
    const who = (todo.assignee_name || 'them').split(' ')[0];
    showToast({ message: `Reminder sent to ${who}`, icon: 'notifications', tone: 'success' });
  } catch (err) {
    showToast({ message: err.response?.data?.error || 'Could not send the reminder', tone: 'error' });
  }
}
