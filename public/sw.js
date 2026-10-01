// TaskHub service worker
// - Makes the app installable and gives the shell an offline fallback.
// - Receives Firebase Cloud Messaging web pushes (data-only messages sent by the backend)
//   and shows them as system notifications, or hands them to the open app.
// API, socket, and upload traffic always goes straight to the network.
const CACHE = 'taskhub-shell-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  // Network first, fall back to cache so deploys are picked up immediately.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
  );
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

function parsePush(event) {
  if (!event.data) return null;
  let raw;
  try {
    raw = event.data.json();
  } catch (e) {
    return { title: 'TaskHub', body: event.data.text(), data: {} };
  }
  // FCM wraps our payload as { data: {...}, notification?: {...}, from, fcmMessageId }.
  const data = Object.assign({}, raw.data || {});
  const notification = raw.notification || {};
  return {
    title: data.title || notification.title || 'TaskHub',
    body: data.body || notification.body || '',
    data,
  };
}

// Safari (iOS/macOS) revokes push permission if a push doesn't show a notification,
// so there we always display it even when the app is open.
const mustAlwaysShow = /Safari/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg|Android/.test(self.navigator.userAgent);

self.addEventListener('push', (event) => {
  const msg = parsePush(event);
  if (!msg) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.filter((w) => w.visibilityState === 'visible');

    // App is open and on screen: let it show an in-app banner instead of a system popup.
    if (visible.length > 0) {
      visible.forEach((w) => w.postMessage({ source: 'taskhub-push', kind: 'received', payload: msg }));
      if (!mustAlwaysShow) return;
    }

    const tag = msg.data.tag || (msg.data.type ? `${msg.data.type}-${msg.data.taskId || msg.data.todoId || msg.data.conversationId || ''}` : undefined);
    await self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      renotify: !!tag,
      data: msg.data,
      vibrate: [80, 40, 80],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.postMessage({ source: 'taskhub-push', kind: 'open', payload: { data } });
      return;
    }
    // Cold start: the app reads ?notif= on launch and navigates there.
    const url = `/?notif=${encodeURIComponent(JSON.stringify(data))}`;
    await self.clients.openWindow(url);
  })());
});

// Allows the page to activate an updated worker immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
