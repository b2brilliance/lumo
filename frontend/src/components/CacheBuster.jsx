/*
 * Client-side cache buster.
 *
 * Every production build regenerates /meta.json with a fresh `buildTime`
 * (see scripts/write-meta.js). On load, we fetch that file with a
 * cache-busting query string so the browser can never return a stale
 * copy, then compare the deployed buildTime with what we saw last.
 *
 * When we detect a NEW deploy AND the user has a stored previous
 * buildTime (i.e. this isn't their very first visit), we:
 *   1. Unregister any lingering Service Worker.
 *   2. Wipe Cache Storage (SW HTTP cache).
 *   3. localStorage.setItem to the new buildTime.
 *   4. window.location.reload() with a cache-buster query string.
 *
 * This runs entirely on the client and works even when the server
 * serves index.html with `Cache-Control: public, max-age=300`. The
 * one caveat: users who cached index.html BEFORE this file was
 * deployed have to wait for that cache window to expire (~5 min) once,
 * after which they're on the auto-update train permanently.
 */
import { useEffect } from "react";

const STORAGE_KEY = "lumo_build_time";
const META_URL = "/meta.json";

async function nukeSwAndCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch (_) { /* ignore */ }
  try {
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch (_) { /* ignore */ }
}

export default function CacheBuster() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Cache-buster on the URL — browsers cannot return a stale copy
        // of meta.json when the query string differs every time.
        const res = await fetch(`${META_URL}?t=${Date.now()}`, {
          cache: "no-store",
          credentials: "omit",
        });
        if (!res.ok || cancelled) return;
        const { buildTime } = await res.json();
        if (!buildTime) return;

        const stored = localStorage.getItem(STORAGE_KEY);

        // First visit — record but do not reload.
        if (!stored) {
          localStorage.setItem(STORAGE_KEY, buildTime);
          return;
        }
        // Same deploy — nothing to do.
        if (stored === buildTime) return;

        // Newer deploy detected → refresh everything.
        localStorage.setItem(STORAGE_KEY, buildTime);
        await nukeSwAndCaches();
        // Guard against reload loops if something goes sideways.
        const loopKey = "lumo_cachebuster_last_reload";
        const now = Date.now();
        const last = parseInt(sessionStorage.getItem(loopKey) || "0", 10);
        if (now - last < 10_000) return; // don't loop within 10s
        sessionStorage.setItem(loopKey, String(now));

        const url = new URL(window.location.href);
        url.searchParams.set("v", buildTime);
        window.location.replace(url.toString());
      } catch (_) {
        /* Network fail / dev server / meta.json missing — silently ignore. */
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
