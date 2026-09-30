// Web build of services/notifications: push goes through Firebase Cloud Messaging.
import { setupPushNotifications, teardownPushNotifications } from './webPush';

// Notification taps on the web are relayed by the service worker (see NotificationContext).
function addNotificationResponseListener() {
  return { remove() {} };
}

function addNotificationReceivedListener() {
  return { remove() {} };
}

export {
  setupPushNotifications,
  teardownPushNotifications,
  addNotificationResponseListener,
  addNotificationReceivedListener,
};
