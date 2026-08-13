import { memo, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable, Linking, Alert, ScrollView, Dimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { createAudioPlayer, useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useColors } from '../context/ThemeContext';
import { useLang } from '../context/LanguageContext';
import { spacing, radius, fontSize } from '../theme/theme';
import { Screen } from '../components/UI';
import SmartImage from '../components/SmartImage';
import BottomSheet from '../components/BottomSheet';
import HeroImage from '../components/HeroImage';
import AnimatedPressable from '../components/AnimatedPressable';
import TypingIndicator from '../components/TypingIndicator';

const DELETE_WINDOW_MS = 15 * 60 * 1000;
const MAX_RECORDING_SECONDS = 5 * 60;
const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_IMAGE_SIZE = Math.min(SCREEN_WIDTH * 0.6, 240);

// Module-level ref: only one audio plays at a time. Holds the stop() fn of the active audio.
let activeAudioStopRef = null;

const AudioMessage = memo(function AudioMessage({ uri, isOwn, colors, styles, t }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);
  const subscriptionRef = useRef(null);

  const stop = useCallback(() => {
    try {
      const player = playerRef.current;
      if (player) {
        player.pause();
        player.seekTo(0);
      }
    } catch {
      // player may have been released
    }
    setIsPlaying(false);
    setProgress(0);
  }, []);

  const play = useCallback(() => {
    // Stop any other currently-playing audio
    if (activeAudioStopRef && activeAudioStopRef !== stop) {
      activeAudioStopRef();
    }
    try {
      let player = playerRef.current;
      if (!player) {
        player = createAudioPlayer({ uri });
        playerRef.current = player;
        subscriptionRef.current = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            stop();
          } else if (status.isLoaded && status.duration > 0) {
            setDuration(status.duration * 1000);
            setProgress(status.currentTime / status.duration);
          }
        });
      }
      activeAudioStopRef = stop;
      setIsPlaying(true);
      setProgress(0);
      setDuration(0);
      player.seekTo(0);
      player.play();
    } catch {
      // ignore
    }
  }, [stop, uri]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  }, [isPlaying, play, stop]);

  useEffect(() => {
    return () => {
      if (activeAudioStopRef === stop) activeAudioStopRef = null;
      try {
        if (subscriptionRef.current) {
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }
      } catch {
        // ignore
      }
      try {
        if (playerRef.current) {
          playerRef.current.release();
          playerRef.current = null;
        }
      } catch {
        playerRef.current = null;
      }
    };
  }, [stop]);

  const fmt = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
  };

  return (
    <AnimatedPressable style={styles.audioBubble} onPress={toggle} haptic="light">
      <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={isOwn ? colors.white : colors.gray[700]} />
      <View style={styles.audioProgressContainer}>
        <View style={[styles.audioProgressBar, isOwn && styles.audioProgressBarOwn]}>
          {isPlaying && (
            <View style={[styles.audioProgressFill, isOwn && styles.audioProgressFillOwn, { width: `${Math.min(progress * 100, 100)}%` }]} />
          )}
        </View>
        <Text style={[styles.audioText, isOwn && styles.msgTextOwn]}>
          {isPlaying && duration > 0 ? `${fmt(progress * duration)} / ${fmt(duration)}` : t('voiceMessage')}
        </Text>
      </View>
    </AnimatedPressable>
  );
});

const MessageItem = memo(function MessageItem({ item, prevMsg, nextMsg, isFirst, user, participantMap, participantCount, lastReadId, colors, styles, t, lang, getDynamic, formatTime, onLongPress, onReply, onReact }) {
  const isOwn = item.senderId === user.id;
  const showAvatar = !prevMsg || prevMsg.senderId !== item.senderId;
  const isGrouped = nextMsg && nextMsg.senderId === item.senderId && getDayKey(nextMsg.createdAt) === getDayKey(item.createdAt);
  const isDeleted = item.deleted_at !== null;
  const otherParticipantCount = Math.max(participantCount - 1, 0);
  const allRead = isOwn && item.readBy && otherParticipantCount > 0 &&
    item.readBy.length >= otherParticipantCount;

  const currentDay = getDayKey(item.createdAt);
  const prevDay = prevMsg ? getDayKey(prevMsg.createdAt) : null;
  const showDateHeader = isFirst || currentDay !== prevDay;

  const isUnread = !isOwn && item.id > lastReadId;
  const showUnreadSeparator = isUnread && (!prevMsg || prevMsg.id <= lastReadId || getDayKey(prevMsg.createdAt) !== currentDay);

  const sender = participantMap?.get(String(item.senderId));
  const profilePic = sender?.profile_picture;

  const translateX = useSharedValue(0);
  const replyIconOpacity = useSharedValue(0);

  // Entrance animation: fade-in + slide-up on mount
  const enterOpacity = useSharedValue(0);
  const enterTranslateY = useSharedValue(8);
  useEffect(() => {
    enterOpacity.value = withTiming(1, { duration: 300 });
    enterTranslateY.value = withSpring(0, { damping: 18, stiffness: 260, mass: 0.6 });
  }, [enterOpacity, enterTranslateY]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterTranslateY.value }],
  }));

  // Unread separator pulse
  const unreadPulse = useSharedValue(0.5);
  useEffect(() => {
    if (showUnreadSeparator) {
      unreadPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.5, { duration: 800 }),
        ),
        -1,
        false,
      );
    }
  }, [showUnreadSeparator, unreadPulse]);
  const unreadLineStyle = useAnimatedStyle(() => ({
    opacity: unreadPulse.value,
  }));

  const pan = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY(5)
    .onUpdate((e) => {
      if (e.translationX > 0 && e.translationX < 80) {
        translateX.value = e.translationX;
        replyIconOpacity.value = interpolate(e.translationX, [0, 80], [0, 1], Extrapolation.CLAMP);
      }
    })
    .onEnd((e) => {
      if (e.translationX > 40) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(onReply)(item);
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      replyIconOpacity.value = withSpring(0);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: replyIconOpacity.value,
  }));

  return (
    <Animated.View style={enterStyle}>
      {showDateHeader && currentDay && (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{formatDateLabel(item.createdAt, lang, t)}</Text>
        </View>
      )}
      {showUnreadSeparator && (
        <View style={styles.unreadSeparator}>
          <Animated.View style={[styles.unreadLine, unreadLineStyle]} />
          <Text style={styles.unreadText}>{t('unreadMessages')}</Text>
          <Animated.View style={[styles.unreadLine, unreadLineStyle]} />
        </View>
      )}
      <View style={styles.swipeRowWrapper}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.msgRowAnimated, isOwn ? styles.msgRowOwn : styles.msgRowOther, rowStyle]}
          >
            <TouchableOpacity
              onLongPress={() => onLongPress(item)}
              delayLongPress={400}
              activeOpacity={1}
              style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther, isGrouped && styles.msgRowGrouped]}
            >
              {!isOwn && showAvatar && profilePic && (
                <SmartImage source={profilePic} style={styles.msgAvatar} />
              )}
              <View style={[styles.msgBubble, isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther]}>
                {showAvatar && !isOwn && (
                  <Text style={styles.senderName}>{getDynamic(item.senderName)}</Text>
                )}
                {isDeleted ? (
                  <Text style={styles.deletedMsg}>{t('messageDeleted')}</Text>
                ) : (
                  <>
                    {item.replyTo && (
                      <View style={[styles.replyPreview, isOwn && styles.replyPreviewOwn]}>
                        <View style={styles.replyBar} />
                        <View style={styles.replyContent}>
                          <Text style={[styles.replyName, isOwn && styles.replyNameOwn]}>
                            {getDynamic(item.replyTo.senderName)}
                          </Text>
                          <Text style={[styles.replyText, isOwn && styles.replyTextOwn]} numberOfLines={1}>
                            {item.replyTo.body || (item.replyTo.attachmentUrl ? t('attachment') : '')}
                          </Text>
                        </View>
                      </View>
                    )}
                    {item.body && <Text style={[styles.msgText, isOwn && styles.msgTextOwn]} selectable>{getDynamic(item.body)}</Text>}
                    {item.attachmentUrl && item.attachmentType?.startsWith('image/') && (
                      <HeroImage source={item.attachmentUrl} thumbStyle={styles.msgImage} />
                    )}
                    {item.attachmentUrl && item.attachmentType?.startsWith('audio/') && (
                      <AudioMessage uri={item.attachmentUrl} isOwn={isOwn} colors={colors} styles={styles} t={t} />
                    )}
                    {item.attachmentUrl && !item.attachmentType?.startsWith('image/') && !item.attachmentType?.startsWith('audio/') && (
                      <AnimatedPressable onPress={() => Linking.openURL(item.attachmentUrl)} haptic="light">
                        <Text style={[styles.attachmentLink, isOwn && styles.attachmentLinkOwn]}>{t('viewAttachment')}</Text>
                      </AnimatedPressable>
                    )}
                    {item.reactions && Object.keys(item.reactions).length > 0 && (
                      <View style={styles.reactionsRow}>
                        {Object.entries(item.reactions).map(([emoji, users]) => (
                          <AnimatedPressable key={emoji} style={[styles.reactionBadge, isOwn && styles.reactionBadgeOwn]} onPress={() => onReact(item.id, emoji)} haptic="light">
                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                            <Text style={[styles.reactionCount, isOwn && styles.reactionCountOwn]}>{users.length}</Text>
                          </AnimatedPressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
                <View style={styles.msgMeta}>
                  <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>{formatTime(item.createdAt)}</Text>
                  {item.isEdited && <Text style={[styles.editedLabel, isOwn && styles.msgTimeOwn]}>{t('edited')}</Text>}
                  {isOwn && !isDeleted && (
                    <Ionicons name={allRead ? 'checkmark-done' : 'checkmark'} size={14} color={allRead ? colors.blue[500] : colors.gray[400]} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </GestureDetector>
        <Animated.View
          pointerEvents="none"
          style={[styles.swipeReplyIcon, isOwn ? styles.swipeReplyIconOwn : styles.swipeReplyIconOther, iconStyle]}
        >
          <Ionicons name="arrow-undo" size={20} color={colors.brand[600]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
});

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
    uploadFile, setActiveConversation, fetchConversations, deleteMessage, reactToMessage,
    editMessage, forwardMessage, pinMessage, fetchPinnedMessage, updateLastSeen, muteConversation,
    pinnedMessage,
  } = useChat();
  const colors = useColors();
  const { t, lang, translateDynamic, getDynamic } = useLang();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { conversationId } = route.params;

  const [text, setText] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const [replyTo, setReplyTo] = useState(null);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [floatingDate, setFloatingDate] = useState(null);
  const [toast, setToast] = useState(null);
  const toastOpacity = useSharedValue(0);
  const toastTranslateY = useSharedValue(20);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message) => {
    setToast(message);
    toastOpacity.value = withTiming(1, { duration: 250 });
    toastTranslateY.value = withSpring(0, { damping: 16, stiffness: 250, mass: 0.7 });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 250 });
      toastTranslateY.value = withTiming(20, { duration: 250 });
      setTimeout(() => setToast(null), 250);
    }, 2000);
  }, [toastOpacity, toastTranslateY]);
  const toastStyle = useAnimatedStyle(() => ({
    opacity: toastOpacity.value,
    transform: [{ translateY: toastTranslateY.value }],
  }));
  const scrollBtnScale = useSharedValue(0);
  const scrollBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scrollBtnScale.value }],
  }));
  useEffect(() => {
    scrollBtnScale.value = showScrollToBottom
      ? withSpring(1, { damping: 14, stiffness: 300, mass: 0.5 })
      : withSpring(0, { damping: 16, stiffness: 300, mass: 0.5 });
  }, [showScrollToBottom, scrollBtnScale]);
  const [showForwardModal, setShowForwardModal] = useState(null);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingRef = useRef(false);
  const recorderAvailable = !!recorder && typeof recorder.record === 'function';
  const recordDotScale = useSharedValue(1);
  const recordInputOpacity = useSharedValue(1);
  useEffect(() => {
    if (recording) {
      recordDotScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
      recordInputOpacity.value = withTiming(0, { duration: 150 });
    } else {
      recordDotScale.value = withTiming(1, { duration: 200 });
      recordInputOpacity.value = withTiming(1, { duration: 150 });
    }
  }, [recording, recordDotScale, recordInputOpacity]);
  const recordDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recordDotScale.value }],
  }));
  const recordInputStyle = useAnimatedStyle(() => ({
    opacity: recordInputOpacity.value,
  }));
  // Reply bar slide-in animation
  const replyBarHeight = useSharedValue(0);
  const replyBarOpacity = useSharedValue(0);
  useEffect(() => {
    if (replyTo) {
      replyBarHeight.value = withSpring(1, { damping: 16, stiffness: 300, mass: 0.6 });
      replyBarOpacity.value = withTiming(1, { duration: 200 });
    } else {
      replyBarHeight.value = withSpring(0, { damping: 16, stiffness: 300, mass: 0.6 });
      replyBarOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [replyTo, replyBarHeight, replyBarOpacity]);
  const replyBarStyle = useAnimatedStyle(() => ({
    opacity: replyBarOpacity.value,
    transform: [{ translateY: interpolate(replyBarHeight.value, [0, 1], [-20, 0], Extrapolation.CLAMP) }],
  }));
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const flatListRef = useRef(null);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const conversation = conversations.find((c) => c.id === conversationId);
  const activeTyping = typingUsers[conversationId] || [];

  // Precompute participant map for O(1) lookup per message (avoids find() in every MessageItem)
  const participantMap = useMemo(() => {
    const map = new Map();
    conversation?.participants?.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [conversation]);
  const participantCount = conversation?.participants?.length || 0;

  useEffect(() => {
    setActiveConversation(conversationId);
    loadMessages(conversationId).then(setHasMore);
    fetchPinnedMessage(conversationId);
    updateLastSeen();
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation, loadMessages, fetchPinnedMessage, updateLastSeen]);

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

  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const grew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (grew && messages.length > 0) {
      const timeout = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [messages]);

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
    const replyId = replyTo?.id || null;
    setReplyTo(null);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }
    try {
      await sendMessage(conversationId, trimmed, null, null, replyId);
    } catch {
      // ignore
    }
  };

  const handleTyping = (val) => {
    setText(val);
    if (editingMessage) return;
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

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('cameraPermissionRequired'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploading(true);
      try {
        const uploadResult = await uploadFile(asset.uri, 'image/jpeg', `photo_${Date.now()}.jpg`);
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

  const formatTime = useCallback((dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(lang === 'te' ? 'te-IN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }, [lang]);

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

  const onLongPressMessage = useCallback((item) => {
    if (item.deleted_at) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReactionTarget(item);
  }, []);

  const handleReply = useCallback((item) => {
    setReplyTo(item);
    setReactionTarget(null);
  }, []);

  const handleReact = useCallback((emoji) => {
    if (reactionTarget) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      reactToMessage(reactionTarget.id, emoji);
    }
    setReactionTarget(null);
  }, [reactionTarget, reactToMessage]);

  const handleCopyMessage = async (item) => {
    setReactionTarget(null);
    if (item.body) {
      try {
        await Clipboard.setStringAsync(item.body);
        showToast(t('copiedToClipboard'));
      } catch {
        // ignore clipboard errors
      }
    }
  };

  const handleEditMessage = (item) => {
    setReactionTarget(null);
    setReplyTo(null);
    setEditingMessage(item);
    setText(item.body || '');
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !text.trim()) return;
    try {
      await editMessage(editingMessage.id, text.trim());
      setEditingMessage(null);
      setText('');
    } catch {
      Alert.alert('', t('editFailed'));
    }
  };

  const handleForward = (item) => {
    setReactionTarget(null);
    setShowForwardModal(item);
  };

  const handleForwardTo = async (targetConvId) => {
    if (!showForwardModal) return;
    try {
      await forwardMessage(showForwardModal.id, targetConvId);
      showToast(t('forwarded'));
    } catch {
      Alert.alert('', t('forwardFailed'));
    }
    setShowForwardModal(null);
  };

  const handlePinMessage = async (item) => {
    setReactionTarget(null);
    try {
      await pinMessage(conversationId, item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(t('messagePinned'));
    } catch {
      Alert.alert('', t('pinFailed'));
    }
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return t('offline');
    const d = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return t('justNow');
    if (diffMins < 60) return `${t('lastSeen')} ${diffMins} ${t('minAgo')}`;
    if (diffHours < 24) return `${t('lastSeen')} ${formatTime(lastSeen)}`;
    if (diffDays === 1) return `${t('lastSeen')} ${t('yesterday')}`;
    return `${t('lastSeen')} ${d.toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-GB')}`;
  };

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const showScrollRef = useRef(false);
  const handleScroll = useCallback((event) => {
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const contentOffsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const isNearBottom = contentOffsetY + layoutHeight >= contentHeight - 100;
    const shouldShow = !isNearBottom && messages.length > 10;
    // Guard: only setState when the value actually changes
    if (showScrollRef.current === shouldShow) return;
    showScrollRef.current = shouldShow;
    setShowScrollToBottom(shouldShow);
  }, [messages.length]);

  const viewabilityConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const first = viewableItems[0].item;
      setFloatingDate(formatDateLabel(first.createdAt, lang, t));
    }
  });

  const handlePickMultipleImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('photoLibraryPermissionRequired'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      try {
        for (const asset of result.assets) {
          const mimeType = asset.mimeType || 'image/jpeg';
          const ext = mimeType.split('/')[1] || 'jpg';
          const uploadResult = await uploadFile(asset.uri, mimeType, `photo_${Date.now()}_${Math.random()}.${ext}`);
          await sendMessage(conversationId, null, uploadResult.url, uploadResult.type);
        }
      } catch {
        // ignore
      } finally {
        setUploading(false);
      }
    } catch {
      // ignore
    }
  };

  const recordTimerRef = useRef(null);

  const startRecording = async () => {
    if (!recorderAvailable) {
      Alert.alert(t('microphonePermissionRequired'));
      return;
    }
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(t('microphonePermissionRequired'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            stopRecording(true);
          }
          return next;
        });
      }, 1000);
    } catch {
      // ignore
    }
  };

  const stopRecording = async (send) => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    clearInterval(recordTimerRef.current);
    try {
      if (recorder.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (send && uri) {
          setUploading(true);
          try {
            const uploadResult = await uploadFile(uri, 'audio/m4a', `voice_${Date.now()}.m4a`);
            await sendMessage(conversationId, null, uploadResult.url, 'audio/m4a');
          } catch {
            // ignore
          } finally {
            setUploading(false);
          }
        }
      }
    } catch {
      // ignore - recorder may have been released
    }
    setRecording(false);
    setRecordDuration(0);
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      clearInterval(recordTimerRef.current);
      try {
        if (recorder.isRecording) recorder.stop();
      } catch {
        // recorder may have been released already
      }
    };
  }, [recorder]);

  const canDeleteForEveryone = (() => {
    if (!deleteTarget) return false;
    if (deleteTarget.senderId !== user.id) return false;
    const created = new Date(deleteTarget.createdAt);
    if (isNaN(created.getTime())) return false;
    return Date.now() - created.getTime() <= DELETE_WINDOW_MS;
  })();

  const lastReadId = conversation?.last_read_message_id || 0;
  const otherParticipant = conversation?.participants?.find((p) => String(p.id) !== String(user.id));

  const renderMessage = useCallback(({ item, index }) => (
    <MessageItem
      item={item}
      prevMsg={messages[index - 1]}
      nextMsg={messages[index + 1]}
      isFirst={index === 0}
      user={user}
      participantMap={participantMap}
      participantCount={participantCount}
      lastReadId={lastReadId}
      colors={colors}
      styles={styles}
      t={t}
      lang={lang}
      getDynamic={getDynamic}
      formatTime={formatTime}
      onLongPress={onLongPressMessage}
      onReply={handleReply}
      onReact={reactToMessage}
    />
  ), [messages, user, participantMap, participantCount, lastReadId, colors, styles, t, lang, getDynamic, formatTime, onLongPressMessage, handleReply, reactToMessage]);

  const typingText = activeTyping.length > 0
    ? activeTyping.length === 1
      ? `${getDynamic(activeTyping[0].userName)} ${t('isTyping')}`
      : `${activeTyping.map((u) => getDynamic(u.userName)).join(', ')} ${t('areTyping')}`
    : '';

  return (
    <Screen style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <View style={styles.header}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.backBtn} haptic="light">
          <Ionicons name="arrow-back" size={24} color={colors.gray[700]} />
        </AnimatedPressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerTitleRow}>
            {conversation?.type !== 'group' && isOtherOnline && <View style={styles.headerOnlineDot} />}
            <Text style={styles.headerTitle} numberOfLines={1}>{conversationTitle}</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            {conversation?.type === 'group'
              ? `${conversation?.participants?.length || 0} ${t('members')}`
              : isOtherOnline ? t('online') : formatLastSeen(otherParticipant?.last_seen)}
          </Text>
        </View>
        {conversation?.type === 'group' && (
          <AnimatedPressable onPress={() => navigation.navigate('GroupInfo', { conversationId })} style={styles.headerBtn} haptic="light">
            <Ionicons name="information-circle-outline" size={24} color={colors.gray[600]} />
          </AnimatedPressable>
        )}
      </View>
      {!connected && (
        <View style={styles.reconnectBanner}>
          <ActivityIndicator size="small" color={colors.amber[600]} />
          <Text style={styles.reconnectText}>{t('reconnecting')}</Text>
        </View>
      )}

      {pinnedMessage && (
        <AnimatedPressable
          style={styles.pinnedBanner}
          onPress={() => {
            const idx = messages.findIndex((m) => m.id === pinnedMessage.id);
            if (idx >= 0) {
              flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
            }
          }}
          haptic="light"
        >
          <Ionicons name="pin" size={16} color={colors.brand[600]} />
          <Text style={styles.pinnedText} numberOfLines={1}>
            {pinnedMessage.sender_name ? `${getDynamic(pinnedMessage.sender_name)}: ` : ''}
            {pinnedMessage.body || t('voiceMessage')}
          </Text>
        </AnimatedPressable>
      )}

      {floatingDate && messages.length > 5 && (
        <View pointerEvents="none" style={styles.floatingDate}>
          <Text style={styles.floatingDateText}>{floatingDate}</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMessage}
        extraData={lang}
        inverted={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messagesList}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.1}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfigRef.current}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={10}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {loadingMore && <ActivityIndicator size="small" color={colors.gray[400]} />}
            {messages.length === 0 && !loadingMore && (
              <Text style={styles.noMessages}>{t('noMessagesYet')}</Text>
            )}
          </View>
        }
        ListFooterComponent={null}
      />

      {showScrollToBottom && (
        <Animated.View style={[styles.scrollToBottomBtn, scrollBtnStyle]} pointerEvents="auto">
          <AnimatedPressable onPress={scrollToBottom} haptic="light" style={styles.scrollToBottomInner}>
            <Ionicons name="arrow-down" size={22} color={colors.gray[700]} />
            {(() => {
              const unread = messages.filter((m) => m.senderId !== user.id && m.id > lastReadId).length;
              return unread > 0 ? (
                <View style={styles.scrollToBottomBadge}>
                  <Text style={styles.scrollToBottomBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null;
            })()}
          </AnimatedPressable>
        </Animated.View>
      )}

      {toast && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastStyle]}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      {replyTo && (
        <Animated.View style={[styles.replyBarContainer, replyBarStyle]}>
          <View style={styles.replyBarLeft} />
          <View style={styles.replyBarContent}>
            <Text style={styles.replyBarName}>{getDynamic(replyTo.senderName)}</Text>
            <Text style={styles.replyBarText} numberOfLines={1}>
              {replyTo.body || (replyTo.attachmentUrl ? t('attachment') : '')}
            </Text>
          </View>
          <AnimatedPressable onPress={() => setReplyTo(null)} style={styles.replyBarClose} haptic="light">
            <Ionicons name="close" size={20} color={colors.gray[500]} />
          </AnimatedPressable>
        </Animated.View>
      )}

      {typingText && (
        <View style={styles.typingBar}>
          <TypingIndicator />
          <Text style={styles.typingText}>{typingText}</Text>
        </View>
      )}

      <View style={styles.inputBar}>
        {editingMessage ? (
          <AnimatedPressable onPress={() => { setEditingMessage(null); setText(''); }} style={styles.attachBtn} haptic="light">
            <Ionicons name="close" size={24} color={colors.red[500]} />
          </AnimatedPressable>
        ) : recording ? (
          <AnimatedPressable onPress={() => stopRecording(false)} style={styles.attachBtn} haptic="light">
            <Ionicons name="close" size={24} color={colors.red[500]} />
          </AnimatedPressable>
        ) : (
          <>
            <AnimatedPressable onPress={() => setShowAttachSheet(true)} disabled={uploading} style={styles.attachBtn} haptic="light">
              {uploading ? (
                <ActivityIndicator size="small" color={colors.gray[400]} />
              ) : (
                <Ionicons name="add" size={28} color={colors.gray[500]} />
              )}
            </AnimatedPressable>
          </>
        )}
        {recording ? (
          <Animated.View style={[styles.recordingIndicator, recordInputStyle]}>
            <Animated.View style={[styles.recordingDot, recordDotStyle]} />
            <Text style={styles.recordingText}>{t('recording')}... {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}</Text>
          </Animated.View>
        ) : (
          <Animated.View style={[{ flex: 1 }, recordInputStyle]}>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={handleTyping}
              placeholder={editingMessage ? t('editingMessage') : t('typeMessage')}
              placeholderTextColor={colors.gray[400]}
              multiline
              maxLength={5000}
            />
          </Animated.View>
        )}
        {recording ? (
          <AnimatedPressable onPress={() => stopRecording(true)} style={styles.sendBtn} haptic="light">
            <Ionicons name="send" size={20} color={colors.white} />
          </AnimatedPressable>
        ) : editingMessage ? (
          <AnimatedPressable onPress={handleSaveEdit} disabled={!text.trim()} style={styles.sendBtn} haptic="light">
            <Ionicons name="checkmark" size={20} color={text.trim() ? colors.white : colors.gray[400]} />
          </AnimatedPressable>
        ) : text.trim() ? (
          <AnimatedPressable onPress={handleSend} style={styles.sendBtn} haptic="light">
            <Ionicons name="send" size={20} color={colors.white} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable onPress={startRecording} style={styles.micBtn} haptic="medium">
            <Ionicons name="mic" size={22} color={colors.gray[500]} />
          </AnimatedPressable>
        )}
      </View>

      <BottomSheet visible={showDeleteSheet} onClose={() => setShowDeleteSheet(false)}>
        <AnimatedPressable
          style={styles.sheetItem}
          onPress={() => handleDeleteMessage('me')}
          haptic="light"
        >
          <Ionicons name="trash-outline" size={20} color={colors.gray[700]} />
          <Text style={styles.sheetItemText}>{t('deleteForMe')}</Text>
        </AnimatedPressable>
        {canDeleteForEveryone && (
          <AnimatedPressable
            style={styles.sheetItem}
            onPress={() => handleDeleteMessage('everyone')}
            haptic="medium"
          >
            <Ionicons name="trash" size={20} color={colors.red[500]} />
            <Text style={[styles.sheetItemText, { color: colors.red[500] }]}>{t('deleteForEveryone')}</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable
          style={[styles.sheetItem, styles.sheetCancel]}
          onPress={() => setShowDeleteSheet(false)}
        >
          <Text style={styles.sheetCancelText}>{t('cancel')}</Text>
        </AnimatedPressable>
      </BottomSheet>

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
              <AnimatedPressable onPress={() => setConfirmScope(null)} style={styles.confirmCancelBtn} haptic="light">
                <Text style={styles.confirmCancelText}>{t('cancel')}</Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={confirmDelete} style={styles.confirmDeleteBtn} haptic="medium">
                <Text style={styles.confirmDeleteText}>{t('delete')}</Text>
              </AnimatedPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomSheet visible={!!reactionTarget} onClose={() => setReactionTarget(null)}>
        <View style={styles.reactionEmojiRow}>
          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
            <AnimatedPressable key={emoji} style={styles.reactionEmojiBtn} onPress={() => handleReact(emoji)} haptic="light">
              <Text style={styles.reactionEmojiLarge}>{emoji}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <AnimatedPressable style={styles.reactionAction} onPress={() => reactionTarget && handleReply(reactionTarget)} haptic="light">
          <Ionicons name="arrow-undo" size={22} color={colors.gray[700]} />
          <Text style={styles.reactionActionText}>{t('reply')}</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.reactionAction} onPress={() => reactionTarget && handleCopyMessage(reactionTarget)} haptic="light">
          <Ionicons name="copy-outline" size={22} color={colors.gray[700]} />
          <Text style={styles.reactionActionText}>{t('copy')}</Text>
        </AnimatedPressable>
        {reactionTarget && reactionTarget.senderId === user.id && reactionTarget.body && (
          <AnimatedPressable style={styles.reactionAction} onPress={() => reactionTarget && handleEditMessage(reactionTarget)} haptic="light">
            <Ionicons name="create-outline" size={22} color={colors.gray[700]} />
            <Text style={styles.reactionActionText}>{t('edit')}</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable style={styles.reactionAction} onPress={() => reactionTarget && handleForward(reactionTarget)} haptic="light">
          <Ionicons name="arrow-redo-outline" size={22} color={colors.gray[700]} />
          <Text style={styles.reactionActionText}>{t('forward')}</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.reactionAction} onPress={() => reactionTarget && handlePinMessage(reactionTarget)} haptic="light">
          <Ionicons name="pin-outline" size={22} color={colors.gray[700]} />
          <Text style={styles.reactionActionText}>{t('pin')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.reactionAction}
          onPress={() => {
            if (reactionTarget) {
              setDeleteTarget(reactionTarget);
              setShowDeleteSheet(true);
            }
            setReactionTarget(null);
          }}
          haptic="medium"
        >
          <Ionicons name="trash-outline" size={22} color={colors.gray[700]} />
          <Text style={styles.reactionActionText}>{t('delete')}</Text>
        </AnimatedPressable>
      </BottomSheet>

      <BottomSheet visible={!!showForwardModal} onClose={() => setShowForwardModal(null)} maxHeight={400}>
        <Text style={styles.forwardTitle}>{t('forwardTo')}</Text>
        <ScrollView style={styles.forwardList}>
          {conversations
            .filter((c) => c.id !== conversationId)
            .map((c) => (
              <AnimatedPressable
                key={c.id}
                style={styles.forwardItem}
                onPress={() => handleForwardTo(c.id)}
                haptic="light"
              >
                <Ionicons name={c.type === 'group' ? 'people' : 'person'} size={20} color={colors.gray[600]} />
                <Text style={styles.forwardItemText} numberOfLines={1}>
                  {c.type === 'group' ? c.name : c.participants?.find((p) => String(p.id) !== String(user.id))?.name || 'Direct'}
                </Text>
              </AnimatedPressable>
            ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={showAttachSheet} onClose={() => setShowAttachSheet(false)}>
        <AnimatedPressable
          style={styles.sheetItem}
          onPress={() => { setShowAttachSheet(false); handleTakePhoto(); }}
          haptic="light"
        >
          <Ionicons name="camera" size={20} color={colors.gray[700]} />
          <Text style={styles.sheetItemText}>{t('camera')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.sheetItem}
          onPress={() => { setShowAttachSheet(false); handlePickMultipleImages(); }}
          haptic="light"
        >
          <Ionicons name="images-outline" size={20} color={colors.gray[700]} />
          <Text style={styles.sheetItemText}>{t('photos')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.sheetItem}
          onPress={() => { setShowAttachSheet(false); handlePickAttachment(); }}
          haptic="light"
        >
          <Ionicons name="attach" size={20} color={colors.gray[700]} />
          <Text style={styles.sheetItemText}>{t('document')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.sheetItem, styles.sheetCancel]}
          onPress={() => setShowAttachSheet(false)}
        >
          <Text style={styles.sheetCancelText}>{t('cancel')}</Text>
        </AnimatedPressable>
      </BottomSheet>
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
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm, marginRight: spacing.xs },
  headerInfo: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.gray[900], flexShrink: 1 },
  headerOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green[500],
  },
  headerSubtitle: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.amber[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.amber[100],
  },
  reconnectText: { fontSize: fontSize.xs, color: colors.amber[600] },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.brand[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.brand[100],
  },
  pinnedText: { fontSize: fontSize.xs, color: colors.brand[700], flex: 1 },
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
  floatingDate: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.gray[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
  },
  floatingDateText: {
    fontSize: fontSize.xs,
    color: colors.gray[600],
  },
  msgRow: { flexDirection: 'row', marginBottom: spacing.xs },
  msgRowGrouped: { marginBottom: 2 },
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
  msgImage: { width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE, borderRadius: radius.md, marginTop: spacing.xs },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  msgTime: { fontSize: 10, color: colors.gray[400] },
  msgTimeOwn: { color: colors.white },
  typingContainer: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  typingText: { fontSize: fontSize.xs, color: colors.gray[400], fontStyle: 'italic' },
  typingBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray[50],
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
    minHeight: 44,
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
  },
  confirmDeleteBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.red[600],
    minHeight: 44,
    justifyContent: 'center',
  },
  confirmDeleteText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '500',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
    paddingLeft: spacing.xs,
  },
  replyPreviewOwn: {},
  replyBar: {
    width: 3,
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.gray[400],
    marginRight: spacing.xs,
    minHeight: 20,
  },
  replyContent: {
    flex: 1,
  },
  replyName: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.brand[600],
  },
  replyNameOwn: {
    color: colors.white,
  },
  replyText: {
    fontSize: fontSize.xs,
    color: colors.gray[500],
  },
  replyTextOwn: {
    color: colors.white,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionBadgeOwn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: colors.gray[700],
  },
  reactionCountOwn: {
    color: colors.white,
  },
  replyBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.gray[50],
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  replyBarLeft: {
    width: 3,
    height: 30,
    borderRadius: 2,
    backgroundColor: colors.brand[600],
    marginRight: spacing.sm,
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarName: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.brand[600],
  },
  replyBarText: {
    fontSize: fontSize.sm,
    color: colors.gray[600],
  },
  replyBarClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reactionSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  reactionEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  reactionEmojiBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmojiLarge: {
    fontSize: 28,
  },
  reactionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  reactionActionText: {
    fontSize: fontSize.base,
    color: colors.gray[900],
  },
  msgRowAnimated: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swipeRowWrapper: {
    position: 'relative',
  },
  swipeReplyIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 30,
  },
  swipeReplyIconOwn: {
    right: 4,
  },
  swipeReplyIconOther: {
    left: 4,
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: spacing.xs,
  },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 160,
  },
  audioProgressContainer: {
    flex: 1,
    gap: 4,
  },
  audioProgressBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.gray[200],
    overflow: 'hidden',
  },
  audioProgressBarOwn: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  audioProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.brand[500],
  },
  audioProgressFillOwn: {
    backgroundColor: colors.white,
  },
  audioText: {
    fontSize: fontSize.sm,
    color: colors.gray[700],
  },
  editedLabel: {
    fontSize: 10,
    fontStyle: 'italic',
    color: colors.gray[400],
    marginLeft: 4,
  },
  unreadSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  unreadLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.brand[400],
  },
  unreadText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.brand[600],
    paddingHorizontal: spacing.sm,
  },
  scrollToBottomBtn: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollToBottomInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollToBottomBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  scrollToBottomBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: colors.gray[900],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  toastText: {
    color: colors.white,
    fontSize: fontSize.sm,
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.red[500],
  },
  recordingText: {
    fontSize: fontSize.sm,
    color: colors.gray[700],
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  forwardSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: 400,
  },
  forwardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
  forwardList: {
    maxHeight: 300,
  },
  forwardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  forwardItemText: {
    fontSize: fontSize.base,
    color: colors.gray[800],
    flex: 1,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
