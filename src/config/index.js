// All runtime configuration comes from EXPO_PUBLIC_* variables in .env, which Expo
// inlines at build time (restart `expo start` / rebuild after changing them).

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY;
export { apiKey as GOOGLE_TRANSLATE_API_KEY };

// Backend REST base, e.g. https://your-app.up.railway.app/api. No production default on
// purpose: a missing value must fail loudly instead of silently hitting an old backend.
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!configuredApiUrl) {
  console.warn('EXPO_PUBLIC_API_URL is not set; falling back to http://localhost:5000/api');
}
export const API_URL = (configuredApiUrl || 'http://localhost:5000/api').replace(/\/+$/, '');

// Socket.IO lives on the same host as the API, without the /api suffix.
export const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL || API_URL.replace(/\/api$/, '')).replace(/\/+$/, '');

// Firebase web app config (Firebase console → Project settings → Your apps → Web app).
export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Cloud Messaging → Web Push certificates → Key pair.
export const FIREBASE_VAPID_KEY = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;

export const isFirebaseConfigured = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId
    && FIREBASE_CONFIG.messagingSenderId && FIREBASE_VAPID_KEY
);
