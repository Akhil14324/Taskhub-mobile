import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState } from '../components/UI';
import { PrimaryButton } from '../components/Button';
import { spacing, radius, fontSize } from '../theme/theme';

function getNotifIcons(colors) {
  return {
    warning: { icon: 'warning', color: colors.red[600], bg: colors.red[50] },
    assignment: { icon: 'person-add', color: colors.brand[600], bg: colors.brand[50] },
    task_added: { icon: 'add-circle', color: colors.blue[600], bg: colors.blue[50] },
    user_joined: { icon: 'person', color: colors.purple[600], bg: colors.purple[50] },
    task_completed: { icon: 'checkmark-circle', color: colors.green[600], bg: colors.green[50] },
  };
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Notifications() {
  const { t } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || t('failedMarkRead'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || t('failedMarkAllRead'));
    }
  };

  const notifIcons = useMemo(() => getNotifIcons(colors), [colors]);

  const renderItem = ({ item }) => {
    const config = notifIcons[item.type] || { icon: 'notifications', color: colors.gray[600], bg: colors.gray[100] };
    return (
      <TouchableOpacity
        onPress={() => !item.is_read && handleMarkRead(item.id)}
        activeOpacity={0.7}
      >
        <Card style={[styles.notifCard, !item.is_read && styles.unreadCard]}>
          <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={20} color={config.color} />
          </View>
          <View style={styles.notifContent}>
            <Text style={styles.notifMessage}>{item.message}</Text>
            <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
          </View>
          {!item.is_read && <View style={styles.unreadDot} />}
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>{t('notifications')}</Text>
          {unreadCount > 0 && (
            <Badge bg={colors.brand[100]} color={colors.brand[700]} style={styles.unreadBadge}>
              {unreadCount} {t('new')}
            </Badge>
          )}
        </View>
        {unreadCount > 0 && (
          <PrimaryButton onPress={handleMarkAllRead} style={styles.markAllBtn}>
            {t('markAllRead')}
          </PrimaryButton>
        )}
      </View>

      {error && <ErrorBanner message={error} />}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="notifications-off-outline" size={32} color={colors.gray[300]} />}
            message={t('noNotifications')}
          />
        }
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  header: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.gray[900],
  },
  unreadBadge: {
    marginTop: spacing.xs,
  },
  markAllBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  unreadCard: {
    backgroundColor: colors.brand[50],
    borderColor: colors.brand[200],
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  notifContent: {
    flex: 1,
  },
  notifMessage: {
    fontSize: fontSize.base,
    color: colors.gray[900],
  },
  notifTime: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand[600],
    marginLeft: spacing.sm,
  },
});
