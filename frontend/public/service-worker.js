/*
 * Lumo Service-Worker killswitch.
 *
 * Some browsers (notably iOS Safari) cached a Service Worker from an earlier
 * deploy of this site, and once that registration exists it can intercept all
 * /-prefixed fetches indefinitely — even if the latest build doesn't ship a
 * Service Worker at all. The symptom: the homepage refuses to load in regular
 * Safari but works fine in Private mode (which never runs SWs).
 *
 * This file's only job is to ensure ANY prior registration is wiped. The
 * moment the browser fetches /service-worker.js (which it does on every page
 * load if a registration exists), this script:
 *   1. Installs immediately (skipWaiting).
 *   2. On activation, clears every Cache Storage entry and unregisters itself.
 *   3. Forces every client (open tab) to reload from the network.
 *
 * After one reload, the user's browser has no SW left and the site loads
 * normally. This file is intentionally tiny so even partial fetches succeed.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (e) { /* ignore */ }
    try {
      const clientsList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientsList) {
        client.navigate(client.url).catch(() => {});
      }
    } catch (e) { /* ignore */ }
  })());
});

// Pass through any fetch the SW is asked to handle (we want the network's
// response, not a cached one, while we wait for activation to wipe ourselves).
self.addEventListener('fetch', (event) => {
  // Intentionally no respondWith — falls through to the network.
});
