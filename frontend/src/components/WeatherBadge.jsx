/**
 * <WeatherBadge slug="miami-fl" />
 *
 * Fetches current temperature + sky condition for a recruit city and
 * renders a tiny pill ("78° · Partly cloudy ⛅"). Hides itself silently
 * on any error — the badge is a nice-to-have, never a blocker.
 *
 * Data source: backend `/api/recruit/cities/{slug}/weather` (Open-Meteo
 * under the hood, 30-min server cache).
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function WeatherBadge({ slug, className = "", testId = "weather-badge" }) {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/recruit/cities/${encodeURIComponent(slug)}/weather`);
        if (!cancelled) setState(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (failed || !state) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-mono text-white/90 ${className}`}
      title={`${state.temp_f}° — ${state.condition}`}
      data-testid={testId}
    >
      <span aria-hidden>{state.emoji}</span>
      <span><b className="text-white">{state.temp_f}°F</b> · {state.condition}</span>
    </span>
  );
}
