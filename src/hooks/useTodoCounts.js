import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTodos } from '../context/TodoContext';
import { todayYmd } from '../utils/dates';
import { isGivenAway, isInboxTodo } from '../utils/todoMeta';

/** Open counts for every place a to-do can live (sidebar, Browse, tab badges, screen headers). */
export default function useTodoCounts() {
  const { user } = useAuth();
  const { todos, lists, businesses } = useTodos();
  const meId = user?.id;
  const today = todayYmd();
  return useMemo(() => {
    const openPersonal = todos.filter((t) => !t.business_id && !t.is_done && !isGivenAway(t, meId));
    // My date views: personal to-dos plus business work given to me.
    const open = todos.filter((t) => !t.is_done && !isGivenAway(t, meId) && (!t.business_id || (t.assignee_id === meId && t.review_state === 'accepted')));
    const biz = {};
    businesses.forEach((b) => {
      biz[b.id] = todos.filter((t) => t.business_id === b.id && !t.parent_id && !t.is_done && t.review_state !== 'rejected').length;
    });
    return {
      today: open.filter((t) => t.due_date && t.due_date <= today).length,
      upcoming: open.filter((t) => t.due_date && t.due_date > today).length,
      inbox: openPersonal.filter(isInboxTodo).length,
      shared: openPersonal.filter((t) => (t.members || []).length > 1).length,
      assigned: openPersonal.filter((t) => t.created_by !== meId && !t.parent_id).length,
      lists: Object.fromEntries(lists.map((l) => [l.id, openPersonal.filter((t) => t.list_id === l.id && !t.parent_id).length])),
      biz,
    };
  }, [todos, lists, businesses, meId, today]);
}
