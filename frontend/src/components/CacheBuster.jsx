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
// Primary source: backend endpoint served with strict no-store headers.
// The static /meta.json is inside the frontend bucket and Cloudflare
// caches it for 5 min (even with cache-busting query strings), which was
// making users stay stuck on stale HTML after a deploy.
const META_URLS = ["/api/meta", "/meta.json"];
// How often to re-check for new deploys while the tab is open. Keeps
// existing sessions in sync without requiring a refresh.
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

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
    const backendBase = (typeof process !== "undefined" && process.env.REACT_APP_BACKEND_URL) || "";

    async function fetchMeta() {
      // Try the backend (no-store) first, then fall back to the static file.
      for (const path of META_URLS) {
        const url = path.startsWith("/api")
          ? `${backendBase}${path}?t=${Date.now()}`
          : `${path}?t=${Date.now()}`;
        try {
          const res = await fetch(url, { cache: "no-store", credentials: "omit" });
          if (!res.ok) continue;
          const data = await res.json();
          if (data && data.buildTime) return data.buildTime;
        } catch { /* try next */ }
      }
      return null;
    }

    async function check(isInitial) {
      if (cancelled) return;
      const buildTime = await fetchMeta();
      if (!buildTime || cancelled) return;

      const stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        // First visit — record but do not reload.
        localStorage.setItem(STORAGE_KEY, buildTime);
        return;
      }
      if (stored === buildTime) return; // Same deploy — nothing to do.

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
    }

    // Initial check on mount + poll every 5 min for open tabs
    check(true);
    const interval = setInterval(() => check(false), POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  return null;
}
