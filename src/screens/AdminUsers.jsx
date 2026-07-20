import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, LoadingSpinner, ErrorBanner, EmptyState } from '../components/UI';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { spacing, radius, fontSize } from '../theme/theme';

function getRoleBadge(colors) {
  return {
    super_admin: { bg: colors.red[100], text: colors.red[700] },
    admin: { bg: colors.purple[100], text: colors.purple[700] },
    user: { bg: colors.blue[100], text: colors.blue[700] },
  };
}

function getStatusBadge(colors) {
  return {
    active: { bg: colors.green[100], text: colors.green[700] },
    warned: { bg: colors.yellow[100], text: colors.yellow[700] },
    inactive: { bg: colors.gray[100], text: colors.gray[600] },
  };
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { t } = useLang();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [unassigned, setUnassigned] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState([]);
  const [assignError, setAssignError] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [roleModalAction, setRoleModalAction] = useState(null);
  const [roleError, setRoleError] = useState('');
  const [changingRole, setChangingRole] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [unassignedRes, usersRes, bizRes] = await Promise.all([
        api.get('/users/unassigned'),
        api.get('/users'),
        api.get('/businesses'),
      ]);
      setUnassigned(unassignedRes.data.users || []);
      setAllUsers(usersRes.data?.users || usersRes.data?.users || []);
      setBusinesses(bizRes.data.businesses || []);
    } catch (err) {
      setError(err.response?.data?.error || t('failedLoadUsers'));
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

  const openAssignModal = (user) => {
    setSelectedUser(user);
    setSelectedBusinessIds(user.businesses?.map((b) => b.id) || []);
    setAssignError('');
    setAssignModalOpen(true);
  };

  const toggleBusiness = (bizId) => {
    setSelectedBusinessIds((prev) =>
      prev.includes(bizId) ? prev.filter((id) => id !== bizId) : [...prev, bizId]
    );
  };

  const handleAssign = async () => {
    if (!selectedUser) return;
    setAssigning(true);
    try {
      await api.put(`/users/${selectedUser.id}/assign`, { business_ids: selectedBusinessIds });
      setAssignModalOpen(false);
      fetchData();
    } catch (err) {
      setAssignError(err.response?.data?.error || t('failedAssignUser'));
    } finally {
      setAssigning(false);
    }
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
      fetchData();
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
              fetchData();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || t('failedDeleteUser'));
            }
          },
        },
      ]
    );
  };

  const roleBadge = (role) => {
    const c = (getRoleBadge(colors)[role] || getRoleBadge(colors).user);
    return <Badge bg={c.bg} color={c.text}>{role}</Badge>;
  };

  const statusBadge = (status) => {
    const c = (getStatusBadge(colors)[status] || getStatusBadge(colors).active);
    return <Badge bg={c.bg} color={c.text}>{status}</Badge>;
  };

  const renderUserCard = (user, isUnassigned = false) => (
    <Card key={user.id} style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
        <View style={styles.userBadges}>
          {roleBadge(user.role)}
          {statusBadge(user.status)}
        </View>
      </View>

      {!isUnassigned && user.businesses && user.businesses.length > 0 && (
        <View style={styles.userBusinesses}>
          <Ionicons name="business-outline" size={14} color={colors.gray[400]} />
          <Text style={styles.userBizText} numberOfLines={1}>
            {user.businesses.map((b) => b.name).join(', ')}
          </Text>
        </View>
      )}

      <View style={styles.userActions}>
        <TouchableOpacity style={styles.userActionBtn} onPress={() => openAssignModal(user)}>
          <Ionicons name="business-outline" size={16} color={colors.brand[600]} />
          <Text style={[styles.userActionText, { color: colors.brand[600] }]}>
            {user.businesses?.length ? t('reassign') : t('assign')}
          </Text>
        </TouchableOpacity>

        {isSuperAdmin && user.role === 'user' && (
          <TouchableOpacity style={styles.userActionBtn} onPress={() => openRoleModal(user, 'promote')}>
            <Ionicons name="arrow-up-circle-outline" size={16} color={colors.green[600]} />
            <Text style={[styles.userActionText, { color: colors.green[600] }]}>{t('promote')}</Text>
          </TouchableOpacity>
        )}

        {isSuperAdmin && user.role === 'admin' && (
          <TouchableOpacity style={styles.userActionBtn} onPress={() => openRoleModal(user, 'demote')}>
            <Ionicons name="arrow-down-circle-outline" size={16} color={colors.red[600]} />
            <Text style={[styles.userActionText, { color: colors.red[600] }]}>{t('demote')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.userActionBtn} onPress={() => handleDeleteUser(user.id, user.name)}>
          <Ionicons name="trash-outline" size={16} color={colors.red[500]} />
          <Text style={[styles.userActionText, { color: colors.red[500] }]}>{t('delete')}</Text>
        </TouchableOpacity>
      </View>
    </Card>
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
        <Text style={styles.header}>{t('users')}</Text>
        {error && <ErrorBanner message={error} />}

        {/* Unassigned */}
        <Text style={styles.sectionTitle}>
          <Ionicons name="person-add-outline" size={18} color={colors.brand[600]} /> {t('unassignedUsers')}
          {unassigned.length > 0 && ` (${unassigned.length})`}
        </Text>
        {unassigned.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="people-outline" size={28} color={colors.gray[300]} />}
            message={t('noUnassignedUsers')}
          />
        ) : (
          <View style={styles.section}>
            {unassigned.map((u) => renderUserCard(u, true))}
          </View>
        )}

        {/* Admins */}
        <Text style={styles.sectionTitle}>
          <Ionicons name="shield-outline" size={18} color={colors.purple[600]} /> {t('admins')}
          {adminUsers.length > 0 && ` (${adminUsers.length})`}
        </Text>
        {adminUsers.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="shield-outline" size={28} color={colors.gray[300]} />}
            message={t('noAdminUsers')}
          />
        ) : (
          <View style={styles.section}>
            {adminUsers.map((u) => renderUserCard(u))}
          </View>
        )}

        {/* Regular Users */}
        <Text style={styles.sectionTitle}>
          <Ionicons name="people-outline" size={18} color={colors.blue[600]} /> {t('users')}
          {regularUsers.length > 0 && ` (${regularUsers.length})`}
        </Text>
        {regularUsers.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="people-outline" size={28} color={colors.gray[300]} />}
            message={t('noRegularUsers')}
          />
        ) : (
          <View style={styles.section}>
            {regularUsers.map((u) => renderUserCard(u))}
          </View>
        )}
      </ScrollView>

      {/* Assign Modal */}
      <Modal open={assignModalOpen} onClose={() => setAssignModalOpen(false)} title={t('assignUserToBusinesses')}>
        {assignError && <ErrorBanner message={assignError} />}
        {selectedUser && (
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>{selectedUser.name}</Text>
            <Text style={styles.selectedUserEmail}>{selectedUser.email}</Text>
          </View>
        )}
        <Text style={styles.pickerLabel}>{t('selectBusinessesMultiple')}</Text>
        <ScrollView style={styles.bizList} showsVerticalScrollIndicator={false}>
          {businesses.map((biz) => (
            <TouchableOpacity
              key={biz.id}
              style={styles.bizCheckItem}
              onPress={() => toggleBusiness(biz.id)}
            >
              <Ionicons
                name={selectedBusinessIds.includes(biz.id) ? 'checkbox' : 'square-outline'}
                size={22}
                color={selectedBusinessIds.includes(biz.id) ? colors.brand[600] : colors.gray[400]}
              />
              <Text style={styles.bizCheckText}>{biz.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {selectedBusinessIds.length > 0 ? (
          <Text style={styles.selectedCount}>{selectedBusinessIds.length} {t('businessesSelected')}</Text>
        ) : (
          <Text style={styles.noSelection}>{t('noBusinessesSelected')}</Text>
        )}
        <View style={styles.modalActions}>
          <SecondaryButton onPress={() => setAssignModalOpen(false)} style={{ flex: 1, marginRight: spacing.sm }}>
            {t('cancel')}
          </SecondaryButton>
          <PrimaryButton onPress={handleAssign} loading={assigning} style={{ flex: 1, marginLeft: spacing.sm }}>
            {assigning ? t('assigning') : t('assign')}
          </PrimaryButton>
        </View>
      </Modal>

      {/* Role Modal */}
      <Modal
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={roleModalAction === 'promote' ? t('promoteToAdmin') : t('demoteToUser')}
      >
        {roleError && <ErrorBanner message={roleError} />}
        {roleModalUser && (
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>{roleModalUser.name}</Text>
            <Text style={styles.selectedUserEmail}>{roleModalUser.email}</Text>
            <Text style={styles.selectedUserRole}>{t('currentRole')}: {roleModalUser.role}</Text>
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
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray[900],
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  userCard: {
    padding: spacing.lg,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
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
  userBadges: {
    flexDirection: 'column',
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  userBusinesses: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  userBizText: {
    fontSize: fontSize.sm,
    color: colors.gray[500],
    flex: 1,
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
  pickerLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.gray[700],
    marginBottom: spacing.sm,
  },
  bizList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bizCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bizCheckText: {
    fontSize: fontSize.base,
    color: colors.gray[700],
  },
  selectedCount: {
    fontSize: fontSize.xs,
    color: colors.gray[500],
    marginTop: spacing.sm,
  },
  noSelection: {
    fontSize: fontSize.xs,
    color: colors.amber[600],
    marginTop: spacing.sm,
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
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
});
