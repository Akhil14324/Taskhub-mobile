import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator,
  Modal, Pressable, Linking,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { Screen } from '../components/UI';

const DELETE_WINDOW_MS = 15 * 60 * 1000;

function getDayKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA');
}

function formatDateLabel(dateStr, lang, t) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - msgDay) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('today');
  if (diffDays === 1) return t('yesterday');
  const locale = lang === 'te' ? 'te-IN' : 'en-GB';
  return msgDay.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ChatThreadScreen() {
  const { user } = useAuth();
  const {
    conversations, messages, typingUsers, onlineUsers, connected,
    loadMessages, sendMessage, markRead, sendTypingStart, sendTypingStop,
    uploadFile, setActiveConversation, fetchConversations, deleteMessage,
  } = useChat();
  const colors = useColors();
  const { t, lang, translateDynamic, getDynamic } = useLang();
  const navigation = useNavigation();
  const route = useRoute();
  const { conversationId } = route.params;

  const [text, setText] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const flatListRef = useRef(null);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const conversation = conversations.find((c) => c.id === conversationId);
  const activeTyping = typingUsers[conversationId] || [];

  useEffect(() => {
    setActiveConversation(conversationId);
    loadMessages(conversationId).then(setHasMore);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation, loadMessages]);

  // Translate messages and conversation titles when in Telugu
  useEffect(() => {
    if (lang !== 'te') return;
    const texts = [];
    if (conversation?.type === 'group' && conversation.name) texts.push(conversation.name);
    conversation?.participants?.forEach((p) => { if (p.name) texts.push(p.name); });
    messages.forEach((m) => {
      if (m.body) texts.push(m.body);
      if (m.senderName) texts.push(m.senderName);
    });
    const unique = [...new Set(texts)];
    if (unique.length > 0) translateDynamic(unique);
  }, [conversation, messages, lang, translateDynamic]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastOtherMsg = [...messages].reverse().find((m) => m.senderId !== user.id);
      if (lastOtherMsg) {
        markRead(conversationId, lastOtherMsg.id);
      }
    }
  }, [messages, user.id, conversationId, markRead]);

  const conversationTitle = useMemo(() => {
    if (!conversation) return t('chat');
    if (conversation.type === 'group') return getDynamic(conversation.name);
    const other = conversation.participants?.find((p) => String(p.id) !== String(user.id));
    return getDynamic(other?.name) || t('direct');
  }, [conversation, user.id, getDynamic]);

  const otherParticipants = conversation?.participants?.filter((p) => String(p.id) !== String(user.id)) || [];
  const isOtherOnline = otherParticipants.length > 0 && otherParticipants.some((p) => onlineUsers.has(p.id));

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }
    try {
      await sendMessage(conversationId, trimmed);
    } catch {
      // ignore
    }
  };

  const handleTyping = (val) => {
    setText(val);
    if (val.trim() && !isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingStart(conversationId);
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        sendTypingStop(conversationId);
      }
    }, 2000);
  };

  const handlePickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploading(true);
      try {
        const uploadResult = await uploadFile(asset.uri, asset.mimeType, asset.name);
        await sendMessage(conversationId, null, uploadResult.url, uploadResult.type);
      } catch {
        // ignore
      } finally {
        setUploading(false);
      }
    } catch {
      // ignore
    }
  };

  const onLoadMore = useCallback(async () => {
    if (messages.length === 0 || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const firstId = messages[0].id;
    const more = await loadMessages(conversationId, firstId);
    setHasMore(more);
    setLoadingMore(false);
  }, [messages, loadingMore, hasMore, conversationId, loadMessages]);

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(lang === 'te' ? 'te-IN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const [confirmScope, setConfirmScope] = useState(null);

  const handleDeleteMessage = async (scope) => {
    if (!deleteTarget) return;
    setShowDeleteSheet(false);
    setConfirmScope(scope);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !confirmScope) return;
    await deleteMessage(deleteTarget.id, confirmScope);
    setDeleteTarget(null);
    setConfirmScope(null);
  };

  const onLongPressMessage = (item) => {
    if (item.deleted_at) return;
    setDeleteTarget(item);
    setShowDeleteSheet(true);
  };

  const canDeleteForEveryone = (() => {
    if (!deleteTarget) return false;
    if (deleteTarget.senderId !== user.id) return false;
    const created = new Date(deleteTarget.createdAt);
    if (isNaN(created.getTime())) return false;
    return Date.now() - created.getTime() <= DELETE_WINDOW_MS;
  })();

  const renderMessage = ({ item, index }) => {
    const isOwn = item.senderId === user.id;
    const prevMsg = messages[index - 1];
    const showAvatar = !prevMsg || prevMsg.senderId !== item.senderId;
    const isDeleted = item.deleted_at !== null;
    const allRead = isOwn && item.readBy && conversation?.participants &&
      item.readBy.length >= conversation.participants.filter((p) => p.id !== item.senderId).length;

    const currentDay = getDayKey(item.createdAt);
    const prevDay = prevMsg ? getDayKey(prevMsg.createdAt) : null;
    const showDateHeader = index === 0 || currentDay !== prevDay;

    return (
      <View>
        {showDateHeader && currentDay && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{formatDateLabel(item.createdAt, lang, t)}</Text>
          </View>
        )}
      <TouchableOpacity
        onLongPress={() => onLongPressMessage(item)}
        delayLongPress={400}
        activeOpacity={1}
        style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}
      >
        <View style={[styles.msgBubble, isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther]}>
          {showAvatar && !isOwn && (
            <Text style={styles.senderName}>{getDynamic(item.senderName)}</Text>
          )}
          {isDeleted ? (
            <Text style={styles.deletedMsg}>{t('messageDeleted')}</Text>
          ) : (
            <>
              {item.body && <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{getDynamic(item.body)}</Text>}
              {item.attachmentUrl && item.attachmentType?.startsWith('image/') && (
                <Image
                  source={{ uri: item.attachmentUrl }}
                  style={styles.msgImage}
                  resizeMode="cover"
                />
              )}
              {item.attachmentUrl && !item.attachmentType?.startsWith('image/') && (
                <TouchableOpacity onPress={() => Linking.openURL(item.attachmentUrl)}>
                  <Text style={[styles.attachmentLink, isOwn && styles.attachmentLinkOwn]}>{t('viewAttachment')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>{formatTime(item.createdAt)}</Text>
            {isOwn && !isDeleted && (
              <Ionicons
                name={allRead ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={allRead ? colors.blue[500] : colors.gray[400]}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
      </View>
    );
  };

  const typingText = activeTyping.length > 0
    ? activeTyping.length === 1
      ? `${getDynamic(activeTyping[0].userName)} ${t('isTyping')}`
      : `${activeTyping.map((u) => getDynamic(u.userName)).join(', ')} ${t('areTyping')}`
    : '';

  return (
    <Screen style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.gray[700]} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{conversationTitle}</Text>
          <Text style={styles.headerSubtitle}>
            {conversation?.type === 'group'
              ? `${conversation?.participants?.length || 0} ${t('members')}`
              : isOtherOnline ? t('online') : t('offline')}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMessage}
        extraData={lang}
        inverted={false}
        contentContainerStyle={styles.messagesList}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.1}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {loadingMore && <ActivityIndicator size="small" color={colors.gray[400]} />}
            {messages.length === 0 && !loadingMore && (
              <Text style={styles.noMessages}>{t('noMessagesYet')}</Text>
            )}
          </View>
        }
        ListFooterComponent={
          typingText ? (
            <View style={styles.typingContainer}>
              <Text style={styles.typingText}>{typingText}</Text>
            </View>
          ) : null
        }
      />

      <View style={styles.inputBar}>
        <TouchableOpacity onPress={handlePickAttachment} disabled={uploading} style={styles.attachBtn}>
          {uploading ? (
            <ActivityIndicator size="small" color={colors.gray[400]} />
          ) : (
            <Ionicons name="attach" size={24} color={colors.gray[500]} />
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={handleTyping}
          placeholder={t('typeMessage')}
          placeholderTextColor={colors.gray[400]}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity onPress={handleSend} disabled={!text.trim()} style={styles.sendBtn}>
          <Ionicons name="send" size={20} color={text.trim() ? colors.white : colors.gray[400]} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showDeleteSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeleteSheet(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowDeleteSheet(false)}>
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => handleDeleteMessage('me')}
            >
              <Ionicons name="trash-outline" size={20} color={colors.gray[700]} />
              <Text style={styles.sheetItemText}>{t('deleteForMe')}</Text>
            </TouchableOpacity>
            {canDeleteForEveryone && (
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => handleDeleteMessage('everyone')}
              >
                <Ionicons name="trash" size={20} color={colors.red[500]} />
                <Text style={[styles.sheetItemText, { color: colors.red[500] }]}>{t('deleteForEveryone')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.sheetItem, styles.sheetCancel]}
              onPress={() => setShowDeleteSheet(false)}
            >
              <Text style={styles.sheetCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmScope !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmScope(null)}
      >
        <Pressable style={styles.confirmOverlay} onPress={() => setConfirmScope(null)}>
          <Pressable style={styles.confirmDialog} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmText}>
              {confirmScope === 'everyone' ? t('deleteForEveryoneConfirm') : t('deleteForMeConfirm')}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity onPress={() => setConfirmScope(null)} style={styles.confirmCancelBtn}>
                <Text style={styles.confirmCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={styles.confirmDeleteBtn}>
                <Text style={styles.confirmDeleteText}>{t('delete')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  inner: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.gray[900] },
  headerSubtitle: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  messagesList: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  listHeader: { paddingVertical: spacing.sm, alignItems: 'center' },
  noMessages: { fontSize: fontSize.sm, color: colors.gray[400], textAlign: 'center', paddingVertical: spacing.xl },
  dateSeparator: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  dateSeparatorText: {
    fontSize: fontSize.xs,
    color: colors.gray[500],
    backgroundColor: colors.gray[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  msgRow: { flexDirection: 'row', marginBottom: spacing.xs },
  msgRowOwn: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgBubble: {
    maxWidth: '75%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  msgBubbleOwn: { backgroundColor: colors.brand[600], borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: colors.gray[100], borderBottomLeftRadius: 4 },
  senderName: { fontSize: fontSize.xs, color: colors.gray[500], marginBottom: 2 },
  msgText: { fontSize: fontSize.base, color: colors.gray[900] },
  msgTextOwn: { color: colors.white },
  deletedMsg: { fontSize: fontSize.sm, fontStyle: 'italic', color: colors.gray[400] },
  msgImage: { width: 200, height: 200, borderRadius: radius.md, marginTop: spacing.xs },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  msgTime: { fontSize: 10, color: colors.gray[400] },
  msgTimeOwn: { color: 'rgba(255,255,255,0.7)' },
  typingContainer: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  typingText: { fontSize: fontSize.xs, color: colors.gray[400], fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  attachBtn: { padding: spacing.sm },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.gray[900],
    marginHorizontal: spacing.xs,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    paddingHorizontal: spacing.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[300],
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  sheetItemText: {
    fontSize: fontSize.base,
    color: colors.gray[900],
  },
  sheetCancel: {
    justifyContent: 'center',
    borderBottomWidth: 0,
    paddingVertical: spacing.lg,
  },
  sheetCancelText: {
    fontSize: fontSize.base,
    color: colors.gray[500],
    fontWeight: '500',
  },
  attachmentLink: {
    fontSize: fontSize.sm,
    color: colors.brand[600],
    marginTop: spacing.xs,
    textDecorationLine: 'underline',
  },
  attachmentLinkOwn: {
    color: colors.white,
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  confirmDialog: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '80%',
  },
  confirmText: {
    fontSize: fontSize.base,
    color: colors.gray[900],
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  confirmCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
  },
  confirmCancelText: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
  },
  confirmDeleteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.red[600],
  },
  confirmDeleteText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '500',
  },
});
