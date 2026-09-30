import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

export function getCurrentRouteName() {
  return navigationRef.getCurrentRoute()?.name;
}

export function getCurrentRoute() {
  return navigationRef.getCurrentRoute();
}

/** Navigate once the container is mounted (e.g. from a notification tap on cold start). */
export function navigateWhenReady(name, params, attempts = 40) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return;
  }
  if (attempts > 0) setTimeout(() => navigateWhenReady(name, params, attempts - 1), 150);
}

/**
 * Open whatever a notification points at: a chat, a task, a to-do, approvals…
 * `data` is the push / notification payload ({ type, conversationId, taskId, todoId, approvalId }).
 */
export function openNotificationTarget(data = {}) {
  const conversationId = Number(data.conversationId);
  const taskId = Number(data.taskId);
  const todoId = Number(data.todoId);
  if (conversationId) return navigateWhenReady('ChatThread', { conversationId });
  if (data.approvalId || data.type === 'approval_request') return navigateWhenReady('Approvals');
  if (taskId) return navigateWhenReady('TaskDetail', { taskId });
  if (todoId) return navigateWhenReady('Main', { screen: 'Todos', params: { highlightId: todoId } });
  if (data.type === 'user_joined') return navigateWhenReady('Organization');
  return navigateWhenReady('Notifications');
}
