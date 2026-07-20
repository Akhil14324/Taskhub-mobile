import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, LoadingSpinner, ErrorBanner, SuccessBanner, EmptyState, ProgressBar } from '../components/UI';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Button';
import { Input } from '../components/Input';
import { spacing, radius, fontSize } from '../theme/theme';

function getRoleAvatar(colors) {
  return {
    super_admin: { bg: colors.purple[100], text: colors.purple[700] },
    admin: { bg: colors.indigo[100], text: colors.indigo[700] },
    user: { bg: colors.brand[100], text: colors.brand[600] },
  };
}

function getRoleBadge(colors) {
  return {
    super_admin: { bg: colors.purple[100], text: colors.purple[700] },
    admin: { bg: colors.indigo[100], text: colors.indigo[700] },
    user: { bg: colors.blue[100], text: colors.blue[700] },
  };
}

const ROLE_LABEL = {
  super_admin: 'superAdmin',
  admin: 'admin',
  user: 'user',
};

function getStatusBadge(colors) {
  return {
    active: { bg: colors.green[100], text: colors.green[700] },
    warned: { bg: colors.amber[100], text: colors.amber[700] },
    inactive: { bg: colors.gray[100], text: colors.gray[600] },
  };
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { t } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);

  const [stats, setStats] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        api.get('/users/me/stats'),
        api.get('/users/me/businesses'),
        api.get('/users/me/warnings'),
      ]);
      if (results[0].status === 'fulfilled') setStats(results[0].value.data);
      if (results[1].status === 'fulfilled') setBusinesses(results[1].value.data.businesses || []);
      if (results[2].status === 'fulfilled') setWarnings(results[2].value.data.warnings || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('areYouSureContinue'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  const openEditModal = () => {
    setEditName(user?.name || '');
    setEditError('');
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError(t('nameRequired'));
      return;
    }
    setEditError('');
    setSavingName(true);
    try {
      await api.put('/users/me', { name: trimmed });
      await refreshUser();
      setEditSuccess(t('profileUpdated'));
      setEditModalOpen(false);
      setTimeout(() => setEditSuccess(''), 3000);
    } catch (err) {
      setEditError(err.response?.data?.error || t('failedUpdateProfile'));
    } finally {
      setSavingName(false);
    }
  };

  const openPwModal = () => {
    setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    setPwError('');
    setPwModalOpen(true);
  };

  const handlePwSave = async () => {
    if (!pwForm.current_password || !pwForm.new_password) {
      setPwError(t('allFieldsRequired'));
      return;
    }
    if (pwForm.new_password.length < 6) {
      setPwError(t('passwordMinLength'));
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError(t('passwordsDoNotMatch'));
      return;
    }
    setPwError('');
    setSavingPw(true);
    try {
      await api.put('/users/me/password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwSuccess(t('passwordUpdated'));
      setPwModalOpen(false);
      setTimeout(() => setPwSuccess(''), 3000);
    } catch (err) {
      setPwError(err.response?.data?.error || t('failedUpdatePassword'));
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const avatarStyle = (getRoleAvatar(colors)[user?.role] || getRoleAvatar(colors).user);
  const roleBadgeStyle = (getRoleBadge(colors)[user?.role] || getRoleBadge(colors).user);
  const roleLabel = t(ROLE_LABEL[user?.role] || 'user');
  const statusBadgeStyle = (getStatusBadge(colors)[user?.status] || getStatusBadge(colors).active);

  const userStats = [
    { label: t('tasksCompleted'), value: stats?.tasks_completed ?? 0, icon: 'checkmark-circle-outline', color: colors.green[600], bg: colors.green[50] },
    { label: t('tasksPending'), value: stats?.tasks_pending ?? 0, icon: 'time-outline', color: colors.yellow[600], bg: colors.yellow[50] },
    { label: t('completionRate'), value: `${stats?.completion_rate ?? 0}%`, icon: 'trending-up-outline', color: colors.brand[600], bg: colors.brand[50] },
    { label: t('warnings'), value: stats?.warnings_count ?? 0, icon: 'warning-outline', color: colors.red[600], bg: colors.red[50] },
  ];

  const adminStats = [
    { label: t('businesses'), value: stats?.businesses_count ?? 0, icon: 'business-outline', color: colors.brand[600], bg: colors.brand[50] },
    { label: t('users'), value: stats?.total_users ?? 0, icon: 'people-outline', color: colors.purple[600], bg: colors.purple[50] },
    { label: t('totalTasks'), value: stats?.total_tasks ?? 0, icon: 'clipboard-outline', color: colors.gray[600], bg: colors.gray[100] },
  ];

  const statTiles = isAdmin ? adminStats : userStats;
  const showWarnings = !isAdmin || (stats?.warnings_count ?? 0) > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header Card */}
      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={[styles.avatar, { backgroundColor: avatarStyle.bg }]}>
            <Text style={[styles.avatarText, { color: avatarStyle.text }]}>{getInitials(user?.name)}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.userName}>{user?.name}</Text>
            <View style={styles.headerBadges}>
              <Badge bg={roleBadgeStyle.bg} color={roleBadgeStyle.text}>
                {roleLabel}
              </Badge>
              <Badge bg={statusBadgeStyle.bg} color={statusBadgeStyle.text}>
                {user?.status || 'active'}
              </Badge>
            </View>
          </View>
          <TouchableOpacity onPress={openEditModal} style={styles.editBtn}>
            <Ionicons name="create-outline" size={16} color={colors.gray[600]} />
            <Text style={styles.editBtnText}>{t('editProfile')}</Text>
          </TouchableOpacity>
        </View>
        {editSuccess && <SuccessBanner message={editSuccess} style={{ marginTop: spacing.md }} />}
      </Card>

      {/* Stats */}
      <View style={styles.statsGrid}>
        {statTiles.map((stat) => (
          <Card key={stat.label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
              <Ionicons name={stat.icon} size={20} color={stat.color} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Card>
        ))}
      </View>

      {/* Businesses */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="business-outline" size={18} color={colors.gray[400]} />
          <Text style={styles.sectionTitle}>{t('assignedBusinesses')}</Text>
        </View>
        {businesses.length === 0 ? (
          <Text style={styles.emptyText}>{t('notAssignedToBusiness')}</Text>
        ) : (
          <View style={styles.badgeRow}>
            {businesses.map((biz) => (
              <Badge key={biz.id} bg={colors.brand[100]} color={colors.brand[700]}>
                {biz.name}
              </Badge>
            ))}
          </View>
        )}
      </Card>

      {/* Account Details */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('accountDetails')}</Text>
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Ionicons name="mail-outline" size={16} color={colors.gray[400]} />
            </View>
            <View>
              <Text style={styles.detailLabel}>{t('email')}</Text>
              <Text style={styles.detailValue}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={16} color={colors.gray[400]} />
            </View>
            <View>
              <Text style={styles.detailLabel}>{t('memberSince')}</Text>
              <Text style={styles.detailValue}>{formatDate(user?.created_at)}</Text>
            </View>
          </View>
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Ionicons name="shield-outline" size={16} color={colors.gray[400]} />
            </View>
            <View>
              <Text style={styles.detailLabel}>{t('role')}</Text>
              <Text style={styles.detailValue}>{roleLabel}</Text>
            </View>
          </View>
          <View style={styles.detailItem}>
            <View style={styles.detailIcon}>
              <Ionicons name="person-outline" size={16} color={colors.gray[400]} />
            </View>
            <View>
              <Text style={styles.detailLabel}>{t('statusLabel')}</Text>
              <Text style={styles.detailValue}>{user?.status || 'active'}</Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Security */}
      <Card style={styles.sectionCard}>
        <View style={styles.securityRow}>
          <View style={styles.securityInfo}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.gray[400]} />
            <View>
              <Text style={styles.sectionTitle}>{t('security')}</Text>
              <Text style={styles.securitySubtext}>{t('changePassword')}</Text>
            </View>
          </View>
          <SecondaryButton onPress={openPwModal} style={styles.pwBtn}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.gray[600]} />
            <Text> {t('changePassword')}</Text>
          </SecondaryButton>
        </View>
        {pwSuccess && <SuccessBanner message={pwSuccess} style={{ marginTop: spacing.md }} />}
      </Card>

      {/* Warnings History */}
      {showWarnings && (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning-outline" size={18} color={colors.amber[500]} />
            <Text style={styles.sectionTitle}>{t('warningsHistory')}</Text>
          </View>
          {warnings.length === 0 ? (
            <Text style={styles.emptyText}>{t('noWarnings')}</Text>
          ) : (
            <View style={styles.warningsList}>
              {warnings.map((w) => (
                <View key={w.id} style={styles.warningItem}>
                  <View style={styles.warningHeader}>
                    <Text style={styles.warningTitle}>{w.task_title}</Text>
                    <Text style={styles.warningDate}>{formatDate(w.created_at)}</Text>
                  </View>
                  <Text style={styles.warningMessage}>{w.message}</Text>
                  {w.sent_by_name && (
                    <Text style={styles.warningSender}>{t('sentBy')} {w.sent_by_name}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {/* Danger Zone */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('dangerZone')}</Text>
        <DangerButton onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color={colors.white} />
          <Text> {t('logout')}</Text>
        </DangerButton>
      </Card>

      {/* Edit Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={t('editProfile')}>
        {editError && <ErrorBanner message={editError} />}
        <Input label={t('name')} value={editName} onChangeText={setEditName} placeholder="Your name" />
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setEditModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handleEditSave} loading={savingName} style={{ flex: 1, marginLeft: spacing.sm }}>
            {savingName ? t('saving') : t('saveChanges')}
          </PrimaryButton>
        </View>
      </Modal>

      {/* Password Modal */}
      <Modal open={pwModalOpen} onClose={() => setPwModalOpen(false)} title={t('changePassword')}>
        {pwError && <ErrorBanner message={pwError} />}
        <Input label={t('currentPassword')} value={pwForm.current_password} onChangeText={(v) => setPwForm({ ...pwForm, current_password: v })} placeholder={t('enterCurrentPassword')} secureTextEntry />
        <Input label={t('newPassword')} value={pwForm.new_password} onChangeText={(v) => setPwForm({ ...pwForm, new_password: v })} placeholder="At least 6 characters" secureTextEntry />
        <Input label={t('confirmNewPassword')} value={pwForm.confirm_password} onChangeText={(v) => setPwForm({ ...pwForm, confirm_password: v })} placeholder={t('reenterNewPassword')} secureTextEntry />
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setPwModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handlePwSave} loading={savingPw} style={{ flex: 1, marginLeft: spacing.sm }}>
            {savingPw ? t('updating') : t('updatePassword')}
          </PrimaryButton>
        </View>
      </Modal>
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
    gap: spacing.md,
  },
  headerCard: {
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.xs,
  },
  headerBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.gray[100],
    borderRadius: radius.md,
  },
  editBtnText: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
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
  sectionCard: {
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.gray[700],
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    fontStyle: 'italic',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  detailsGrid: {
    gap: spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
  },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[900],
  },
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  securitySubtext: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
  },
  pwBtn: {
    paddingVertical: spacing.sm,
  },
  warningsList: {
    gap: spacing.sm,
  },
  warningItem: {
    backgroundColor: colors.amber[50],
    borderWidth: 1,
    borderColor: colors.amber[100],
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warningHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  warningTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray[900],
    flex: 1,
  },
  warningDate: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
  },
  warningMessage: {
    fontSize: fontSize.sm,
    color: colors.amber[700],
  },
  warningSender: {
    fontSize: fontSize.xs,
    color: colors.gray[500],
    marginTop: spacing.xs,
  },
  logoutBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
});
