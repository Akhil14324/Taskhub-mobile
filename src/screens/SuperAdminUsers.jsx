import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, LoadingSpinner, ErrorBanner, SuccessBanner, EmptyState } from '../components/UI';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { Input } from '../components/Input';
import { spacing, radius, fontSize } from '../theme/theme';

function getRoleBadge(colors) {
  return {
    super_admin: { bg: colors.red[100], text: colors.red[700] },
    admin: { bg: colors.purple[100], text: colors.purple[700] },
    user: { bg: colors.blue[100], text: colors.blue[700] },
  };
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SuperAdminUsers() {
  const { t, lang, translateDynamic, getDynamic } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [roleModalAction, setRoleModalAction] = useState(null);
  const [roleError, setRoleError] = useState('');
  const [changingRole, setChangingRole] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users');
      setAllUsers(res.data?.users || []);
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadUsers'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Translate user names when in Telugu
  useEffect(() => {
    if (lang !== 'te' || allUsers.length === 0) return;
    const texts = allUsers.map((u) => u.name).filter(Boolean);
    const unique = [...new Set(texts)];
    if (unique.length > 0) translateDynamic(unique);
  }, [allUsers, lang, translateDynamic]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  const openPwModal = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setPwError('');
    setPwModalOpen(true);
  };

  const openRoleModal = (user, action) => {
    setRoleModalUser(user);
    setRoleModalAction(action);
    setRoleError('');
    setRoleModalOpen(true);
  };

  const handleRoleChange = async () => {
    if (!roleModalUser || !roleModalAction) return;
    setChangingRole(true);
    try {
      const newRole = roleModalAction === 'promote' ? 'admin' : 'user';
      await api.put(`/users/${roleModalUser.id}/role`, { role: newRole });
      setRoleModalOpen(false);
      fetchUsers();
    } catch (err) {
      setRoleError(err.response?.data?.error || t('failedUpdateRole'));
    } finally {
      setChangingRole(false);
    }
  };

  const handleDeleteUser = (userId, userName) => {
    Alert.alert(
      t('deleteUser'),
      t('deleteUserConfirmMsg').replace('{name}', userName),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/users/${userId}`);
              fetchUsers();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || t('failedDeleteUser'));
            }
          },
        },
      ]
    );
  };

  const handlePwSave = async () => {
    if (!newPassword || newPassword.length < 8) {
      setPwError(t('passwordMinLengthError'));
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPwError(t('passwordUppercaseError'));
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPwError(t('passwordLowercaseError'));
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPwError(t('passwordNumberError'));
      return;
    }
    setPwError('');
    setSavingPw(true);
    try {
      await api.put(`/users/${selectedUser.id}/password`, { new_password: newPassword });
      setPwSuccess(t('passwordUpdatedFor').replace('{name}', getDynamic(selectedUser.name)));
      setPwModalOpen(false);
      setTimeout(() => setPwSuccess(''), 3000);
    } catch (err) {
      setPwError(err.response?.data?.error || t('failedUpdatePassword'));
    } finally {
      setSavingPw(false);
    }
  };

  const roleLabel = (role) => {
    if (role === 'super_admin') return t('superAdmin');
    if (role === 'admin') return t('admin');
    return t('user');
  };

  const roleBadge = (role) => {
    const c = (getRoleBadge(colors)[role] || getRoleBadge(colors).user);
    return <Badge bg={c.bg} color={c.text}>{roleLabel(role)}</Badge>;
  };

  const renderUserSection = (users, title, iconName, iconColor, isSuperAdminSection = false) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        <Ionicons name={iconName} size={18} color={iconColor} /> {title}
        {users.length > 0 && ` (${users.length})`}
      </Text>
      {users.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="people-outline" size={28} color={colors.gray[300]} />}
          message={isSuperAdminSection ? t('noSuperAdminsFound') : title === t('admins') ? t('noAdminsFound') : t('noUsersFound')}
        />
      ) : (
        users.map((u) => (
          <Card key={u.id} style={styles.userCard}>
            <View style={styles.userHeader}>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{getDynamic(u.name)}</Text>
                <Text style={styles.userEmail}>{u.email}</Text>
                <Text style={styles.userJoined}>{t('joined')}: {formatDate(u.created_at, lang)}</Text>
              </View>
              {roleBadge(u.role)}
            </View>
            {!isSuperAdminSection && (
              <View style={styles.userActions}>
                <TouchableOpacity style={styles.userActionBtn} onPress={() => openPwModal(u)}>
                  <Ionicons name="key-outline" size={16} color={colors.gray[600]} />
                  <Text style={[styles.userActionText, { color: colors.gray[600] }]}>{t('changePassword')}</Text>
                </TouchableOpacity>
                {u.role === 'user' && (
                  <TouchableOpacity style={styles.userActionBtn} onPress={() => openRoleModal(u, 'promote')}>
                    <Ionicons name="arrow-up-circle-outline" size={16} color={colors.green[600]} />
                    <Text style={[styles.userActionText, { color: colors.green[600] }]}>{t('promote')}</Text>
                  </TouchableOpacity>
                )}
                {u.role === 'admin' && (
                  <TouchableOpacity style={styles.userActionBtn} onPress={() => openRoleModal(u, 'demote')}>
                    <Ionicons name="arrow-down-circle-outline" size={16} color={colors.red[600]} />
                    <Text style={[styles.userActionText, { color: colors.red[600] }]}>{t('demote')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.userActionBtn} onPress={() => handleDeleteUser(u.id, getDynamic(u.name))}>
                  <Ionicons name="trash-outline" size={16} color={colors.red[500]} />
                  <Text style={[styles.userActionText, { color: colors.red[500] }]}>{t('delete')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        ))
      )}
    </View>
  );

  if (loading) return <LoadingSpinner />;

  const superAdminUsers = allUsers.filter((u) => u.role === 'super_admin');
  const adminUsers = allUsers.filter((u) => u.role === 'admin');
  const regularUsers = allUsers.filter((u) => u.role === 'user');

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.header}>{t('allUsers')}</Text>
        {pwSuccess && <SuccessBanner message={pwSuccess} />}
        {error && <ErrorBanner message={error} />}

        {renderUserSection(superAdminUsers, t('superAdmins'), 'crown-outline', colors.red[600], true)}
        {renderUserSection(adminUsers, t('admins'), 'shield-outline', colors.purple[600])}
        {renderUserSection(regularUsers, t('users'), 'people-outline', colors.blue[600])}
      </ScrollView>

      <Modal open={pwModalOpen} onClose={() => setPwModalOpen(false)} title={t('changeUserPassword')}>
        {pwError && <ErrorBanner message={pwError} />}
        {selectedUser && (
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>{getDynamic(selectedUser.name)}</Text>
            <Text style={styles.selectedUserEmail}>{selectedUser.email}</Text>
            <Text style={styles.selectedUserRole}>{t('role')}: {roleLabel(selectedUser.role)}</Text>
          </View>
        )}
        <Input
          label={t('newPassword')}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder={t('passwordMinLengthPlaceholder')}
          secureTextEntry
        />
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setPwModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handlePwSave} loading={savingPw} style={{ flex: 1, marginLeft: spacing.sm }}>
            {savingPw ? t('updating') : t('updatePassword')}
          </PrimaryButton>
        </View>
      </Modal>

      <Modal
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={roleModalAction === 'promote' ? t('promoteToAdmin') : t('demoteToUser')}
      >
        {roleError && <ErrorBanner message={roleError} />}
        {roleModalUser && (
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>{getDynamic(roleModalUser.name)}</Text>
            <Text style={styles.selectedUserEmail}>{roleModalUser.email}</Text>
            <Text style={styles.selectedUserRole}>{t('currentRole')}: {roleLabel(roleModalUser.role)}</Text>
          </View>
        )}
        <Text style={styles.roleDesc}>
          {roleModalAction === 'promote' ? t('promoteDesc') : t('demoteDesc')}
        </Text>
        <Text style={styles.roleConfirm}>{t('areYouSureContinue')}</Text>
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setRoleModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handleRoleChange} loading={changingRole} style={{ flex: 1, marginLeft: spacing.sm }}>
            {changingRole ? t('updating') : roleModalAction === 'promote' ? t('promoteToAdmin') : t('demoteToUser')}
          </PrimaryButton>
        </View>
      </Modal>
    </View>
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
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
  userCard: {
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  userInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  userName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.gray[900],
  },
  userEmail: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    marginTop: 2,
  },
  userJoined: {
    fontSize: fontSize.xs,
    color: colors.gray[400],
    marginTop: 4,
  },
  userActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  userActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  userActionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  roleDesc: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
    marginBottom: spacing.sm,
  },
  roleConfirm: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[700],
    marginBottom: spacing.md,
  },
  selectedUserInfo: {
    backgroundColor: colors.gray[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  selectedUserName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.gray[900],
  },
  selectedUserEmail: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    marginTop: 2,
  },
  selectedUserRole: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
    marginTop: spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
});
