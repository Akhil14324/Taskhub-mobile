import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from '../utils/secureStorage';
import api from '../api/client';
import { setupPushNotifications, teardownPushNotifications } from '../services/notifications';

const AuthContext = createContext(null);

const STORAGE_READ_MS = 1500;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set while a super admin has the app open as someone else: their own name, to offer the way back.
  const [actingFrom, setActingFrom] = useState(null);

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
        // Skip when a newer login replaced the token while this check was running.
        let stillSame = true;
        try { stillSame = (await SecureStore.getItemAsync('token')) === token; } catch {}
        if (stillSame) {
          try {
            await SecureStore.deleteItemAsync('token');
            await SecureStore.deleteItemAsync('user');
          } catch {}
          setUser(null);
        }
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

    let { token, user: storedUser } = await Promise.race([readStorage(), timeout]);
    // A super admin looking at the app as someone else keeps their own session aside (see loginAs below).
    let adminName = null;
    try {
      const adminToken = await SecureStore.getItemAsync('admin_token');
      const adminUser = await SecureStore.getItemAsync('admin_user');
      if (adminToken && !token) {
        // The borrowed session ended (it lasts four hours): go back to their own.
        await SecureStore.setItemAsync('token', adminToken);
        if (adminUser) await SecureStore.setItemAsync('user', adminUser);
        await SecureStore.deleteItemAsync('admin_token');
        await SecureStore.deleteItemAsync('admin_user');
        token = adminToken;
        storedUser = adminUser ? JSON.parse(adminUser) : null;
      } else if (adminToken) {
        adminName = (adminUser ? JSON.parse(adminUser)?.name : null) || 'your account';
      }
    } catch { /* storage not readable: an ordinary session */ }
    setActingFrom(adminName);
    setUser(storedUser);
    setLoading(false);

    if (token) {
      fetchMe();
      // Never while acting as someone else: it would move this device's notifications to that person.
      if (!adminName) {
        setupPushNotifications().catch((err) => {
          console.warn('[auth] Push notification setup failed on session restore:', err.message);
        });
      }
    }
  }, [fetchMe]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = async (token, userData) => {
    try {
      await SecureStore.deleteItemAsync('admin_token');
      await SecureStore.deleteItemAsync('admin_user');
    } catch {}
    setActingFrom(null);
    await SecureStore.setItemAsync('token', token);
    await SecureStore.setItemAsync('user', JSON.stringify(userData));
    setUser(userData);
    setupPushNotifications().catch((err) => {
      console.warn('[auth] Push notification setup failed:', err.message);
    });
  };

  // Personal settings: applied at once, then saved to the account so they follow it to other devices.
  const updatePreferences = useCallback(async (patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, preferences: { ...(prev.preferences || {}), ...patch } };
      SecureStore.setItemAsync('user', JSON.stringify(next)).catch(() => {});
      return next;
    });
    try {
      await api.put('/users/me/preferences', patch, { __skipOops: true });
    } catch (err) {
      console.warn('[auth] could not save preferences:', err.message);
    }
  }, []);

  // Super admin only: open the app as another person. Their own session is put aside and the page starts again,
  // so every list, board and chat loads as that person. The server checks who may do this and writes it down.
  const loginAs = async (userId) => {
    const res = await api.post(`/access/login-as/${userId}`);
    const myToken = await SecureStore.getItemAsync('token');
    const myUser = await SecureStore.getItemAsync('user');
    await SecureStore.setItemAsync('admin_token', myToken);
    await SecureStore.setItemAsync('admin_user', myUser || '');
    await SecureStore.setItemAsync('token', res.data.token);
    await SecureStore.setItemAsync('user', JSON.stringify(res.data.user));
    if (typeof window !== 'undefined') window.location.reload();
  };

  const returnToMine = async () => {
    const adminToken = await SecureStore.getItemAsync('admin_token');
    const adminUser = await SecureStore.getItemAsync('admin_user');
    if (!adminToken) return;
    await SecureStore.setItemAsync('token', adminToken);
    if (adminUser) await SecureStore.setItemAsync('user', adminUser);
    await SecureStore.deleteItemAsync('admin_token');
    await SecureStore.deleteItemAsync('admin_user');
    if (typeof window !== 'undefined') window.location.reload();
  };

  const logout = async () => {
    // Signing out while acting as someone else just goes back to the super admin's own account.
    if (actingFrom) { await returnToMine(); return; }
    await teardownPushNotifications();
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchMe, updatePreferences, loginAs, returnToMine, actingFrom }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
