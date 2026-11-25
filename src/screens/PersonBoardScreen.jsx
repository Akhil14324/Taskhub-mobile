import { BoardView } from './BoardScreen';

/**
 * The Team monitor's view of one person: everything on their list as a board (table, kanban, calendar, gantt, with
 * the board's own search, filters, sort, hide and group by). Read-only; a task opens the manager's window, where
 * the manager comments and changes dates, reminder or priority (the person is told).
 * Route `PersonBoard`, params { personId, name }.
 */
export default function PersonBoardScreen({ route }) {
  const personId = Number(route?.params?.personId) || null;
  if (!personId) return null;
  return <BoardView key={personId} boardId={`monitor-${personId}`} monitor={{ personId, name: route.params.name || 'Person' }} isTab={false} />;
}
