import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import api from '../api/client';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

const SOCKET_URL = 'https://vgrand-taskhub-backend.onrender.com';

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [totalUnread, setTotalUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const socketRef = useRef(null);
  const messagesRef = useRef([]);
  const conversationsRef = useRef([]);
  const activeConversationIdRef = useRef(null);
  const deletedMessageIdsRef = useRef(new Set());

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data.conversations);
      setTotalUnread(res.data.total_unread);
    } catch (err) {
      console.error('[chat] fetchConversations error:', err.response?.status, err.message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let socket;
    let fallbackTimer;

    (async () => {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;

      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['polling', 'websocket'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        fetchConversations();
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('[chat] socket connect_error:', err.message);
        setConnected(false);
      });

      // Fallback: fetch conversations via REST if socket doesn't connect within 3s
      fallbackTimer = setTimeout(() => {
        if (!socket.connected) {
          console.warn('[chat] Socket not connected after 3s, fetching conversations via REST');
          fetchConversations();
        }
      }, 3000);

      socket.on('message:new', (msg) => {
        const normalized = {
          ...msg,
          id: Number(msg.id),
          conversationId: Number(msg.conversationId),
          senderId: Number(msg.senderId),
          readBy: msg.readBy || [],
          deleted_at: msg.deleted_at ?? msg.deletedAt ?? null,
          replyToId: msg.replyToId ?? msg.reply_to_id ?? null,
          replyTo: msg.replyTo ?? null,
          reactions: msg.reactions ?? {},
          isEdited: msg.isEdited ?? msg.is_edited ?? false,
        };
        const isActive = normalized.conversationId === Number(activeConversationIdRef.current);

        setMessages((prev) => {
          if (!isActive || prev.some((m) => m.id === normalized.id)) return prev;
          return [...prev, normalized];
        });

        setConversations((prev) =>
          prev.map((c) =>
            c.id === normalized.conversationId
              ? {
                  ...c,
                  last_message: {
                    id: normalized.id,
                    body: normalized.body,
                    attachment_url: normalized.attachmentUrl,
                    attachment_type: normalized.attachmentType,
                    sender_id: normalized.senderId,
                    created_at: normalized.createdAt,
                  },
                  unread_count: isActive || normalized.senderId === user.id ? 0 : c.unread_count + 1,
                }
              : c
          )
        );

        if (normalized.senderId !== user.id && !isActive) {
          setTotalUnread((prev) => prev + 1);
        }
      });

      socket.on('message:read', (data) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.conversationId === data.conversationId && m.senderId === user.id && m.id <= data.lastReadMessageId
              ? { ...m, readBy: [...new Set([...(m.readBy || []), data.userId])] }
              : m
          )
        );
      });

      socket.on('typing:update', (data) => {
        setTypingUsers((prev) => {
          const key = `${data.conversationId}`;
          const current = prev[key] || [];
          if (data.typing) {
            if (!current.find((u) => u.userId === data.userId)) {
              return { ...prev, [key]: [...current, { userId: data.userId, userName: data.userName }] };
            }
          } else {
            return { ...prev, [key]: current.filter((u) => u.userId !== data.userId) };
          }
          return prev;
        });
      });

      socket.on('presence:update', (data) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (data.online) next.add(data.userId);
          else next.delete(data.userId);
          return next;
        });
      });

      socket.on('message:deleted', (data) => {
        const { conversationId, messageId, deletedAt, permanent } = data;
        if (permanent) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId && c.last_message?.id === messageId
                ? { ...c, last_message: null }
                : c
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, deleted_at: deletedAt, body: null, attachmentUrl: null, attachmentType: null }
                : m
            )
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId && c.last_message?.id === messageId
                ? { ...c, last_message: { ...c.last_message, deleted_at: deletedAt, body: null } }
                : c
            )
          );
        }
      });

      socket.on('conversation:deleted', (data) => {
        const { conversationId } = data;
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeConversationIdRef.current === conversationId) {
          setActiveConversationId(null);
          setMessages([]);
        }
      });

      socket.on('conversation:updated', (data) => {
        setConversations((prev) => {
          const existing = prev.find((c) => c.id === data.conversationId);
          if (!existing) {
            fetchConversations();
            return prev;
          }
          return prev.map((c) =>
            c.id === data.conversationId
              ? {
                  ...c,
                  last_message: {
                    body: data.lastMessagePreview,
                    created_at: data.lastMessageAt,
                  },
                  unread_count: c.unread_count + 1,
                }
              : c
          );
        });
      });

      socket.on('message:reaction', (data) => {
        const { messageId, reactions } = data;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, reactions }
              : m
          )
        );
      });

      socket.on('message:edited', (data) => {
        const { messageId, conversationId, body, editedAt } = data;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, body, isEdited: true, editedAt }
              : m
          )
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === Number(conversationId) && c.last_message?.id === messageId
              ? { ...c, last_message: { ...c.last_message, body } }
              : c
          )
        );
      });

    })();

    return () => {
      clearTimeout(fallbackTimer);
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [user, fetchConversations]);

  useEffect(() => {
    if (connected && conversations.length > 0) {
      socketRef.current?.emit('join_conversations', {
        conversationIds: conversations.map((c) => c.id),
      });
    }
  }, [connected, conversations]);

  const handleAppStateChange = useCallback((nextAppState) => {
    if (nextAppState === 'active' && socketRef.current) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
      if (activeConversationId && messagesRef.current.length > 0) {
        const lastId = messagesRef.current[messagesRef.current.length - 1].id;
        api.get(`/chat/conversations/${activeConversationId}/messages`, {
          params: { after: lastId, limit: 100 },
        }).then((res) => {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = res.data.messages
              .filter((m) => !existingIds.has(m.id) && !deletedMessageIdsRef.current.has(Number(m.id)));
            return [...prev, ...newMsgs];
          });
        }).catch(() => {});
      }
      fetchConversations();
    }
  }, [activeConversationId, fetchConversations]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [handleAppStateChange]);

  const loadMessages = useCallback(async (conversationId, before) => {
    try {
      const params = { limit: 30 };
      if (before) params.before = before;
      const res = await api.get(`/chat/conversations/${conversationId}/messages`, { params });
      const normalized = (res.data.messages || [])
        .filter((m) => !deletedMessageIdsRef.current.has(Number(m.id)))
        .map((m) => ({
          ...m,
          id: Number(m.id),
          conversationId: Number(m.conversation_id ?? m.conversationId),
          senderId: Number(m.sender_id ?? m.senderId),
          senderName: m.sender_name ?? m.senderName ?? 'Unknown',
          body: m.body,
          attachmentUrl: m.attachment_url ?? m.attachmentUrl,
          attachmentType: m.attachment_type ?? m.attachmentType,
          createdAt: m.created_at ?? m.createdAt,
          editedAt: m.edited_at ?? m.editedAt,
          isEdited: m.is_edited ?? m.isEdited ?? false,
          deleted_at: m.deleted_at ?? m.deletedAt ?? null,
          replyToId: m.replyToId ?? m.reply_to_id ?? null,
          replyTo: m.replyTo ?? null,
          reactions: m.reactions ?? {},
          readBy: m.readBy || [],
        }));
      if (before) {
        setMessages((prev) => [...normalized.reverse(), ...prev]);
      } else {
        setMessages(normalized);
      }
      return res.data.has_more;
    } catch {
      return false;
    }
  }, []);

  const sendMessage = useCallback(async (conversationId, body, attachmentUrl, attachmentType, replyToId) => {
    const clientTempId = `temp_${Date.now()}_${Math.random()}`;
    if (socketRef.current && socketRef.current.connected) {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(
          'send_message',
          { conversationId, body, attachmentUrl, attachmentType, clientTempId, replyToId },
          (response) => {
            if (response?.error) reject(new Error(response.error));
            else resolve(response);
          }
        );
        setTimeout(() => reject(new Error('Send timeout')), 10000);
      });
    }
    const res = await api.post(`/chat/conversations/${conversationId}/messages`, {
      body, attachmentUrl, attachmentType, clientTempId, replyToId,
    });
    return res.data;
  }, []);

  const markRead = useCallback((conversationId, messageId) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('mark_read', { conversationId, messageId });
    }
    api.patch(`/chat/conversations/${conversationId}/read`, { messageId }).catch(() => {});

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, unread_count: 0, last_read_message_id: messageId }
          : c
      )
    );
    setTotalUnread((prev) => {
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      return Math.max(0, prev - (conv?.unread_count || 0));
    });
  }, []);

  const sendTypingStart = useCallback((conversationId) => {
    socketRef.current?.emit('typing_start', { conversationId });
  }, []);

  const sendTypingStop = useCallback((conversationId) => {
    socketRef.current?.emit('typing_stop', { conversationId });
  }, []);

  const createConversation = useCallback(async (type, participantIds, name, businessId) => {
    const res = await api.post('/chat/conversations', { type, participantIds, name, businessId });
    const conv = res.data.conversation;
    setConversations((prev) => {
      if (prev.some((c) => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
    await fetchConversations();
    return conv;
  }, [fetchConversations]);

  const reactToMessage = useCallback((messageId, emoji) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('react_to_message', { messageId, emoji });
    }
  }, []);

  const editMessage = useCallback(async (messageId, body) => {
    if (socketRef.current && socketRef.current.connected) {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(
          'edit_message',
          { messageId, body },
          (response) => {
            if (response?.error) reject(new Error(response.error));
            else resolve(response);
          }
        );
        setTimeout(() => reject(new Error('Edit timeout')), 10000);
      });
    }
    const res = await api.patch(`/chat/messages/${messageId}`, { body });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === Number(messageId)
          ? { ...m, body, isEdited: true, editedAt: res?.data?.editedAt || new Date().toISOString() }
          : m
      )
    );
    return res.data;
  }, []);

  const forwardMessage = useCallback(async (messageId, targetConversationId) => {
    if (socketRef.current && socketRef.current.connected) {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(
          'forward_message',
          { messageId, targetConversationId },
          (response) => {
            if (response?.error) reject(new Error(response.error));
            else resolve(response);
          }
        );
        setTimeout(() => reject(new Error('Forward timeout')), 10000);
      });
    }
    const original = messagesRef.current.find((m) => m.id === Number(messageId));
    if (!original) {
      throw new Error('Original message not found');
    }
    const res = await api.post(`/chat/conversations/${targetConversationId}/messages`, {
      body: original.body,
      attachmentUrl: original.attachmentUrl,
      attachmentType: original.attachmentType,
    });
    return res.data;
  }, []);

  const pinMessage = useCallback(async (conversationId, messageId) => {
    if (socketRef.current && socketRef.current.connected) {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(
          'pin_message',
          { conversationId, messageId },
          (response) => {
            if (response?.error) reject(new Error(response.error));
            else resolve(response);
          }
        );
        setTimeout(() => reject(new Error('Pin timeout')), 10000);
      });
    }
    const res = await api.put(`/chat/conversations/${conversationId}/pinned`, { messageId });
    return res.data;
  }, []);

  const updateLastSeen = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('update_last_seen');
    } else {
      api.patch('/chat/last-seen').catch(() => {});
    }
  }, []);

  const muteConversation = useCallback(async (conversationId, muted) => {
    await api.patch(`/chat/conversations/${conversationId}/mute`, { muted });
  }, []);

  const deleteMessage = useCallback(async (messageId, scope) => {
    // Track the deleted message ID so it doesn't reappear on re-fetch
    deletedMessageIdsRef.current.add(Number(messageId));
    setMessages((prev) => prev.filter((m) => m.id !== Number(messageId)));
    try {
      await api.delete(`/chat/messages/${messageId}`, { params: { scope } });
    } catch (err) {
      // If the API call fails, remove the ID from the deleted set so it can reappear
      deletedMessageIdsRef.current.delete(Number(messageId));
      throw err;
    }
    fetchConversations();
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (conversationId) => {
    await api.delete(`/chat/conversations/${conversationId}`);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    setTotalUnread((prev) => {
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      return Math.max(0, prev - (conv?.unread_count || 0));
    });
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
    }
    await fetchConversations();
  }, [activeConversationId, fetchConversations]);

  const syncMessages = useCallback(async (conversationId, afterId) => {
    const res = await api.get(`/chat/conversations/${conversationId}/messages`, {
      params: { after: afterId, limit: 100 },
    });
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newMsgs = res.data.messages.filter((m) => !existingIds.has(m.id));
      return [...prev, ...newMsgs];
    });
  }, []);

  const uploadFile = useCallback(async (fileUri, mimeType, fileName) => {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: mimeType || 'application/octet-stream',
      name: fileName || `upload_${Date.now()}`,
    });
    const res = await api.post('/chat/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }, []);

  const setActiveConversation = useCallback((conversationId) => {
    setActiveConversationId(conversationId);
    setMessages([]);
    setTypingUsers({});
    setPinnedMessage(null);
  }, []);

  const fetchPinnedMessage = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const res = await api.get(`/chat/conversations/${conversationId}/pinned`);
      setPinnedMessage(res.data?.pinnedMessage || null);
    } catch {
      // ignore
    }
  }, []);

  const value = {
    conversations,
    activeConversationId,
    messages,
    typingUsers,
    onlineUsers,
    totalUnread,
    connected,
    pinnedMessage,
    fetchConversations,
    loadMessages,
    sendMessage,
    markRead,
    sendTypingStart,
    sendTypingStop,
    createConversation,
    deleteMessage,
    deleteConversation,
    syncMessages,
    uploadFile,
    setActiveConversation,
    reactToMessage,
    editMessage,
    forwardMessage,
    pinMessage,
    fetchPinnedMessage,
    updateLastSeen,
    muteConversation,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
