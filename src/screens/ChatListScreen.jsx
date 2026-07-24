import { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { spacing, radius, fontSize } from '../theme/theme';
import Modal from '../components/Modal';
import api from '../api/client';

export default function ChatListScreen() {
  const { user } = useAuth();
  const { conversations, fetchConversations, totalUnread, onlineUsers, createConversation } = useChat();
  const colors = useColors();
  const { t } = useLang();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [chatType, setChatType] = useState('direct');
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      const allUsers = (res.data.users || res.data || []).filter((u) => u.id !== user.id);
      setUsers(allUsers);
    } catch {
      // ignore
    }
  };

  const openNewModal = () => {
    setSelected([]);
    setChatType('direct');
    setGroupName('');
    setSearch('');
    fetchUsers();
    setShowNewModal(true);
  };

  const toggleSelect = (userId) => {
    setSelected((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (chatType === 'direct') return [userId];
      return [...prev, userId];
    });
  };

  const handleCreate = async () => {
    if (selected.length === 0) return;
    if (chatType === 'group' && !groupName.trim()) return;
    try {
      const conv = await createConversation(chatType, selected, groupName.trim() || undefined);
      setShowNewModal(false);
      navigation.navigate('ChatThread', { conversationId: conv.id });
    } catch {
      // ignore
    }
  };

  const getConversationTitle = (conv) => {
    if (conv.type === 'group') return conv.name;
    const other = conv.participants?.find((p) => p.id !== user.id);
    return other?.name || 'Unknown';
  };

  const filteredUsers = users.filter((u) =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }) => {
    const title = getConversationTitle(item);
    const lastMsg = item.last_message;
    const preview = lastMsg
      ? lastMsg.deleted_at
        ? 'This message was deleted'
        : lastMsg.body || '[Attachment]'
      : 'No messages yet';
    const isGroup = item.type === 'group';
    const otherParticipant = !isGroup ? item.participants?.find((p) => p.id !== user.id) : null;
    const isOnline = otherParticipant && onlineUsers.has(otherParticipant.id);

    return (
      <TouchableOpacity
        style={styles.convItem}
        onPress={() => navigation.navigate('ChatThread', { conversationId: item.id })}
      >
        <View style={styles.avatar}>
          {isGroup ? (
            <Ionicons name="people" size={22} color={colors.indigo[600]} />
          ) : (
            <Text style={styles.avatarText}>{title?.charAt(0)?.toUpperCase() || '?'}</Text>
          )}
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.convContent}>
          <View style={styles.convHeader}>
            <Text style={styles.convTitle} numberOfLines={1}>{title}</Text>
            {item.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.convPreview} numberOfLines={1}>{preview}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('chat')}</Text>
        <TouchableOpacity onPress={openNewModal} style={styles.newBtn}>
          <Ionicons name="create-outline" size={22} color={colors.brand[600]} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.gray[300]} />
            <Text style={styles.emptyText}>{t('noConversations')}</Text>
            <TouchableOpacity onPress={openNewModal} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>{t('startAChat')}</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title={t('newConversation')}>
        <View style={styles.modalContent}>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, chatType === 'direct' && styles.typeBtnActive]}
              onPress={() => { setChatType('direct'); setSelected([]); }}
            >
              <Ionicons name="person" size={16} color={chatType === 'direct' ? colors.white : colors.gray[600]} />
              <Text style={[styles.typeBtnText, chatType === 'direct' && styles.typeBtnTextActive]}>{t('direct')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, chatType === 'group' && styles.typeBtnActive]}
              onPress={() => { setChatType('group'); setSelected([]); }}
            >
              <Ionicons name="people" size={16} color={chatType === 'group' ? colors.white : colors.gray[600]} />
              <Text style={[styles.typeBtnText, chatType === 'group' && styles.typeBtnTextActive]}>{t('group')}</Text>
            </TouchableOpacity>
          </View>

          {chatType === 'group' && (
            <TextInput
              style={styles.groupNameInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder={t('groupName')}
              placeholderTextColor={colors.gray[400]}
            />
          )}

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchUsers')}
            placeholderTextColor={colors.gray[400]}
          />

          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id.toString()}
            style={styles.userList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.userItem, selected.includes(item.id) && styles.userItemSelected]}
                onPress={() => toggleSelect(item.id)}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.name}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                </View>
                {selected.includes(item.id) && (
                  <Ionicons name="checkmark" size={20} color={colors.brand[600]} />
                )}
              </TouchableOpacity>
            )}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowNewModal(false)}
            >
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createBtn, selected.length === 0 && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={selected.length === 0}
            >
              <Text style={styles.createBtnText}>
                {chatType === 'group' ? t('createGroup') : t('startChat')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

import { TextInput } from 'react-native';

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[900] },
  newBtn: { padding: spacing.xs },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gray[200],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.brand[700] },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green[500],
    borderWidth: 2,
    borderColor: colors.white,
  },
  convContent: { flex: 1 },
  convHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900], flex: 1 },
  unreadBadge: {
    backgroundColor: colors.brand[600],
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
  convPreview: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  emptyContainer: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyText: { fontSize: fontSize.base, color: colors.gray[500], marginTop: spacing.md, marginBottom: spacing.lg },
  emptyBtn: {
    backgroundColor: colors.brand[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  emptyBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },
  modalContent: { paddingBottom: spacing.xl },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
  },
  typeBtnActive: { backgroundColor: colors.brand[600] },
  typeBtnText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.gray[600] },
  typeBtnTextActive: { color: colors.white },
  groupNameInput: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
  userList: { maxHeight: 250 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  userItemSelected: { backgroundColor: colors.brand[50] },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  userAvatarText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.brand[700] },
  userInfo: { flex: 1 },
  userName: { fontSize: fontSize.base, fontWeight: '500', color: colors.gray[900] },
  userEmail: { fontSize: fontSize.xs, color: colors.gray[500] },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
  },
  cancelBtnText: { fontSize: fontSize.base, fontWeight: '500', color: colors.gray[600] },
  createBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brand[600],
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: fontSize.base, fontWeight: '600', color: colors.white },
});
