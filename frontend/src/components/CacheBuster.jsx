import { useEffect } from "react";

// Long-lived tabs: when a new deploy ships, the static /meta.json (same build
// pipeline as this HTML's <meta name="lumo-build">) changes → soft reload once.
// Like-for-like comparison only; never touches service workers or caches.
const POLL_MS = 5 * 60 * 1000;

function currentBuild() {
  const m = document.querySelector('meta[name="lumo-build"]');
  const v = m ? m.getAttribute("content") || "" : "";
  return v && v !== "__LUMO_BUILD_TIME__" ? v : null;
}

export default function CacheBuster() {
  useEffect(() => {
    const mine = currentBuild();
    if (!mine) return undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/meta.json?t=${Date.now()}`, { cache: "no-store", credentials: "omit" });
        const data = res.ok ? await res.json() : null;
        if (cancelled || !data?.buildTime || data.buildTime === mine) return;
        const key = "lumo_build_reload";
        if (sessionStorage.getItem(key) === data.buildTime) return;
        sessionStorage.setItem(key, data.buildTime);
        window.location.reload();
      } catch { /* offline — ignore */ }
    };
    const t = setInterval(check, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
