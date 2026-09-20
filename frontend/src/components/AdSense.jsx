/**
 * Google AdSense integration.
 *
 * <AdSense slot="…" /> renders an ad unit on visitor-facing pages.
 * The publisher ID is read from `/api/site/social` (admin-managed via
 * Site tab → "Google AdSense publisher ID"). When the ID is empty the
 * component renders nothing so pages still look clean pre-approval.
 *
 * Best practices:
 *  - Ad slots must have visible width > 0 before adsbygoogle is pushed.
 *  - Google recommends `data-ad-format="auto"` + `data-full-width-responsive`
 *    for responsive slots.
 *  - Loading the adsbygoogle.js library twice is safe (idempotent).
 */
import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

let _clientCache = null; // "" = disabled, "ca-pub-…" = enabled, null = unloaded
let _scriptInjected = false;
let _loadPromise = null;

/**
 * Detect if the AdSense loader script is already present in the DOM
 * (e.g. hard-coded in <head> for Google's site verification). If so we
 * skip re-injection but still record the client ID so slots render.
 */
function _detectExistingScript() {
  if (typeof document === "undefined") return "";
  const existing = document.querySelector('script[src*="adsbygoogle.js"]');
  if (!existing) return "";
  try {
    const url = new URL(existing.src, window.location.origin);
    const client = url.searchParams.get("client") || "";
    if (client) _scriptInjected = true;
    return client;
  } catch {
    return "";
  }
}

/**
 * Fetch the AdSense publisher ID once per session and inject the script tag.
 * Returns the client ID string (may be empty).
 */
async function loadAdSense() {
  if (_clientCache !== null) return _clientCache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    // First: pick up a hard-coded <script> tag from index.html (used so
    // Google's crawler can verify the site even before React mounts).
    const preloaded = _detectExistingScript();
    if (preloaded) {
      _clientCache = preloaded;
      return preloaded;
    }
    try {
      const { data } = await api.get("/site/social");
      const client = (data?.adsense_client || "").trim();
      _clientCache = client;
      if (client && !_scriptInjected && typeof document !== "undefined") {
        const s = document.createElement("script");
        s.async = true;
        s.crossOrigin = "anonymous";
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
        s.setAttribute("data-testid", "adsense-script");
        document.head.appendChild(s);
        _scriptInjected = true;
      }
      return client;
    } catch {
      _clientCache = "";
      return "";
    }
  })();
  return _loadPromise;
}

/**
 * A single ad unit. Provide a numeric AdSense slot id from your
 * AdSense dashboard (Ads → By ad unit → slot id). If you don't have
 * one yet, leave `slot` empty and Auto Ads will still crawl the page.
 *
 * Props:
 *   slot        AdSense ad-unit slot id (string of digits)
 *   format      "auto" (default) | "fluid" | "rectangle" | …
 *   layout      Optional layout for in-feed / matched-content
 *   className   Container className
 *   testid      Optional data-testid override
 */
export function AdSense({ slot = "", format = "auto", layout = "", className = "", testid = "adsense-slot", style = {} }) {
  const [client, setClient] = useState(_clientCache);
  const insRef = useRef(null);
  const pushed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadAdSense().then((c) => {
      if (!cancelled) setClient(c);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!client || pushed.current) return;
    // Give the DOM a tick to compute width so AdSense doesn't refuse to fill.
    const t = setTimeout(() => {
      try {
        // eslint-disable-next-line no-undef
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        /* AdSense sometimes throws if width=0 or blocked — ignore */
      }
    }, 50);
    return () => clearTimeout(t);
  }, [client]);

  if (!client) return null; // silently render nothing when AdSense is disabled

  return (
    <div className={`adsense-container my-6 flex justify-center ${className}`} data-testid={testid}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", minHeight: 100, ...style }}
        data-ad-client={client}
        data-ad-slot={slot || undefined}
        data-ad-format={format}
        data-ad-layout={layout || undefined}
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default AdSense;
