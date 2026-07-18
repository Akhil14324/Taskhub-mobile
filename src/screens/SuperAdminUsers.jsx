import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '../context/LanguageContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, LoadingSpinner, ErrorBanner, SuccessBanner, EmptyState } from '../components/UI';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { Input } from '../components/Input';
import { colors, spacing, radius, fontSize } from '../theme/theme';

const ROLE_BADGE = {
  super_admin: { bg: colors.red[100], text: colors.red[700] },
  admin: { bg: colors.purple[100], text: colors.purple[700] },
  user: { bg: colors.blue[100], text: colors.blue[700] },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SuperAdminUsers() {
  const { t } = useLang();
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

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users');
      setAllUsers(res.data?.users || res.data?.users || []);
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

  const handlePwSave = async () => {
    if (!newPassword || newPassword.length < 6) {
      setPwError(t('passwordMinLengthError'));
      return;
    }
    setPwError('');
    setSavingPw(true);
    try {
      await api.put(`/users/${selectedUser.id}/password`, { new_password: newPassword });
      setPwSuccess(t('passwordUpdatedFor').replace('{name}', selectedUser.name));
      setPwModalOpen(false);
      setTimeout(() => setPwSuccess(''), 3000);
    } catch (err) {
      setPwError(err.response?.data?.error || t('failedUpdatePassword'));
    } finally {
      setSavingPw(false);
    }
  };

  const roleBadge = (role) => {
    const c = ROLE_BADGE[role] || ROLE_BADGE.user;
    return <Badge bg={c.bg} color={c.text}>{role}</Badge>;
  };

  const renderUserSection = (users, title, iconName, iconColor) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        <Ionicons name={iconName} size={18} color={iconColor} /> {title}
        {users.length > 0 && ` (${users.length})`}
      </Text>
      {users.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="people-outline" size={28} color={colors.gray[300]} />}
          message={title === t('admins') ? t('noAdminsFound') : t('noUsersFound')}
        />
      ) : (
        users.map((u) => (
          <Card key={u.id} style={styles.userCard}>
            <View style={styles.userHeader}>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{u.name}</Text>
                <Text style={styles.userEmail}>{u.email}</Text>
                <Text style={styles.userJoined}>{t('joined')}: {formatDate(u.created_at)}</Text>
              </View>
              {roleBadge(u.role)}
            </View>
            <SecondaryButton onPress={() => openPwModal(u)} style={styles.pwBtn}>
              <Ionicons name="key-outline" size={16} color={colors.gray[600]} />
              <Text> {t('changePassword')}</Text>
            </SecondaryButton>
          </Card>
        ))
      )}
    </View>
  );

  if (loading) return <LoadingSpinner />;

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

        {renderUserSection(adminUsers, t('admins'), 'shield-outline', colors.purple[600])}
        {renderUserSection(regularUsers, t('users'), 'people-outline', colors.blue[600])}
      </ScrollView>

      <Modal open={pwModalOpen} onClose={() => setPwModalOpen(false)} title={t('changeUserPassword')}>
        {pwError && <ErrorBanner message={pwError} />}
        {selectedUser && (
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>{selectedUser.name}</Text>
            <Text style={styles.selectedUserEmail}>{selectedUser.email}</Text>
            <Text style={styles.selectedUserRole}>{t('role')}: {selectedUser.role}</Text>
          </View>
        )}
        <Input
          label={t('newPassword')}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 6 characters"
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
    </View>
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
  pwBtn: {
    paddingVertical: spacing.sm,
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
