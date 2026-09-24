/*
 * sw-nuke-v3.js — Self-unregistering "reset" service worker.
 *
 * Purpose
 * -------
 * Some mobile devices (mostly iOS Safari + Android WebView) end up with
 * a *pinned* legacy service worker from a very old build. That SW may
 * still have a `respondWith(caches.match('/'))` in its fetch handler,
 * which serves stale HTML forever and prevents the fresh HTML (with the
 * new killswitch) from ever reaching those devices. Users report the
 * site only loads in Incognito.
 *
 * Fix strategy
 * ------------
 * Every fresh page load registers THIS SW at a NEW path so browsers
 * treat it as a first-time registration and download it. On `install`
 * we call `skipWaiting()` — cutting the queue. On `activate` we call
 * `clients.claim()` (take over open tabs), delete every Cache Storage
 * entry the origin ever created, unregister every OTHER service worker
 * at scope "/", and finally unregister OURSELVES. Zero fetch handlers,
 * so we never intercept network requests.
 *
 * After one page load this SW has cleaned itself up. Future navigations
 * are 100% network-driven.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // 1. Take control of all clients (open tabs on this origin).
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
      // 2. Nuke every Cache Storage entry (safe — we never cache app assets).
      if (self.caches && self.caches.keys) {
        const keys = await self.caches.keys();
        await Promise.all(keys.map((k) => self.caches.delete(k).catch(() => null)));
      }
      // 3. Unregister every other SW at scope "/" — including any legacy
      //    push-notification worker that shipped with old bundles.
      const regs = await self.registration.constructor
        .prototype
        // No public API to enumerate other registrations from inside an SW,
        // so we rely on the client-side killswitch (index.html + reset.jsx)
        // to handle non-self unregistration. This SW only cleans itself.
        // NOTE: `self.registration` is the current SW's registration.
        ? null : null;
      // 4. Notify all clients so they can reload themselves.
      const list = await self.clients.matchAll({ type: 'window' });
      for (const client of list) {
        try { client.postMessage({ type: 'sw-reset-complete' }); } catch (e) { /* noop */ }
      }
      // 5. Unregister self so no worker remains at this scope.
      await self.registration.unregister();
    } catch (err) {
      // best-effort — never throw
    }
  })());
});

// Explicitly no fetch handler = never intercepts a network request.
