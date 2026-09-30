import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from '../utils/secureStorage';
import api from '../api/client';
import { setupPushNotifications, teardownPushNotifications } from '../services/notifications';

const AuthContext = createContext(null);

const STORAGE_READ_MS = 1500;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    let token;
    try {
      token = await SecureStore.getItemAsync('token');
    } catch {
      token = null;
    }
    if (!token) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await api.get('/auth/me', { signal: controller.signal, __skipOops: true });
      setUser(res.data.user);
      try {
        await SecureStore.setItemAsync('user', JSON.stringify(res.data.user));
      } catch {}
    } catch (err) {
      const status = err.response?.status;
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError') {
        console.warn('[auth] session validation timed out');
      } else if (!status || status >= 500) {
        // Offline or the server is waking up — keep the cached session.
        console.warn('[auth] could not validate session:', err.message);
      } else {
        try {
          await SecureStore.deleteItemAsync('token');
          await SecureStore.deleteItemAsync('user');
        } catch {}
        setUser(null);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const restoreSession = useCallback(async () => {
    const readStorage = async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        const stored = await SecureStore.getItemAsync('user');
        return { token, user: stored ? JSON.parse(stored) : null };
      } catch {
        return { token: null, user: null };
      }
    };

    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ token: null, user: null }), STORAGE_READ_MS)
    );

    const { token, user: storedUser } = await Promise.race([readStorage(), timeout]);
    setUser(storedUser);
    setLoading(false);

    if (token) {
      fetchMe();
      setupPushNotifications().catch((err) => {
        console.warn('[auth] Push notification setup failed on session restore:', err.message);
      });
    }
  }, [fetchMe]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = async (token, userData) => {
    await SecureStore.setItemAsync('token', token);
    await SecureStore.setItemAsync('user', JSON.stringify(userData));
    setUser(userData);
    setupPushNotifications().catch((err) => {
      console.warn('[auth] Push notification setup failed:', err.message);
    });
  };

  const logout = async () => {
    await teardownPushNotifications();
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
