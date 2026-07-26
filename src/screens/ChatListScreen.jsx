import { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Alert } from 'react-native';
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
  const { conversations, fetchConversations, totalUnread, onlineUsers, createConversation, deleteConversation, markRead } = useChat();
  const colors = useColors();
  const { t, lang, translateDynamic, getDynamic } = useLang();
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

  // Translate conversation titles and last messages when in Telugu
  useEffect(() => {
    if (lang !== 'te' || conversations.length === 0) return;
    const texts = [];
    conversations.forEach((conv) => {
      if (conv.type === 'group' && conv.name) texts.push(conv.name);
      conv.participants?.forEach((p) => { if (p.name) texts.push(p.name); });
      if (conv.last_message?.body) texts.push(conv.last_message.body);
    });
    users.forEach((u) => { if (u.name) texts.push(u.name); });
    const unique = [...new Set(texts)];
    if (unique.length > 0) translateDynamic(unique);
  }, [conversations, users, lang, translateDynamic]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/chat/users');
      setUsers(res.data.users || []);
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
    const recipients = selected.filter((id) => String(id) !== String(user?.id));
    if (recipients.length === 0) return;
    if (chatType === 'direct' && recipients.length !== 1) return;
    if (chatType === 'group' && !groupName.trim()) return;
    if (chatType === 'group' && recipients.length < 2) return;
    try {
      const conv = await createConversation(chatType, recipients, groupName.trim() || undefined);
      setShowNewModal(false);
      navigation.navigate('ChatThread', { conversationId: conv.id });
    } catch (err) {
      Alert.alert(t('somethingWentWrong'), err.response?.data?.error || t('failedCreateConversation'));
    }
  };

  const handleMarkConversationRead = async (conversationId) => {
    const conv = conversations.find((c) => c.id === conversationId);
    const lastMsg = conv?.last_message;
    if (lastMsg && conv?.unread_count > 0) {
      try {
        await markRead(conversationId, lastMsg.id);
        await fetchConversations();
      } catch {
        // ignore
      }
    }
  };

  const showChatOptions = (item) => {
    const options = [
      { text: t('cancel'), style: 'cancel' },
    ];
    if (item.unread_count > 0) {
      options.unshift({
        text: t('markAsRead'),
        onPress: () => handleMarkConversationRead(item.id),
      });
    }
    options.unshift({
      text: t('delete'),
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          t('deleteChat'),
          '',
          [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('delete'),
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteConversation(item.id);
                } catch {
                  // ignore
                }
              },
            },
          ]
        );
      },
    });
    Alert.alert(t('chatOptions'), '', options);
  };

  const getConversationTitle = (conv) => {
    if (conv.type === 'group') return getDynamic(conv.name);
    const other = conv.participants?.find((p) => String(p.id) !== String(user.id));
    return getDynamic(other?.name) || t('unknown');
  };

  const filteredUsers = users.filter((u) =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }) => {
    const title = getConversationTitle(item);
    const lastMsg = item.last_message;
    const preview = lastMsg
      ? lastMsg.deleted_at
        ? t('messageDeleted')
        : getDynamic(lastMsg.body) || t('attachment')
      : t('noMessagesYet');
    const isGroup = item.type === 'group';
    const otherParticipant = !isGroup ? item.participants?.find((p) => String(p.id) !== String(user.id)) : null;
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
            <View style={styles.titleRow}>
              <Text style={styles.convTitle} numberOfLines={1}>{title}</Text>
              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); showChatOptions(item); }}
              style={styles.optionsBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.gray[500]} />
            </TouchableOpacity>
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
        extraData={lang}
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
            extraData={lang}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.userItem, selected.includes(item.id) && styles.userItemSelected]}
                onPress={() => toggleSelect(item.id)}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{getDynamic(item.name)}</Text>
                  <Text style={styles.userEmail}>{item.username}</Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm },
  convTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[900] },
  unreadBadge: {
    backgroundColor: colors.brand[600],
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  unreadText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },
  optionsBtn: { padding: spacing.xs },
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
