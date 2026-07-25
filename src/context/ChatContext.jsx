import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import api from '../api/client';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

const SOCKET_URL = __DEV__
  ? 'http://localhost:5000'
  : 'https://vgrand-taskhub-backend.onrender.com';

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [totalUnread, setTotalUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const messagesRef = useRef([]);
  const conversationsRef = useRef([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data.conversations);
      setTotalUnread(res.data.total_unread);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let socket;

    (async () => {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;

      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        fetchConversations();
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('connect_error', () => {
        setConnected(false);
      });

      socket.on('message:new', (msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        setConversations((prev) =>
          prev.map((c) =>
            c.id === msg.conversationId
              ? {
                  ...c,
                  last_message: {
                    id: msg.id,
                    body: msg.body,
                    attachment_url: msg.attachmentUrl,
                    attachment_type: msg.attachmentType,
                    sender_id: msg.senderId,
                    created_at: msg.createdAt,
                  },
                  unread_count: msg.senderId === user.id ? c.unread_count : c.unread_count + 1,
                }
              : c
          )
        );

        if (msg.senderId !== user.id) {
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
        const { conversationId, messageId, deletedAt } = data;
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
    })();

    return () => {
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
            const newMsgs = res.data.messages.filter((m) => !existingIds.has(m.id));
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
      const normalized = (res.data.messages || []).map((m) => ({
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
        deletedAt: m.deleted_at ?? m.deletedAt,
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

  const sendMessage = useCallback(async (conversationId, body, attachmentUrl, attachmentType) => {
    const clientTempId = `temp_${Date.now()}_${Math.random()}`;
    if (socketRef.current && socketRef.current.connected) {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(
          'send_message',
          { conversationId, body, attachmentUrl, attachmentType, clientTempId },
          (response) => {
            if (response?.error) reject(new Error(response.error));
            else resolve(response);
          }
        );
        setTimeout(() => reject(new Error('Send timeout')), 10000);
      });
    }
    const res = await api.post(`/chat/conversations/${conversationId}/messages`, {
      body, attachmentUrl, attachmentType, clientTempId,
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
    await fetchConversations();
    return res.data.conversation;
  }, [fetchConversations]);

  const deleteMessage = useCallback(async (messageId, scope) => {
    if (scope === 'me') {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, deleted_at: new Date().toISOString(), body: null, attachmentUrl: null, attachmentType: null }
            : m
        )
      );
    }
    await api.delete(`/chat/messages/${messageId}`, { params: { scope } });
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

  const uploadFile = useCallback(async (fileUri, mimeType) => {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: mimeType || 'image/jpeg',
      name: `upload_${Date.now()}.jpg`,
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
  }, []);

  const value = {
    conversations,
    activeConversationId,
    messages,
    typingUsers,
    onlineUsers,
    totalUnread,
    connected,
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
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
