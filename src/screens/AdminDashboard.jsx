import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useTheme, useColors } from '../context/ThemeContext';
import api from '../api/client';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState, ProgressBar, Header } from '../components/UI';
import { spacing, radius, fontSize } from '../theme/theme';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { t, lang, toggleLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();

  const [businesses, setBusinesses] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [bizRes, unassignedRes, usersRes] = await Promise.all([
        api.get('/businesses'),
        api.get('/users/unassigned'),
        api.get('/users'),
      ]);
      setBusinesses(bizRes.data.businesses || []);
      setUnassignedCount(unassignedRes.data.users?.length || 0);
      setTotalUsers(usersRes.data?.users?.length || 0);
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

  const totalTasks = businesses.reduce((sum, b) => sum + parseInt(b.task_count || 0), 0);
  const totalCompleted = businesses.reduce((sum, b) => sum + parseInt(b.completed_count || 0), 0);
  const totalPending = businesses.reduce((sum, b) => sum + parseInt(b.pending_count || 0), 0);
  const totalOnHold = businesses.reduce((sum, b) => sum + parseInt(b.on_hold_count || 0), 0);
  const totalWarned = businesses.reduce((sum, b) => sum + parseInt(b.warned_count || 0), 0);
  const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  const stats = [
    { label: t('businesses'), value: businesses.length, icon: 'business-outline', color: colors.brand[600], bg: colors.brand[50] },
    { label: t('totalTasks'), value: totalTasks, icon: 'trending-up-outline', color: colors.gray[600], bg: colors.gray[100] },
    { label: t('completed'), value: totalCompleted, icon: 'checkmark-circle-outline', color: colors.green[600], bg: colors.green[50] },
    { label: t('pending'), value: totalPending, icon: 'time-outline', color: colors.yellow[600], bg: colors.yellow[50] },
    { label: t('onHold'), value: totalOnHold, icon: 'pause-circle-outline', color: colors.blue[600], bg: colors.blue[50] },
    { label: t('warned'), value: totalWarned, icon: 'warning-outline', color: colors.red[600], bg: colors.red[50] },
    { label: t('unassignedUsers'), value: unassignedCount, icon: 'people-outline', color: colors.purple[600], bg: colors.purple[50] },
  ];

  const getTypeLabel = (type) => t(type) || type?.replace(/_/g, ' ');

  return (
    <View style={styles.container}>
      <Header
        title={t('appName')}
        lang={lang}
        toggleLang={toggleLang}
        theme={theme}
        toggleTheme={toggleTheme}
        userName={user?.name?.split(' ')[0]}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.header}>{t('adminDashboard')}</Text>
        {error && <ErrorBanner message={error} />}

        <View style={styles.statsGrid}>
          {stats.map((stat, index) => (
            <Card key={index} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
                <Ionicons name={stat.icon} size={20} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        {totalTasks > 0 && (
          <Card style={styles.completionCard}>
            <View style={styles.completionHeader}>
              <Text style={styles.completionLabel}>{t('overallCompletionRate')}</Text>
              <Text style={styles.completionValue}>{completionRate}%</Text>
            </View>
            <ProgressBar percent={completionRate} color={colors.brand[600]} />
            <Text style={styles.completionSubtext}>
              {totalCompleted} / {totalTasks} {t('tasksCompletedAcross')}
            </Text>
          </Card>
        )}

        <View style={styles.businessSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('businessOverview')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Businesses')}>
              <Text style={styles.sectionLink}>{t('manage')} →</Text>
            </TouchableOpacity>
          </View>
          {businesses.length === 0 ? (
            <EmptyState
              icon={<Ionicons name="business-outline" size={40} color={colors.gray[300]} />}
              message={t('noBusinessesYet')}
            />
          ) : (
            businesses.map((biz) => {
              const rate = biz.task_count > 0 ? Math.round((biz.completed_count / biz.task_count) * 100) : 0;
              return (
                <TouchableOpacity key={biz.id} activeOpacity={0.7} onPress={() => navigation.navigate('Tasks', { business_id: biz.id })}>
                  <Card style={styles.bizCard}>
                    <View style={styles.bizHeader}>
                      <View>
                        <Text style={styles.bizName}>{biz.name}</Text>
                        <Badge bg={colors.brand[100]} color={colors.brand[700]} style={{ marginTop: spacing.xs }}>
                          {getTypeLabel(biz.type)}
                        </Badge>
                      </View>
                      {parseInt(biz.warned_count) > 0 && (
                        <View style={[styles.warnBadge, { backgroundColor: colors.red[100] }]}>
                          <Ionicons name="warning-outline" size={12} color={colors.red[700]} />
                          <Text style={[styles.warnText, { color: colors.red[700] }]}>{biz.warned_count}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.bizStats}>
                      <View style={styles.bizStat}>
                        <Text style={styles.bizStatValue}>{biz.task_count}</Text>
                        <Text style={styles.bizStatLabel}>{t('total')}</Text>
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
                    </View>
                    <View style={styles.bizProgress}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${rate}%` }]} />
                      </View>
                      <Text style={styles.bizProgressText}>{rate}% {t('complete')} · {biz.user_count} {t('usersCount')}</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Businesses')} activeOpacity={0.7}>
            <Ionicons name="business-outline" size={24} color={colors.brand[600]} />
            <Text style={styles.quickLinkText}>{t('manageBusinesses')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Tasks')} activeOpacity={0.7}>
            <Ionicons name="checkmark-circle-outline" size={24} color={colors.green[600]} />
            <Text style={styles.quickLinkText}>{t('viewAllTasks')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Users')} activeOpacity={0.7}>
            <Ionicons name="people-outline" size={24} color={colors.purple[600]} />
            <Text style={styles.quickLinkText}>{t('manageUsers')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Notifications')} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={24} color={colors.yellow[600]} />
            <Text style={styles.quickLinkText}>{t('notifications')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    fontSize: fontSize.xxl,
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
    color: colors.brand[600],
  },
  completionSubtext: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    marginTop: spacing.sm,
  },
  businessSection: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
  },
  sectionLink: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.brand[600],
  },
  bizCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  bizHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  bizName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
  },
  warnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  warnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
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
  progressTrack: {
    width: '100%',
    backgroundColor: colors.gray[200],
    borderRadius: radius.full,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.green[500],
    borderRadius: radius.full,
  },
  bizProgressText: {
    fontSize: fontSize.xs,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  quickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  quickLink: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  quickLinkText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[900],
  },
});
