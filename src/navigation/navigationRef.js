import { createNavigationContainerRef } from '@react-navigation/native';
import { emit } from '../utils/events';

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

/**
 * Go to one of the main tabs (Dashboard, BoardsTab, Todos, ChatList). From a pushed screen (Notes, Team monitor ...)
 * a single navigate('Main', { screen }) pops back to the tab shell but resets it to the person's start tab, which
 * is why clicking a module in the sidebar landed on the start page. So pop first, then pick the tab.
 */
export function openTab(name, params) {
  if (!navigationRef.isReady()) return;
  const go = () => navigationRef.navigate('Main', { initial: false, screen: name, params });
  if (navigationRef.getCurrentRoute() && navigationRef.getRootState()?.routes?.length > 1) {
    navigationRef.navigate('Main');
    setTimeout(go, 60);
  } else go();
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
 * `data` is the push / notification payload ({ type, conversationId, todoId, approvalId }).
 */
export function openNotificationTarget(data = {}) {
  const conversationId = Number(data.conversationId);
  // Old notifications may still carry a taskId; the migration rewrote them to todoId, but be safe.
  const todoId = Number(data.todoId) || Number(data.taskId);
  if (conversationId) return navigateWhenReady('ChatThread', { conversationId });
  // Tapping the push of a bell press opens the app into the full-screen alert (delayed so a cold start has mounted it).
  if (data.type === 'todo_nudge' && !data.noAlert) {
    setTimeout(() => emit('alert:show', { todoId, title: data.title, message: data.body, overdue: data.overdue === '1' }), 1200);
  }
  if ((data.type === 'todo_reminder' || data.type === 'todo_deadline') && !data.noAlert && data.alarm !== '0') {
    setTimeout(() => emit('alert:show', { todoId, title: data.title, message: data.body, alarm: true }), 1200);
  }
  // A batch of tasks from a meeting ("Akhil gave you 34 tasks") opens My work, not one task.
  if (data.screen === 'MyWork') return navigateWhenReady('MyWork');
  if (data.screen === 'Timebox' || data.type === 'timebox') return navigateWhenReady('Timebox', data.date ? { date: data.date } : undefined);
  if (data.type === 'weekly_recap') return navigateWhenReady('Recap');
  if (todoId) return navigateWhenReady('Main', { initial: false, screen: 'Todos', params: { highlightId: todoId } });
  if (data.type === 'user_joined') return navigateWhenReady('Organization');
  return navigateWhenReady('Notifications');
}

// Development only: lets a browser console (and automated checks) move between screens.
if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof window !== 'undefined') window.__nav = navigationRef;
