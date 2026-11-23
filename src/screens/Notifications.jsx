import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import { useChat } from '../context/ChatContext';
import { useNotifications } from '../context/NotificationContext';
import api from '../api/client';
import { ErrorBanner, EmptyState } from '../components/UI';
import { spacing, radius, fontSize } from '../theme/theme';
import AnimatedPressable from '../components/AnimatedPressable';
import { SkeletonList } from '../components/Skeleton';
import { FadeInItem } from '../components/StaggeredFadeIn';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
import { IconButton } from '../components/kit';
import { openNotificationTarget } from '../navigation/navigationRef';
import { timeAgo } from '../utils/dates';
import { showToast, confirmDialog } from '../utils/events';
import { glass } from '../theme/glass';
import { CATEGORIES, categoryOf } from '../utils/notificationMeta';

function getNotifIcons(colors) {
  return {
    warning: { icon: 'warning', color: colors.red[600], bg: colors.red[50] },
    assignment: { icon: 'business', color: colors.brand[600], bg: colors.brand[50] },
    task_added: { icon: 'add-circle', color: colors.blue[600], bg: colors.blue[50] },
    task_assigned: { icon: 'person-add', color: colors.blue[600], bg: colors.blue[50] },
    task_status: { icon: 'swap-horizontal', color: colors.blue[600], bg: colors.blue[50] },
    task_comment: { icon: 'chatbubble-ellipses', color: colors.brand[600], bg: colors.brand[50] },
    task_deleted: { icon: 'trash', color: colors.gray[600], bg: colors.gray[100] },
    user_joined: { icon: 'person', color: colors.purple[600], bg: colors.purple[50] },
    task_completed: { icon: 'checkmark-circle', color: colors.green[600], bg: colors.green[50] },
    task_approved: { icon: 'ribbon', color: colors.green[600], bg: colors.green[50] },
    task_rejected: { icon: 'arrow-undo', color: colors.amber[600], bg: colors.amber[50] },
    approval_request: { icon: 'shield-checkmark', color: colors.purple[600], bg: colors.purple[50] },
    approval_approved: { icon: 'checkmark-done-circle', color: colors.green[600], bg: colors.green[50] },
    approval_rejected: { icon: 'close-circle', color: colors.red[600], bg: colors.red[50] },
    overdue: { icon: 'alarm', color: colors.red[600], bg: colors.red[50] },
    mention: { icon: 'at', color: colors.brand[600], bg: colors.brand[50] },
    todo_shared: { icon: 'list', color: colors.brand[600], bg: colors.brand[50] },
    todo_reminder: { icon: 'alarm', color: colors.amber[600], bg: colors.amber[50] },
    todo_deadline: { icon: 'alert-circle', color: colors.red[600], bg: colors.red[50] },
    todo_upcoming: { icon: 'time', color: colors.amber[600], bg: colors.amber[50] },
    todo_deadline_changed: { icon: 'calendar', color: colors.amber[600], bg: colors.amber[50] },
    ai_recommendation: { icon: 'sparkles', color: colors.purple[600], bg: colors.purple[50] },
    todo_done: { icon: 'checkmark-circle', color: colors.green[600], bg: colors.green[50] },
    todo_comment: { icon: 'chatbubble-ellipses', color: colors.brand[600], bg: colors.brand[50] },
    todo_assigned: { icon: 'person-add', color: colors.brand[600], bg: colors.brand[50] },
    todo_blocked: { icon: 'hand-left', color: colors.red[600], bg: colors.red[50] },
    todo_unblocked: { icon: 'checkmark-done', color: colors.green[600], bg: colors.green[50] },
    todo_update: { icon: 'document-text', color: colors.brand[600], bg: colors.brand[50] },
    todo_question: { icon: 'help-circle', color: colors.purple[600], bg: colors.purple[50] },
    kudos: { icon: 'heart', color: '#ff158a', bg: colors.red[50] },
    daily_digest: { icon: 'sunny', color: colors.amber[600], bg: colors.amber[50] },
    weekly_recap: { icon: 'stats-chart', color: colors.brand[600], bg: colors.brand[50] },
    blocker_nudge: { icon: 'hourglass', color: colors.amber[600], bg: colors.amber[50] },
  };
}

const NotificationItem = memo(({ item, colors, styles, notifIcons, getDynamic, onPress, onDelete }) => {
  const config = notifIcons[item.type] || { icon: 'notifications', color: colors.gray[600], bg: colors.gray[100] };
  return (
    <AnimatedPressable onPress={() => onPress(item)} haptic="light">
      <View {...glass('card')} style={[styles.notifCard, !item.is_read && styles.unreadCard]}>
        <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.notifContent}>
          {!!item.title && <Text style={styles.notifTitle} numberOfLines={2}>{getDynamic(item.title)}</Text>}
          <Text style={item.title ? styles.notifBody : styles.notifMessage} numberOfLines={3}>{getDynamic(item.message)}</Text>
          <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
        <AnimatedPressable onPress={() => onDelete(item)} accessibilityLabel="Delete notification" style={styles.deleteBtn}>
          <Ionicons name="close" size={16} color={colors.gray[400]} />
        </AnimatedPressable>
      </View>
    </AnimatedPressable>
  );
});

export default function Notifications() {
  const { t, lang, translateDynamic, getDynamic } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { subscribe } = useChat();
  const { markAllRead, decrementUnread, refreshCounts } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('all');

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications', { params: { limit: 100 } });
      setNotifications(res.data.notifications || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadNotifications'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // New notifications appear at the top while the screen is open.
  useEffect(() => subscribe('notification:new', (n) => {
    setNotifications((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
  }), [subscribe]);

  useEffect(() => {
    if (lang !== 'te' || notifications.length === 0) return;
    const texts = notifications.flatMap((n) => [n.title, n.message]).filter(Boolean);
    const unique = [...new Set(texts)];
    if (unique.length > 0) translateDynamic(unique);
  }, [notifications, lang, translateDynamic]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const counts = useMemo(() => {
    const out = {};
    notifications.forEach((n) => { const c = categoryOf(n.type); out[c] = (out[c] || 0) + 1; });
    return out;
  }, [notifications]);
  const shown = useMemo(() => (category === 'all' ? notifications : notifications.filter((n) => categoryOf(n.type) === category)), [notifications, category]);

  const handlePress = useCallback(async (item) => {
    if (!item.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      decrementUnread();
      api.put(`/notifications/${item.id}/read`).catch(() => {});
    }
    const data = item.data || {};
    if (data.conversationId || data.taskId || data.todoId || data.approvalId || item.type === 'approval_request' || item.type === 'user_joined') {
      openNotificationTarget({ type: item.type, ...data });
    }
  }, [decrementUnread]);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      markAllRead();
    } catch (err) {
      showToast({ message: err.response?.data?.error || t('failedMarkAllRead'), tone: 'error' });
    }
  };

  const handleClearRead = async () => {
    const ok = await confirmDialog({ title: 'Clear read notifications?', message: 'Unread ones stay.', confirmLabel: 'Clear', destructive: true });
    if (!ok) return;
    try {
      await api.delete('/notifications/read');
      setNotifications((prev) => prev.filter((n) => !n.is_read));
      refreshCounts();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not clear', tone: 'error' });
    }
  };

  const handleDelete = useCallback(async (item) => {
    setNotifications((prev) => prev.filter((n) => n.id !== item.id));
    if (!item.is_read) decrementUnread();
    try {
      await api.delete(`/notifications/${item.id}`);
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not delete', tone: 'error' });
      fetchNotifications();
      refreshCounts();
    }
  }, [decrementUnread, fetchNotifications, refreshCounts]);

  const handleClearAll = async () => {
    const ok = await confirmDialog({ title: 'Clear all notifications?', message: 'Everything in this list is removed, including unread ones.', confirmLabel: 'Clear all', destructive: true });
    if (!ok) return;
    try {
      await api.delete('/notifications');
      setNotifications([]);
      refreshCounts();
    } catch (err) {
      showToast({ message: err.response?.data?.error || 'Could not clear', tone: 'error' });
    }
  };

  const notifIcons = useMemo(() => getNotifIcons(colors), [colors]);

  const renderItem = useCallback(
    ({ item, index }) => (
      <FadeInItem index={index}>
        <NotificationItem
          item={item}
          colors={colors}
          styles={styles}
          notifIcons={notifIcons}
          getDynamic={getDynamic}
          onPress={handlePress}
          onDelete={handleDelete}
        />
      </FadeInItem>
    ),
    [colors, styles, notifIcons, getDynamic, handlePress, handleDelete]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        {navigation.canGoBack() && <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>{t('notifications')}</Text>
          <Text style={styles.subheader}>{unreadCount > 0 ? `${unreadCount} ${t('new')}` : 'You’re all caught up'}</Text>
        </View>
        {unreadCount > 0 && <IconButton icon="checkmark-done" color={colors.brand[600]} onPress={handleMarkAllRead} accessibilityLabel={t('markAllRead')} />}
        {notifications.some((n) => n.is_read) && <IconButton icon="trash-outline" onPress={handleClearRead} accessibilityLabel="Clear read" />}
        {notifications.length > 0 && <IconButton icon="close-circle-outline" onPress={handleClearAll} accessibilityLabel="Clear all" />}
      </View>

      {!loading && notifications.length > 0 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ key: 'all', label: 'All', icon: 'apps-outline', n: notifications.length }, ...CATEGORIES.map((c) => ({ ...c, n: counts[c.key] || 0 }))].map((c) => {
              const active = category === c.key;
              return (
                <AnimatedPressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Ionicons name={c.icon} size={14} color={active ? '#fff' : colors.gray[600]} />
                  <Text style={[styles.chipText, active && { color: '#fff' }]}>{c.label}{c.n ? ` ${c.n}` : ''}</Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {error ? <View style={{ paddingHorizontal: spacing.lg }}><ErrorBanner message={error} /></View> : null}

      {loading ? (
        <SkeletonList count={6} type="notification" />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          extraData={[lang, category]}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={10}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.list, { paddingBottom: 40 + insets.bottom }]}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); refreshCounts(); }} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="notifications-off-outline" size={32} color={colors.gray[300]} />}
              message={category === 'all' ? t('noNotifications') : 'Nothing in this category'}
            />
          }
        />
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  header: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.gray[900], paddingLeft: spacing.xs },
  subheader: { fontSize: fontSize.sm, color: colors.gray[500], paddingLeft: spacing.xs },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray[200],
  },
  unreadCard: { backgroundColor: colors.brand[50], borderColor: colors.brand[200] },
  notifIcon: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[900] },
  notifBody: { fontSize: fontSize.sm, color: colors.gray[600], marginTop: 2 },
  notifMessage: { fontSize: fontSize.base, color: colors.gray[900] },
  notifTime: { fontSize: fontSize.xs, color: colors.gray[400], marginTop: 4 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.gray[100] },
  chipActive: { backgroundColor: colors.brand[600] },
  chipText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray[700] },
  deleteBtn: { padding: 6, marginLeft: spacing.xs },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[600], marginLeft: spacing.sm },
});
