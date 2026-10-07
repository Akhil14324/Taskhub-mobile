import { Platform } from 'react-native';
import { descendantsOf } from './todoMeta';
import { formatDue, formatTime } from './dates';
import { showToast } from './events';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Opens a clean printable page for one to-do: its description, sub-tasks and comments. */
export function printTodo(todo, allTodos, comments = []) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const below = descendantsOf(todo.id, allTodos);
  const depth = (t) => {
    let d = 0;
    for (let p = allTodos.find((x) => x.id === t.parent_id); p && p.id !== todo.id && d < 10; p = allTodos.find((x) => x.id === p.parent_id)) d += 1;
    return d;
  };
  const meta = [
    todo.business_name && `Business: ${todo.business_name}`,
    todo.due_date && `Date: ${formatDue(todo.due_date)}${todo.due_time ? ` ${formatTime(todo.due_time)}` : ''}`,
    todo.deadline_date && `Deadline: ${formatDue(todo.deadline_date)}`,
    todo.priority < 4 && `Priority: P${todo.priority}`,
    (todo.labels || []).length > 0 && `Labels: ${todo.labels.join(', ')}`,
    todo.assignee_name && `Assigned to: ${todo.assignee_name}`,
    todo.is_done ? 'Status: Done' : '',
  ].filter(Boolean);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(todo.title)}</title>
<style>
  body { font: 15px/1.5 -apple-system, Segoe UI, Inter, sans-serif; color: #111; max-width: 720px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 16px; }
  .meta span { margin-right: 14px; }
  .notes { white-space: pre-wrap; margin-bottom: 20px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #666; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .sub { padding: 3px 0; }
  .box { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #444; border-radius: 3px; margin-right: 8px; vertical-align: -1px; }
  .done { text-decoration: line-through; color: #888; }
  .c { margin: 8px 0; }
  .c b { font-size: 13px; }
  .c small { color: #888; margin-left: 6px; }
</style></head><body>
<h1>${esc(todo.title)}</h1>
<div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
${todo.notes ? `<div class="notes">${esc(todo.notes)}</div>` : ''}
${below.length ? `<h2>Sub-tasks</h2>${below.map((t) => `<div class="sub${t.is_done ? ' done' : ''}" style="margin-left:${depth(t) * 20}px"><span class="box"></span>${esc(t.title)}</div>`).join('')}` : ''}
${comments.length ? `<h2>Comments</h2>${comments.map((c) => `<div class="c"><b>${esc(c.user_name || 'Someone')}</b><small>${esc(new Date(c.created_at).toLocaleString())}</small><div>${esc(c.body)}</div></div>`).join('')}` : ''}
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    showToast({ message: 'Allow pop-ups to print', tone: 'error' });
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
