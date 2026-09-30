// Web / PWA push notifications through Firebase Cloud Messaging.
// The service worker (public/sw.js) receives pushes; this module gets the FCM token
// for this browser, registers it with the backend and relays SW messages to the app.
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { FIREBASE_CONFIG, FIREBASE_VAPID_KEY, isFirebaseConfigured } from '../config';
import api from '../api/client';

let messagingPromise = null;
let currentToken = null;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function getSwRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

async function getMessagingInstance() {
  if (!isFirebaseConfigured) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (!(await isSupported())) return null;
      const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
      return getMessaging(app);
    })().catch((err) => {
      console.warn('[push] Firebase messaging unavailable:', err.message);
      return null;
    });
  }
  return messagingPromise;
}

/**
 * Where this browser stands with notifications:
 * 'unconfigured' | 'unsupported' | 'needs-install' (iOS outside home-screen app) |
 * 'default' (not asked yet) | 'granted' | 'denied'
 */
export async function getPushState() {
  if (!isFirebaseConfigured) return 'unconfigured';
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  const messaging = await getMessagingInstance();
  if (!messaging) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  return Notification.permission;
}

async function registerToken() {
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  const registration = await getSwRegistration();
  const token = await getToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration || undefined,
  });
  if (!token) return null;
  currentToken = token;
  await api.post('/notifications/push-token', {
    token,
    provider: 'fcm',
    platform: isIOS() ? 'ios-web' : /Android/i.test(navigator.userAgent) ? 'android-web' : 'web',
  }, { __skipOops: true });
  return token;
}

/**
 * Ask for permission (must be called from a tap on iOS) and register this device.
 * Returns the resulting state.
 */
export async function enablePush() {
  const state = await getPushState();
  if (state === 'unconfigured' || state === 'unsupported' || state === 'needs-install' || state === 'denied') {
    return state;
  }
  const permission = state === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  try {
    await registerToken();
  } catch (err) {
    console.warn('[push] could not register token:', err.message);
  }
  return 'granted';
}

/** Silent refresh on app start: only registers if permission was already granted. */
export async function setupPushNotifications() {
  const state = await getPushState();
  if (state !== 'granted') return null;
  try {
    return await registerToken();
  } catch (err) {
    console.warn('[push] token refresh failed:', err.message);
    return null;
  }
}

export async function teardownPushNotifications() {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  try {
    await api.delete('/notifications/push-token', { data: { token }, __skipOops: true });
  } catch {
    // ignore
  }
  try {
    const messaging = await getMessagingInstance();
    if (messaging) await deleteToken(messaging);
  } catch {
    // ignore
  }
}

/**
 * Listen for messages from the service worker.
 * handler({ kind: 'received' | 'open', payload: { title, body, data } })
 */
export function addPushMessageListener(handler) {
  if (!('serviceWorker' in navigator)) return () => {};
  const listener = (event) => {
    if (event.data?.source === 'taskhub-push') handler(event.data);
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

/** Notification data passed in the URL when a click opened a fresh window. */
export function consumeLaunchNotification() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('notif');
    if (!raw) return null;
    params.delete('notif');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const pushEnvironment = { isIOS, isStandalone };
