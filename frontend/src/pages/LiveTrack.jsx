import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF } from "@react-google-maps/api";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import ChatPanel from "@/components/ChatPanel";
import useProviderLocationPinger from "@/hooks/useProviderLocationPinger";
import { toast } from "sonner";
import { MapPin, Truck, CheckCircle2, Flag, Navigation, Phone, MessageCircle } from "lucide-react";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const LIBRARIES = ["places"];

const STATUS_LABELS = {
  accepted: { label: "Accepted", color: "#0f766e", icon: CheckCircle2 },
  on_the_way: { label: "On the way", color: "#2563eb", icon: Truck },
  arrived: { label: "Arrived", color: "#7c3aed", icon: Flag },
  in_progress: { label: "Job in progress", color: "#d97706", icon: Navigation },
  completed: { label: "Complete", color: "#059669", icon: CheckCircle2 },
};

function fmtAgo(iso) {
  if (!iso) return null;
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function providerPinSvg() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="14" fill="#0f766e" stroke="#fff" stroke-width="3"/>
  <path d="M11 17 L17 11 L17 14 L25 14 L25 20 L17 20 L17 23 Z" fill="#fff"/>
</svg>`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function destPinSvg() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 28 36">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#e11d48" stroke="#fff" stroke-width="2"/>
  <circle cx="14" cy="14" r="5" fill="#fff"/>
</svg>`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default function LiveTrack() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tr, setTr] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "lumo-google-maps",
    googleMapsApiKey: GOOGLE_KEY || "",
    libraries: LIBRARIES,
  });

  const load = async () => {
    try {
      const { data } = await api.get(`/jobs/${id}/tracking`);
      setTr(data);
      setError(null);
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isProvider = user && user !== false && tr && tr.provider_id === user.id;
  const isCustomer = user && user !== false && tr && tr.customer_id === user.id;
  const status = tr?.tracking_status || "accepted";
  const finished = status === "completed";
  const StatusIcon = (STATUS_LABELS[status] || STATUS_LABELS.accepted).icon;

  // Provider pinger — only when the provider is viewing AND job is live.
  useProviderLocationPinger({
    jobId: id,
    enabled: !!isProvider && !finished,
  });

  const setStatus = async (next) => {
    setBusy(true);
    try {
      await api.post(`/jobs/${id}/status`, { status: next });
      toast.success(`Marked: ${STATUS_LABELS[next]?.label || next}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  const cancelAcceptance = async () => {
    const reason = window.prompt(
      "Cancel this job? Other providers will be able to pick it up.\n\nOptional — tell the customer why:"
    );
    if (reason === null) return;
    setBusy(true);
    try {
      await api.post(`/jobs/${id}/cancel-acceptance`, { reason });
      toast.success("Acceptance cancelled — customer notified");
      window.location.href = "/provider";
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };

  if (error) return (
    <div className="max-w-screen-md mx-auto px-6 py-16 text-sm text-slate-500" data-testid="tracker-error">
      {error}
      <div className="mt-3"><Link to="/" className="underline text-teal-700">Go home</Link></div>
    </div>
  );
  if (!tr) return <div className="p-12 text-slate-500">Loading tracker…</div>;

  const center = tr.provider_live_location && tr.provider_live_location.lat != null
    ? { lat: tr.provider_live_location.lat, lng: tr.provider_live_location.lng }
    : (tr.destination && tr.destination.lat != null
        ? { lat: tr.destination.lat, lng: tr.destination.lng }
        : { lat: 39.8283, lng: -98.5795 });

  const path = (tr.provider_live_location && tr.destination
    && tr.provider_live_location.lat != null && tr.destination.lat != null)
    ? [
        { lat: tr.provider_live_location.lat, lng: tr.provider_live_location.lng },
        { lat: tr.destination.lat, lng: tr.destination.lng },
      ]
    : null;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8">
        <Link to={`/jobs/${id}`} className="overline text-teal-700 hover:underline" data-testid="tracker-back">← Back to job</Link>
        <div className="mt-3 flex items-center gap-3 flex-wrap" data-testid="tracker-status-bar">
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 border text-xs font-mono uppercase tracking-wider"
            style={{ borderColor: STATUS_LABELS[status].color, color: STATUS_LABELS[status].color }}
            data-testid="tracker-status-pill"
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {STATUS_LABELS[status].label}
          </span>
          {tr.eta_minutes != null && !finished && (
            <span className="text-sm font-mono text-slate-700" data-testid="tracker-eta">
              ETA <span className="font-display font-bold text-base">{tr.eta_minutes}</span> min
            </span>
          )}
          {tr.provider_live_location?.updated_at && (
            <span className="text-[11px] text-slate-400 font-mono" data-testid="tracker-last-update">
              Last ping {fmtAgo(tr.provider_live_location.updated_at)}
            </span>
          )}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter mt-2" data-testid="tracker-title">
          {isCustomer ? `Tracking ${tr.provider_name || "your provider"}` : `Heading to ${tr.customer_name || "customer"}`}
        </h1>
        <div className="text-sm text-slate-500 mt-1" data-testid="tracker-job-title">{tr.job_title}</div>

        {/* Post-match action bar — appears the moment a provider accepts.
            Call is a tel: link; message scrolls the ChatPanel into view. */}
        {tr.provider_id && !finished && (
          <div className="mt-4 flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-white" data-testid="tracker-contact-bar">
            {tr.counterparty_avatar_url ? (
              <img src={tr.counterparty_avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center font-display font-bold text-sm" data-testid="tracker-counterparty-initials">
                {((isCustomer ? tr.provider_name : tr.customer_name) || "L").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="overline">{isCustomer ? "Your provider" : "Customer"}</div>
              <div className="font-display font-semibold text-sm truncate">
                {isCustomer ? (tr.provider_name || "Provider") : (tr.customer_name || "Customer")}
              </div>
            </div>
            {tr.counterparty_phone && (
              <a
                href={`tel:${tr.counterparty_phone}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-colors text-sm font-medium"
                data-testid="tracker-call"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                const chat = document.querySelector('[data-testid="chat-panel"]') || document.querySelector('aside');
                if (chat && chat.scrollIntoView) chat.scrollIntoView({ behavior: "smooth", block: "center" });
                const input = chat && chat.querySelector('input, textarea');
                if (input) setTimeout(() => input.focus(), 400);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 transition-colors text-sm font-medium"
              data-testid="tracker-message"
            >
              <MessageCircle className="w-4 h-4" /> Message
            </button>
          </div>
        )}

        <div className="mt-5 border border-slate-200 bg-slate-100" style={{ height: 520 }} data-testid="tracker-map">
          {!GOOGLE_KEY && (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Set REACT_APP_GOOGLE_MAPS_API_KEY to enable the live map.
            </div>
          )}
          {loadError && (
            <div className="h-full flex items-center justify-center text-sm text-red-600">
              Google Maps failed to load.
            </div>
          )}
          {isLoaded && GOOGLE_KEY && (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: 520 }}
              center={center}
              zoom={tr.provider_live_location?.lat != null ? 13 : 11}
              options={{
                mapTypeControl: false, streetViewControl: false,
                fullscreenControl: false, clickableIcons: false,
              }}
            >
              {tr.destination?.lat != null && (
                <MarkerF
                  position={{ lat: tr.destination.lat, lng: tr.destination.lng }}
                  icon={{ url: destPinSvg() }}
                  data-testid="dest-pin"
                />
              )}
              {tr.provider_live_location?.lat != null && (
                <MarkerF
                  position={{
                    lat: tr.provider_live_location.lat,
                    lng: tr.provider_live_location.lng,
                  }}
                  icon={{ url: providerPinSvg() }}
                  data-testid="provider-pin"
                />
              )}
              {path && (
                <PolylineF
                  path={path}
                  options={{
                    strokeColor: "#0f766e", strokeOpacity: 0.7, strokeWeight: 3,
                    geodesic: true,
                  }}
                />
              )}
            </GoogleMap>
          )}
        </div>

        {tr.destination?.address && (
          <div className="mt-3 flex items-start gap-2 text-sm text-slate-600" data-testid="tracker-dest-address">
            <MapPin className="w-4 h-4 text-rose-600 mt-0.5" />
            <div>
              <div className="overline text-slate-500">Destination</div>
              {tr.destination.address}
            </div>
          </div>
        )}

        {isProvider && !finished && (
          <div className="mt-6 border border-slate-200 p-4" data-testid="provider-status-actions">
            <div className="overline mb-3">Update status</div>
            <div className="flex flex-wrap gap-2">
              {["on_the_way", "arrived", "in_progress", "completed"].map((s) => (
                <Button
                  key={s}
                  variant={status === s ? "default" : "outline"}
                  disabled={busy || status === s}
                  onClick={() => setStatus(s)}
                  className={status === s ? "bg-teal-700 hover:bg-teal-800" : ""}
                  data-testid={`set-status-${s}`}
                >
                  {STATUS_LABELS[s].label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3 leading-snug">
              Your live location is being shared with the customer while this job is active. It stops automatically when you mark it complete.
            </p>
            <button
              type="button"
              onClick={cancelAcceptance}
              disabled={busy}
              className="mt-3 text-[11px] font-mono uppercase tracking-widest text-rose-600 hover:text-rose-800 underline disabled:opacity-60"
              data-testid="cancel-acceptance-btn"
            >
              Can&apos;t make it — cancel this job
            </button>
          </div>
        )}

        {isCustomer && (
          <div className="mt-6 border border-slate-200 p-4 text-sm" data-testid="customer-tracker-info">
            <div className="overline">Heads up</div>
            <p className="text-slate-600 mt-2 leading-snug">
              {finished
                ? "This job is complete. Tap back to leave a review."
                : `${tr.provider_name || "Your provider"} will appear on the map as soon as they share their location. You'll be notified at every status change.`}
            </p>
          </div>
        )}
      </div>

      <aside className="lg:col-span-4">
        <ChatPanel jobId={id} />
      </aside>
    </div>
  );
}
