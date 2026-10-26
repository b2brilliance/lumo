import React, { useEffect, useState } from "react";
import { GoogleMap, useJsApiLoader, CircleF } from "@react-google-maps/api";
import { Flame } from "lucide-react";
import { api } from "@/lib/api";

const LIBRARIES = ["places"];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Where orders and jobs have come from today, so workers can head to busy areas.
export default function BusyMap() {
  const [d, setD] = useState(null);
  const { isLoaded } = useJsApiLoader({ id: "lumo-google-maps", googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  useEffect(() => {
    const load = () => api.get(`/provider/busy-map?tz=${encodeURIComponent(TZ)}`).then((r) => setD(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, []);
  if (!d) return null;
  const max = Math.max(1, ...d.cells.map((c) => c.total));
  const center = d.center?.lat != null ? { lat: d.center.lat, lng: d.center.lng } : d.cells[0] ? { lat: d.cells[0].lat, lng: d.cells[0].lng } : { lat: 39.8, lng: -98.6 };
  return (
    <section className="mt-6 border border-slate-200" data-testid="busy-map">
      <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
        <div className="flex items-center gap-2"><Flame className="w-4 h-4 text-rose-600" /><span className="overline">Busy areas today</span></div>
        <div className="text-xs text-slate-500" data-testid="busy-map-totals">{d.totals.orders} orders · {d.totals.jobs} jobs near you since midnight</div>
      </div>
      {isLoaded ? (
        <GoogleMap mapContainerStyle={{ width: "100%", height: 320 }} center={center} zoom={d.center ? 11 : 4}
          options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false }}>
          {d.cells.map((c) => (
            <CircleF key={`${c.lat},${c.lng}`} center={{ lat: c.lat, lng: c.lng }} radius={350 + 900 * (c.total / max)}
              options={{ strokeWeight: 0, fillColor: c.total / max > 0.6 ? "#e11d48" : c.total / max > 0.3 ? "#f59e0b" : "#fbbf24", fillOpacity: 0.25 + 0.35 * (c.total / max) }} />
          ))}
        </GoogleMap>
      ) : <div className="h-[320px] bg-slate-100" />}
      {d.cells.length === 0 && <div className="p-3 text-xs text-slate-500" data-testid="busy-map-empty">It's quiet so far today. Busy spots will light up here as orders and jobs come in.</div>}
    </section>
  );
}
