/*
 * Lumo Push Notification Service Worker.
 *
 * Registered only when the user opts in to notifications (customer role
 * mostly — providers get server-sent updates via the tracking page).
 * Path is /push-sw.js so it does NOT collide with /service-worker.js
 * (the legacy killswitch that unregisters itself on old installs).
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Lumo', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Lumo';
  const options = {
    body: payload.body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: payload.tag || 'lumo',
    renotify: true,
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url && 'focus' in client) {
        client.postMessage({ type: 'lumo-push-navigate', url: target });
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
