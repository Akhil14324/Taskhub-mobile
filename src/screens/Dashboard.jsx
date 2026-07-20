import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState, ProgressBar } from '../components/UI';
import { spacing, radius, fontSize } from '../theme/theme';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks');
      const allTasks = res.data.tasks || [];
      setTasks(allTasks);
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadDashboard'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTasks();
  };

  if (loading) return <LoadingSpinner />;

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const onHold = tasks.filter((t) => t.status === 'on_hold').length;
  const warned = tasks.filter((t) => t.is_warned).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const recent = tasks.slice(0, 5);

  const stats = [
    { label: t('totalTasks'), value: total, icon: 'clipboard-outline', color: colors.gray[600], bg: colors.gray[100] },
    { label: t('completed'), value: completed, icon: 'checkmark-circle-outline', color: colors.green[600], bg: colors.green[50] },
    { label: t('pending'), value: pending, icon: 'time-outline', color: colors.yellow[600], bg: colors.yellow[50] },
    { label: t('onHold'), value: onHold, icon: 'pause-circle-outline', color: colors.blue[600], bg: colors.blue[50] },
    { label: t('warnings'), value: warned, icon: 'warning-outline', color: colors.red[600], bg: colors.red[50] },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>{t('dashboard')}</Text>
      {error && <ErrorBanner message={error} />}

      {!user?.business_id && (
        <Card style={styles.notAssignedCard}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.yellow[600]} />
          <Text style={styles.notAssignedTitle}>{t('notAssignedYet')}</Text>
          <Text style={styles.notAssignedDesc}>{t('notAssignedDesc')}</Text>
        </Card>
      )}

      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <Card key={stat.label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
              <Ionicons name={stat.icon} size={20} color={stat.color} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Card>
        ))}
      </View>

      <Card style={styles.completionCard}>
        <View style={styles.completionHeader}>
          <Text style={styles.completionLabel}>{t('completionRate')}</Text>
          <Text style={styles.completionValue}>{completionRate}%</Text>
        </View>
        <ProgressBar percent={completionRate} />
      </Card>

      <View style={styles.recentSection}>
        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>{t('recentTasks')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
            <Text style={styles.viewAll}>{t('viewAll')}</Text>
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="clipboard-outline" size={32} color={colors.gray[300]} />}
            message={t('noTasksYet')}
          />
        ) : (
          recent.map((task) => (
            <Card key={task.id} style={styles.taskCard}>
              <View style={styles.taskRow}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
                  {task.business_name && (
                    <Text style={styles.taskBusiness}>{task.business_name}</Text>
                  )}
                </View>
                <Badge
                  bg={task.status === 'completed' ? colors.green[100] : task.status === 'on_hold' ? colors.blue[100] : task.is_warned ? colors.red[100] : colors.yellow[100]}
                  color={task.status === 'completed' ? colors.green[700] : task.status === 'on_hold' ? colors.blue[700] : task.is_warned ? colors.red[700] : colors.yellow[700]}
                >
                  {task.status === 'completed' ? t('completed') : task.status === 'on_hold' ? t('onHold') : task.is_warned ? t('warned') : t('pending')}
                </Badge>
              </View>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.lg,
  },
  notAssignedCard: {
    alignItems: 'center',
    padding: spacing.xxl,
    marginBottom: spacing.lg,
  },
  notAssignedTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    marginTop: spacing.md,
  },
  notAssignedDesc: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '46%',
    padding: spacing.lg,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.gray[900],
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
  },
  completionCard: {
    marginBottom: spacing.lg,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  completionLabel: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.gray[700],
  },
  completionValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.brand[600],
  },
  recentSection: {
    gap: spacing.sm,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  recentTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
  },
  viewAll: {
    fontSize: fontSize.sm,
    color: colors.brand[600],
    fontWeight: '500',
  },
  taskCard: {
    padding: spacing.md,
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  taskTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.gray[900],
  },
  taskBusiness: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    marginTop: 2,
  },
});
