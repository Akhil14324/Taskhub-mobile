import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { showToast } from '../utils/events';
import { openNotificationTarget, getCurrentRoute } from '../navigation/navigationRef';
import {
  getPushState,
  enablePush as enableWebPush,
  addPushMessageListener,
  consumeLaunchNotification,
} from '../services/webPush';

const NotificationContext = createContext(null);

const APPROVAL_TYPES = new Set([
  'approval_request', 'approval_approved', 'approval_rejected', 'task_approved', 'task_rejected', 'todo_proposed', 'todo_review',
]);

const TYPE_ICONS = {
  mention: 'at',
  task_assigned: 'person-add',
  task_added: 'add-circle',
  task_completed: 'checkmark-done-circle',
  task_comment: 'chatbubble-ellipses',
  approval_request: 'shield-checkmark',
  warning: 'warning',
  overdue: 'alarm',
  todo_shared: 'list',
  todo_reminder: 'alarm',
  todo_deadline: 'alert-circle',
  todo_done: 'checkmark-circle',
  todo_comment: 'chatbubble-ellipses',
  todo_mention: 'at',
  todo_reply: 'return-down-forward',
  standup_posted: 'megaphone',
  standup_nudge: 'alarm',
  todo_assigned: 'person-add',
  todo_blocked: 'hand-left',
  todo_unblocked: 'checkmark-done',
  todo_update: 'document-text',
  todo_question: 'help-circle',
  kudos: 'heart',
  goal_new: 'flag',
  daily_digest: 'sunny',
  weekly_recap: 'stats-chart',
  blocker_nudge: 'hourglass',
  todo_proposed: 'git-pull-request',
  todo_review: 'checkmark-circle',
  todo_added: 'add-circle',
  task_rejected: 'arrow-undo',
  task_deleted: 'trash',
  chat: 'chatbubble',
};

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const { subscribe, activeConversationId, totalUnread: chatUnread } = useChat();
  const [unreadCount, setUnreadCount] = useState(0);
  const [approvalCount, setApprovalCount] = useState(0);
  const [pushState, setPushState] = useState('unsupported');
  const activeConvRef = useRef(activeConversationId);
  useEffect(() => { activeConvRef.current = activeConversationId; }, [activeConversationId]);

  const refreshCounts = useCallback(async () => {
    try {
      const [n, a] = await Promise.all([
        api.get('/notifications/unread-count', { __skipOops: true }),
        api.get('/approvals', { __skipOops: true }),
      ]);
      setUnreadCount(n.data.unread_count || 0);
      setApprovalCount(a.data.count || 0);
    } catch {
      // offline — keep last known counts
    }
  }, []);

  const refreshPushState = useCallback(async () => {
    try {
      setPushState(await getPushState());
    } catch {
      setPushState('unsupported');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setApprovalCount(0);
      return;
    }
    refreshCounts();
    refreshPushState();
  }, [user, refreshCounts, refreshPushState]);

  // Refresh when the app comes back to the foreground.
  useEffect(() => {
    if (!user) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshCounts();
        refreshPushState();
      }
    });
    return () => sub?.remove();
  }, [user, refreshCounts, refreshPushState]);

  // Live notifications from the socket → badge + in-app banner.
  useEffect(() => {
    if (!user) return undefined;
    return subscribe('notification:new', (n) => {
      setUnreadCount((c) => c + 1);
      if (APPROVAL_TYPES.has(n.type)) refreshCounts();
      const data = n.data || {};
      const route = getCurrentRoute();
      const viewingSame = route?.name === 'Main' && data.todoId && Number(route.params?.highlightId) === Number(data.todoId);
      if (viewingSame) return;
      showToast({
        title: n.title || 'TaskHub',
        message: n.message,
        icon: TYPE_ICONS[n.type] || 'notifications',
        onPress: () => openNotificationTarget({ type: n.type, ...data }),
      });
    });
  }, [user, subscribe, refreshCounts]);

  // To-do changes can create/resolve reviews.
  useEffect(() => {
    if (!user) return undefined;
    let timer;
    const off = subscribe('todo:changed', () => {
      clearTimeout(timer);
      timer = setTimeout(refreshCounts, 800);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [user, subscribe, refreshCounts]);

  // Web push relayed by the service worker (chat messages only produce pushes, not
  // stored notifications, so their in-app banner comes from here).
  useEffect(() => {
    if (!user || Platform.OS !== 'web') return undefined;
    const launch = consumeLaunchNotification();
    if (launch) openNotificationTarget(launch);
    return addPushMessageListener(({ kind, payload }) => {
      const data = payload?.data || {};
      if (kind === 'open') {
        openNotificationTarget(data);
        return;
      }
      if (data.type !== 'chat') return;
      if (Number(data.conversationId) === Number(activeConvRef.current)) return;
      showToast({
        title: payload.title,
        message: payload.body,
        icon: 'chatbubble',
        onPress: () => openNotificationTarget(data),
      });
    });
  }, [user]);

  // App icon badge (installed PWA) + tab title.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const total = (user ? unreadCount + (chatUnread || 0) : 0);
    try {
      document.title = total > 0 ? `(${total > 99 ? '99+' : total}) TaskHub` : 'TaskHub';
      if (navigator.setAppBadge) {
        if (total > 0) navigator.setAppBadge(total).catch(() => {});
        else navigator.clearAppBadge?.().catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [user, unreadCount, chatUnread]);

  const enablePush = useCallback(async () => {
    const result = await enableWebPush();
    setPushState(result === 'granted' ? 'granted' : await getPushState());
    return result;
  }, []);

  // Notifications are on by default: browsers (iOS Safari especially) only show the permission
  // prompt from a tap, so ask on the first tap after sign-in. Once per session; the Home card
  // and Profile button stay as the fallback if the person dismisses it.
  const autoAskedRef = useRef(false);
  useEffect(() => {
    if (!user || Platform.OS !== 'web' || pushState !== 'default' || autoAskedRef.current) return undefined;
    const ask = () => {
      if (autoAskedRef.current) return;
      autoAskedRef.current = true;
      document.removeEventListener('pointerup', ask, true);
      enablePush().catch(() => {});
    };
    document.addEventListener('pointerup', ask, true);
    return () => document.removeEventListener('pointerup', ask, true);
  }, [user, pushState, enablePush]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const decrementUnread = useCallback((by = 1) => setUnreadCount((c) => Math.max(0, c - by)), []);

  const value = useMemo(() => ({
    unreadCount,
    approvalCount,
    pushState,
    refreshCounts,
    enablePush,
    markAllRead,
    decrementUnread,
  }), [unreadCount, approvalCount, pushState, refreshCounts, enablePush, markAllRead, decrementUnread]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
