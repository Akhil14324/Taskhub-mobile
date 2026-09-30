// Native builds use Expo push (services/notifications.js); web uses webPush.web.js.
export async function getPushState() {
  return 'unsupported';
}

export async function enablePush() {
  return 'unsupported';
}

export async function setupPushNotifications() {
  return null;
}

export async function teardownPushNotifications() {}

export function addPushMessageListener() {
  return () => {};
}

export function consumeLaunchNotification() {
  return null;
}

export const pushEnvironment = { isIOS: () => false, isStandalone: () => false };
