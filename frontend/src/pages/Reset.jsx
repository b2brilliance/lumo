import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";

/*
 * /reset — nuclear reset page.
 *
 * Users on mobile who are pinned to a stale HTML shell (because an
 * old service worker or an over-cached HTML asset is intercepting
 * their fetches) can navigate to `golumo.app/reset` once to fully
 * wipe local state. This page:
 *   1. Unregisters every service worker at this origin.
 *   2. Deletes every Cache Storage entry.
 *   3. Clears localStorage + sessionStorage.
 *   4. Redirects to `/` with a cache-buster after ~3s.
 *
 * The user only ever needs to visit this URL ONCE per device. The
 * outcome is functionally equivalent to "clear site data in browser
 * settings" but doesn't require them to dig through menus.
 */
export default function Reset() {
  const [steps, setSteps] = useState({
    sw: "pending",
    caches: "pending",
    storage: "pending",
    redirect: "pending",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mark = (k, v) => !cancelled && setSteps((s) => ({ ...s, [k]: v }));

      // 1) Unregister every service worker (does NOT preserve push-sw.js —
      //    this is a full reset, user opts back into push after.)
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister().catch(() => null)));
        }
        mark("sw", "done");
      } catch (e) {
        mark("sw", "warn");
      }

      // 2) Delete every Cache Storage entry.
      try {
        if (window.caches && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => null)));
        }
        mark("caches", "done");
      } catch (e) {
        mark("caches", "warn");
      }

      // 3) Clear localStorage + sessionStorage (preserve nothing — this is
      //    a reset). User will be signed out and needs to sign back in.
      try {
        try { localStorage.clear(); } catch (e) { /* private mode */ }
        try { sessionStorage.clear(); } catch (e) { /* private mode */ }
        mark("storage", "done");
      } catch (e) {
        mark("storage", "warn");
      }

      // 4) Redirect home with a fresh cache-buster so the CDN + browser
      //    both fetch a brand-new HTML shell.
      setTimeout(() => {
        if (cancelled) return;
        mark("redirect", "done");
        const target = new URL(window.location.origin);
        target.searchParams.set("_reset", String(Date.now()));
        window.location.replace(target.toString());
      }, 2000);
    })().catch((err) => {
      setError(err?.message || "Reset failed. Try clearing browser data manually.");
    });

    return () => { cancelled = true; };
  }, []);

  const rows = [
    { key: "sw",       label: "Unregister service workers" },
    { key: "caches",   label: "Delete cached files" },
    { key: "storage",  label: "Clear stored preferences" },
    { key: "redirect", label: "Reload with a fresh session" },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6" data-testid="page-reset">
      <Helmet>
        <title>Reset · Lumo</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-md w-full">
        <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-6">
          <RefreshCw className="w-5 h-5 text-white animate-spin" />
        </div>

        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-tight">
          Resetting your device.
        </h1>
        <p className="mt-3 text-sm text-white/70 leading-relaxed">
          You're on this page because Lumo wasn't loading in your browser. We're wiping every cached file and old app worker your phone stored. You'll be signed out and land on a fresh homepage in a few seconds.
        </p>

        <ul className="mt-8 space-y-3" data-testid="reset-steps">
          {rows.map((r) => {
            const status = steps[r.key];
            return (
              <li key={r.key} className="flex items-center gap-3 text-sm" data-testid={`reset-step-${r.key}`}>
                {status === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : status === "warn" ? (
                  <CheckCircle2 className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-white/40 animate-spin flex-shrink-0" />
                )}
                <span className={status === "pending" ? "text-white/50" : "text-white"}>{r.label}</span>
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="mt-8 p-4 border border-red-400/40 bg-red-500/10 text-sm text-red-200">
            {error}
          </div>
        )}

        <p className="mt-10 text-xs text-white/40 font-mono">
          Bookmark this page: <span className="underline">golumo.app/reset</span> — visit anytime the site misbehaves.
        </p>
      </div>
    </div>
  );
}
