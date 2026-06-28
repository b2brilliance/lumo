import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { watchPosition } from "@/lib/native";

/**
 * Watches the provider's device GPS while an active job is in flight
 * and pings the backend every `intervalMs` so the customer's live
 * tracker shows their position in real time.
 *
 * On native (iOS / Android via Capacitor) this uses the OS-level watcher
 * which keeps reporting even when the screen sleeps. On web it falls
 * back to `navigator.geolocation.watchPosition`.
 *
 * Activates only when `enabled` is true (e.g. when provider has an
 * active accepted/on_the_way/arrived/in_progress job).
 */
export default function useProviderLocationPinger({ jobId, enabled, intervalMs = 12000 }) {
  const lastPosRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const clearRef = useRef(null);

  useEffect(() => {
    if (!enabled || !jobId) return;
    let cancelled = false;

    const sendIfDue = async (pos) => {
      const now = Date.now();
      if (now - lastSentAtRef.current < intervalMs) return;
      lastSentAtRef.current = now;
      try {
        await api.post(`/jobs/${jobId}/location`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
        });
      } catch (_) { /* silent — provider may be offline briefly */ }
    };

    (async () => {
      const stop = await watchPosition(
        (pos) => {
          lastPosRef.current = pos;
          sendIfDue(pos);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 8000 }
      );
      if (cancelled) {
        stop?.();
      } else {
        clearRef.current = stop;
      }
    })();

    // Also drive a fallback interval so we still POST if the device sits still.
    const tick = setInterval(() => {
      if (lastPosRef.current) sendIfDue(lastPosRef.current);
    }, intervalMs);

    return () => {
      cancelled = true;
      try { clearRef.current?.(); } catch (_) { /* clear silently */ }
      clearInterval(tick);
    };
  }, [jobId, enabled, intervalMs]);
}
