import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AnimatedPressable from '../components/AnimatedPressable';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { useColors } from '../context/ThemeContext';
import api from '../api/client';
import Modal from '../components/Modal';
import { Card, Badge, ErrorBanner, EmptyState, Screen } from '../components/UI';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { SkeletonList } from '../components/Skeleton';
import { FadeInItem } from '../components/StaggeredFadeIn';
import { BrandedRefresh } from '../components/BrandedRefreshControl';
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

function roleLabel(role, t) {
  if (role === 'super_admin') return t('superAdmin');
  if (role === 'admin') return t('admin');
  return t('user');
}

const UserItem = memo(function UserItem({
  user, isUnassigned, styles, colors, t, getDynamic, isSuperAdmin,
  onAssign, onRoleChange, onDelete,
}) {
  const renderRoleBadge = (role) => {
    const c = (getRoleBadge(colors)[role] || getRoleBadge(colors).user);
    return <Badge bg={c.bg} color={c.text}>{roleLabel(role, t)}</Badge>;
  };

  const renderStatusBadge = (status) => {
    const c = (getStatusBadge(colors)[status] || getStatusBadge(colors).active);
    const label = status === 'warned' ? t('warned') : status === 'inactive' ? t('inactive') : t('active');
    return <Badge bg={c.bg} color={c.text}>{label}</Badge>;
  };

  return (
    <Card key={user.id} style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{getDynamic(user.name)}</Text>
          <Text style={styles.userEmail}>{user.username}</Text>
        </View>
        <View style={styles.userBadges}>
          {renderRoleBadge(user.role)}
          {renderStatusBadge(user.status)}
        </View>
      </View>

      {!isUnassigned && user.businesses && user.businesses.length > 0 && (
        <View style={styles.userBusinesses}>
          <Ionicons name="business-outline" size={14} color={colors.gray[400]} />
          <Text style={styles.userBizText} numberOfLines={1}>
            {user.businesses.map((b) => getDynamic(b.name)).join(', ')}
          </Text>
        </View>
      )}

      <View style={styles.userActions}>
        <AnimatedPressable style={styles.userActionBtn} onPress={() => onAssign(user)} haptic="light">
          <Ionicons name="business-outline" size={16} color={colors.brand[600]} />
          <Text style={[styles.userActionText, { color: colors.brand[600] }]}>
            {user.businesses?.length ? t('reassign') : t('assign')}
          </Text>
        </AnimatedPressable>

        {isSuperAdmin && user.role === 'user' && (
          <AnimatedPressable style={styles.userActionBtn} onPress={() => onRoleChange(user, 'promote')} haptic="light">
            <Ionicons name="arrow-up-circle-outline" size={16} color={colors.green[600]} />
            <Text style={[styles.userActionText, { color: colors.green[600] }]}>{t('promote')}</Text>
          </AnimatedPressable>
        )}

        {isSuperAdmin && user.role === 'admin' && (
          <AnimatedPressable style={styles.userActionBtn} onPress={() => onRoleChange(user, 'demote')} haptic="light">
            <Ionicons name="arrow-down-circle-outline" size={16} color={colors.red[600]} />
            <Text style={[styles.userActionText, { color: colors.red[600] }]}>{t('demote')}</Text>
          </AnimatedPressable>
        )}

        <AnimatedPressable style={styles.userActionBtn} onPress={() => onDelete(user.id, getDynamic(user.name))} haptic="medium">
          <Ionicons name="trash-outline" size={16} color={colors.red[500]} />
          <Text style={[styles.userActionText, { color: colors.red[500] }]}>{t('delete')}</Text>
        </AnimatedPressable>
      </View>
    </Card>
  );
});

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { t, lang, translateDynamic, getDynamic } = useLang();
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
      setAllUsers(usersRes.data?.users || []);
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

  // Translate user names and business names when in Telugu
  useEffect(() => {
    if (lang !== 'te') return;
    const texts = [];
    unassigned.forEach((u) => { if (u.name) texts.push(u.name); });
    allUsers.forEach((u) => {
      if (u.name) texts.push(u.name);
      u.businesses?.forEach((b) => { if (b.name) texts.push(b.name); });
    });
    businesses.forEach((b) => { if (b.name) texts.push(b.name); });
    const unique = [...new Set(texts)];
    if (unique.length > 0) translateDynamic(unique);
  }, [unassigned, allUsers, businesses, lang, translateDynamic]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openAssignModal = useCallback((user) => {
    setSelectedUser(user);
    setSelectedBusinessIds(user.businesses?.map((b) => b.id) || []);
    setAssignError('');
    setAssignModalOpen(true);
  }, []);

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

  const openRoleModal = useCallback((user, action) => {
    setRoleModalUser(user);
    setRoleModalAction(action);
    setRoleError('');
    setRoleModalOpen(true);
  }, []);

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

  const handleDeleteUser = useCallback((userId, userName) => {
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
              Alert.alert(t('error'), err.response?.data?.error || t('failedDeleteUser'));
            }
          },
        },
      ]
    );
  }, [t, fetchData]);

  const renderItem = useCallback(({ item, index, isUnassigned }) => (
    <FadeInItem index={index}>
      <UserItem
        key={item.id}
        user={item}
        isUnassigned={isUnassigned}
        styles={styles}
        colors={colors}
        t={t}
        getDynamic={getDynamic}
        isSuperAdmin={isSuperAdmin}
        onAssign={openAssignModal}
        onRoleChange={openRoleModal}
        onDelete={handleDeleteUser}
      />
    </FadeInItem>
  ), [styles, colors, t, getDynamic, isSuperAdmin, openAssignModal, openRoleModal, handleDeleteUser]);

  if (loading) return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.header}>{t('users')}</Text>
        <SkeletonList count={6} type="task" />
      </View>
    </Screen>
  );

  const adminUsers = allUsers.filter((u) => u.role === 'admin');
  const regularUsers = allUsers.filter((u) => u.role === 'user');

  return (
    <Screen style={styles.container} bottomOffset={56}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={onRefresh} />}
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
            {unassigned.map((u, i) => renderItem({ item: u, index: i, isUnassigned: true }))}
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
            {adminUsers.map((u, i) => renderItem({ item: u, index: i, isUnassigned: false }))}
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
            {regularUsers.map((u, i) => renderItem({ item: u, index: i, isUnassigned: false }))}
          </View>
        )}
      </ScrollView>

      {/* Assign Modal */}
      <Modal open={assignModalOpen} onClose={() => setAssignModalOpen(false)} title={t('assignUserToBusinesses')}>
        {assignError && <ErrorBanner message={assignError} />}
        {selectedUser && (
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserName}>{getDynamic(selectedUser.name)}</Text>
            <Text style={styles.selectedUserEmail}>{selectedUser.username}</Text>
          </View>
        )}
        <Text style={styles.pickerLabel}>{t('selectBusinessesMultiple')}</Text>
        <ScrollView style={styles.bizList} showsVerticalScrollIndicator={false}>
          {businesses.map((biz) => (
            <AnimatedPressable
              key={biz.id}
              style={styles.bizCheckItem}
              onPress={() => toggleBusiness(biz.id)}
              haptic="light"
            >
              <Ionicons
                name={selectedBusinessIds.includes(biz.id) ? 'checkbox' : 'square-outline'}
                size={22}
                color={selectedBusinessIds.includes(biz.id) ? colors.brand[600] : colors.gray[400]}
              />
              <Text style={styles.bizCheckText}>{getDynamic(biz.name)}</Text>
            </AnimatedPressable>
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
            <Text style={styles.selectedUserName}>{getDynamic(roleModalUser.name)}</Text>
            <Text style={styles.selectedUserEmail}>{roleModalUser.username}</Text>
            <Text style={styles.selectedUserRole}>{t('currentRole')}: {roleLabel(roleModalUser.role, t)}</Text>
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
    </Screen>
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
