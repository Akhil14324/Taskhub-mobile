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

const APPROVAL_TYPES = new Set(['approval_request', 'approval_approved', 'approval_rejected', 'task_approved', 'task_rejected']);

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
  todo_done: 'checkmark-circle',
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
      const viewingSameTask = route?.name === 'TaskDetail' && Number(route.params?.taskId) === Number(data.taskId);
      if (viewingSameTask) return;
      showToast({
        title: n.title || 'TaskHub',
        message: n.message,
        icon: TYPE_ICONS[n.type] || 'notifications',
        onPress: () => openNotificationTarget({ type: n.type, ...data }),
      });
    });
  }, [user, subscribe, refreshCounts]);

  // Task changes can create/resolve reviews.
  useEffect(() => {
    if (!user) return undefined;
    let timer;
    const off = subscribe('task:changed', () => {
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
