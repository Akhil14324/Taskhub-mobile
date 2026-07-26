import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from '../api/client';

const PROJECT_ID = '6ff08814-1fa6-4d0a-8a30-57eef8ed87d8';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications() {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[notifications] Push notification permissions not granted');
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    });
    return tokenResponse.data;
  } catch (err) {
    console.error('[notifications] Error getting push token:', err.message);
    return null;
  }
}

async function registerTokenWithServer(token) {
  if (!token) return;
  try {
    await api.post('/notifications/push-token', {
      token,
      platform: Platform.OS,
    });
  } catch (err) {
    console.error('[notifications] Error registering push token:', err.message);
  }
}

async function unregisterTokenFromServer(token) {
  if (!token) return;
  try {
    await api.delete('/notifications/push-token', { data: { token } });
  } catch (err) {
    console.error('[notifications] Error unregistering push token:', err.message);
  }
}

let lastRegisteredToken = null;

async function setupPushNotifications() {
  const token = await registerForPushNotifications();
  if (token) {
    lastRegisteredToken = token;
    await registerTokenWithServer(token);
  }
  return token;
}

async function teardownPushNotifications() {
  if (lastRegisteredToken) {
    await unregisterTokenFromServer(lastRegisteredToken);
    lastRegisteredToken = null;
  }
}

function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

export {
  setupPushNotifications,
  teardownPushNotifications,
  addNotificationResponseListener,
  addNotificationReceivedListener,
};
