import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import api from '../api/client';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState, ProgressBar } from '../components/UI';
import { colors, spacing, radius, fontSize } from '../theme/theme';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigation = useNavigation();

  const [businesses, setBusinesses] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [bizRes, unassignedRes] = await Promise.all([
        api.get('/businesses'),
        api.get('/users/unassigned'),
      ]);
      setBusinesses(bizRes.data.businesses || []);
      setUnassignedCount(unassignedRes.data.users?.length || 0);
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadDashboard'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) return <LoadingSpinner />;

  const totalTasks = businesses.reduce((sum, b) => sum + (b.task_count || 0), 0);
  const totalCompleted = businesses.reduce((sum, b) => sum + (b.completed_count || 0), 0);
  const totalPending = businesses.reduce((sum, b) => sum + (b.pending_count || 0), 0);
  const totalOnHold = businesses.reduce((sum, b) => sum + (b.on_hold_count || 0), 0);
  const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  const stats = [
    { label: t('totalTasks'), value: totalTasks, icon: 'clipboard-outline', color: colors.gray[600], bg: colors.gray[100] },
    { label: t('completed'), value: totalCompleted, icon: 'checkmark-circle-outline', color: colors.green[600], bg: colors.green[50] },
    { label: t('pending'), value: totalPending, icon: 'time-outline', color: colors.yellow[600], bg: colors.yellow[50] },
    { label: t('onHold'), value: totalOnHold, icon: 'pause-circle-outline', color: colors.blue[600], bg: colors.blue[50] },
    { label: t('unassignedUsers'), value: unassignedCount, icon: 'person-add-outline', color: colors.brand[600], bg: colors.brand[50] },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>{t('adminDashboard')}</Text>
      {error && <ErrorBanner message={error} />}

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
          <Text style={styles.completionLabel}>{t('overallCompletionRate')}</Text>
          <Text style={styles.completionValue}>{completionRate}%</Text>
        </View>
        <ProgressBar percent={completionRate} color={colors.green[600]} />
        <Text style={styles.completionSubtext}>
          {totalCompleted} {t('tasksCompletedAcross')}
        </Text>
      </Card>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Businesses')}>
          <Ionicons name="business-outline" size={22} color={colors.brand[600]} />
          <Text style={styles.quickBtnText}>{t('manageBusinesses')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Tasks')}>
          <Ionicons name="clipboard-outline" size={22} color={colors.brand[600]} />
          <Text style={styles.quickBtnText}>{t('viewAllTasks')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Users')}>
          <Ionicons name="people-outline" size={22} color={colors.brand[600]} />
          <Text style={styles.quickBtnText}>{t('manageUsers')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.businessSection}>
        <Text style={styles.sectionTitle}>{t('businessOverview')}</Text>
        {businesses.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="business-outline" size={32} color={colors.gray[300]} />}
            message={t('noBusinessesYet')}
          />
        ) : (
          businesses.map((biz) => {
            const rate = biz.task_count > 0 ? Math.round((biz.completed_count / biz.task_count) * 100) : 0;
            return (
              <Card key={biz.id} style={styles.bizCard}>
                <View style={styles.bizHeader}>
                  <View style={styles.bizInfo}>
                    <Text style={styles.bizName}>{biz.name}</Text>
                    <Badge bg={colors.brand[100]} color={colors.brand[700]}>
                      {biz.type?.replace(/_/g, ' ')}
                    </Badge>
                  </View>
                </View>
                <View style={styles.bizStats}>
                  <View style={styles.bizStat}>
                    <Text style={styles.bizStatValue}>{biz.task_count}</Text>
                    <Text style={styles.bizStatLabel}>{t('tasks')}</Text>
                  </View>
                  <View style={styles.bizStat}>
                    <Text style={[styles.bizStatValue, { color: colors.green[600] }]}>{biz.completed_count}</Text>
                    <Text style={styles.bizStatLabel}>{t('done')}</Text>
                  </View>
                  <View style={styles.bizStat}>
                    <Text style={[styles.bizStatValue, { color: colors.yellow[600] }]}>{biz.pending_count}</Text>
                    <Text style={styles.bizStatLabel}>{t('pending')}</Text>
                  </View>
                  <View style={styles.bizStat}>
                    <Text style={[styles.bizStatValue, { color: colors.blue[600] }]}>{biz.on_hold_count || 0}</Text>
                    <Text style={styles.bizStatLabel}>{t('onHold')}</Text>
                  </View>
                  <View style={styles.bizStat}>
                    <Text style={[styles.bizStatValue, { color: colors.brand[600] }]}>{biz.user_count}</Text>
                    <Text style={styles.bizStatLabel}>{t('usersCount')}</Text>
                  </View>
                </View>
                <View style={styles.bizProgress}>
                  <View style={styles.bizProgressHeader}>
                    <Text style={styles.bizProgressLabel}>{t('completionRate')}</Text>
                    <Text style={styles.bizProgressValue}>{rate}%</Text>
                  </View>
                  <ProgressBar percent={rate} color={colors.green[600]} />
                </View>
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    color: colors.green[600],
  },
  completionSubtext: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    marginTop: spacing.sm,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: spacing.xs,
  },
  quickBtnText: {
    fontSize: fontSize.xs,
    color: colors.gray[600],
    fontWeight: '500',
    textAlign: 'center',
  },
  businessSection: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: spacing.sm,
  },
  bizCard: {
    padding: spacing.lg,
  },
  bizHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  bizInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  bizName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
  },
  bizStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  bizStat: {
    alignItems: 'center',
  },
  bizStatValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray[900],
  },
  bizStatLabel: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
    marginTop: 2,
  },
  bizProgress: {
    gap: spacing.xs,
  },
  bizProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bizProgressLabel: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
  },
  bizProgressValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.green[600],
  },
});
