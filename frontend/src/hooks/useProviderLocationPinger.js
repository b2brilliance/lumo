import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

/**
 * Watches the provider's device GPS while an active job is in flight
 * and pings the backend every `intervalMs` so the customer's live
 * tracker shows their position in real time.
 *
 * Activates only when `enabled` is true (e.g. when provider has an
 * active accepted/on_the_way/arrived/in_progress job).
 */
export default function useProviderLocationPinger({ jobId, enabled, intervalMs = 12000 }) {
  const lastPosRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled || !jobId) return;
    if (!("geolocation" in navigator)) return;

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

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPosRef.current = pos;
        sendIfDue(pos);
      },
      () => { /* permission denied or unavailable — ignore */ },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 }
    );

    // Also drive a fallback interval so we still POST if the device sits still.
    const tick = setInterval(() => {
      if (lastPosRef.current) sendIfDue(lastPosRef.current);
    }, intervalMs);

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearInterval(tick);
    };
  }, [jobId, enabled, intervalMs]);
}
