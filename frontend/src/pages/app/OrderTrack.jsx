import React, { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF } from "@react-google-maps/api";
import { Bike, Store, Home, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { TipDriver } from "@/components/app/TipDriver";

const LIBRARIES = ["places"];
const dot = (color, size = 18) => ({
  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="white" stroke-width="3"/></svg>`)}`,
});
const STEPS = [["deposit_paid", "Finding a driver"], ["in_progress", "On the way"], ["completed", "Delivered"]];
const ll = (p) => (p && p.lat != null ? { lat: p.lat, lng: p.lng } : null);

function Status({ t }) {
  const idx = STEPS.findIndex(([s]) => s === t.status);
  return (
    <ol className="flex gap-2 mt-5" data-testid="order-track-steps">
      {STEPS.map(([s, label], i) => (
        <li key={s} className={`flex-1 h-1.5 rounded-full ${i <= idx ? "bg-slate-900" : "bg-slate-200"}`} title={label} />
      ))}
    </ol>
  );
}

export default function OrderTrack() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [err, setErr] = useState(null);
  const mapRef = useRef(null);
  const { isLoaded } = useJsApiLoader({ id: "lumo-google-maps", googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "", libraries: LIBRARIES });
  const reload = () => api.get(`/orders/${id}/track`).then((r) => setT(r.data)).catch(() => {});
  useEffect(() => {
    const load = () => api.get(`/orders/${id}/track`).then((r) => setT(r.data)).catch((e) => setErr(formatApiError(e)));
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [id]);
  const pickup = ll(t?.pickup), drop = ll(t?.dropoff), drv = ll(t?.driver);
  const pts = [pickup, drop, t?.status === "in_progress" ? drv : null].filter(Boolean);
  const fit = () => {
    const m = mapRef.current;
    if (!m || pts.length < 2 || !window.google) return;
    const b = new window.google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    m.fitBounds(b, 60);
  };
  const key = pts.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|");
  useEffect(() => { fit(); }, [key]); // eslint-disable-line
  if (err) return <div className="p-10 text-center text-slate-500" data-testid="order-track-error">{err}</div>;
  if (!t) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  const center = drv || drop || pickup || { lat: 39.8, lng: -98.6 };
  const headline = t.status === "completed" ? "Delivered" : t.status === "in_progress" ? (t.eta_minutes ? `Arriving in about ${t.eta_minutes} min` : "Your driver is on the way") : "Finding a driver near the store";
  return (
    <div className="max-w-3xl mx-auto px-4 py-6" data-testid="order-track-page">
      <div className="text-xs font-mono uppercase tracking-widest text-slate-500">{t.store_name}</div>
      <h1 className="font-display text-3xl font-bold mt-1" data-testid="order-track-headline">{headline}</h1>
      {t.driver_name && <div className="text-sm text-slate-600 mt-1 flex items-center gap-1.5" data-testid="order-track-driver"><Bike className="w-4 h-4" /> {t.driver_name}</div>}
      <Status t={t} />
      <div className="mt-6 rounded-3xl overflow-hidden border border-slate-200" data-testid="order-track-map">
        {isLoaded ? (
          <GoogleMap mapContainerStyle={{ width: "100%", height: 440 }} center={center} zoom={drv ? 14 : 12}
            onLoad={(m) => { mapRef.current = m; fit(); }}
            options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false }}>
            {pickup && <MarkerF position={pickup} icon={dot("#D97706")} />}
            {drop && <MarkerF position={drop} icon={dot("#0f172a")} />}
            {drv && t.status === "in_progress" && <MarkerF position={drv} icon={dot("#059669", 26)} />}
            {drv && drop && t.status === "in_progress" && <PolylineF path={[drv, drop]} options={{ strokeColor: "#059669", strokeOpacity: 0.8, strokeWeight: 4 }} />}
          </GoogleMap>
        ) : <div className="h-[440px] bg-slate-100" />}
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
        <div className="flex gap-2 items-start"><Store className="w-4 h-4 mt-0.5 text-amber-600" /><div><div className="font-semibold">Pickup</div><div className="text-slate-500">{t.pickup?.address || t.store_name}</div></div></div>
        <div className="flex gap-2 items-start"><Home className="w-4 h-4 mt-0.5" /><div><div className="font-semibold">Drop-off</div><div className="text-slate-500">{t.dropoff?.address || "—"}</div></div></div>
      </div>
      {t.dropoff_photo_url && (
        <figure className="mt-6" data-testid="order-track-photo">
          <img src={`${process.env.REACT_APP_BACKEND_URL}${t.dropoff_photo_url}`} alt="Drop-off" className="w-full max-h-96 object-cover rounded-3xl border border-slate-200" />
          <figcaption className="text-xs text-slate-500 mt-2">Drop-off photo from {t.driver_name || "your driver"}</figcaption>
        </figure>
      )}
      {t.status === "completed" && <div className="mt-6 flex items-center gap-2 text-emerald-700 font-semibold" data-testid="order-track-delivered"><CheckCircle2 className="w-5 h-5" /> Delivered. Enjoy!</div>}
      <TipDriver t={t} onPaid={reload} />
      <Link to="/orders" className="mt-8 inline-block text-sm underline text-slate-600" data-testid="order-track-back">Back to orders</Link>
    </div>
  );
}
