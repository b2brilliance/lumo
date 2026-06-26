import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, DollarSign, Globe } from "lucide-react";
import { api, CATEGORY_COLORS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { milesBetween } from "@/lib/deliveryPricing";
import MapView from "@/components/MapView";

const RADIUS_MI = 50;

// Format an ISO timestamp as a relative "time ago" string.
function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export default function MapPage() {
  const { user } = useAuth();
  const [pins, setPins] = useState([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
  const [highlight, setHighlight] = useState(null);

  // Anchor for the 50-mile radius filter. Prefer the provider's saved service
  // location, then the customer's saved default delivery address, then null
  // (which falls back to "show everything").
  const anchor = useMemo(() => {
    const provLoc = user?.location;
    if (provLoc && provLoc.lat != null && provLoc.lng != null) {
      return { lat: provLoc.lat, lng: provLoc.lng, source: "provider" };
    }
    const cust = user?.default_delivery_address;
    if (cust && cust.lat != null && cust.lng != null) {
      return { lat: cust.lat, lng: cust.lng, source: "address" };
    }
    return null;
  }, [user]);

  const load = async () => {
    const params = new URLSearchParams();
    if (remoteOnly) params.set("remote_only", "true");
    if (groupFilter) params.set("category_group_filter", groupFilter);
    const { data } = await api.get(`/map/jobs?${params}`);
    setPins(data);
  };
  useEffect(() => { load(); }, [remoteOnly, groupFilter]);

  // Compute distance for each pin from the anchor, then filter to <= 50 mi.
  // Remote jobs always show (their pin is the geographic centre of the US).
  const feed = useMemo(() => {
    const withDistance = pins.map((p) => {
      if (p.is_remote) return { ...p, distance_miles: null };
      if (!anchor || p.lat == null) return { ...p, distance_miles: null };
      return { ...p, distance_miles: milesBetween({ lat: anchor.lat, lng: anchor.lng }, { lat: p.lat, lng: p.lng }) };
    });
    const filtered = anchor
      ? withDistance.filter((p) => p.is_remote || (p.distance_miles != null && p.distance_miles <= RADIUS_MI))
      : withDistance;
    // Server already sorts by created_at desc, but in case of stale order, re-sort.
    return filtered.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [pins, anchor]);

  const showingMessage = !anchor
    ? "Showing every open job — sign in or set a location in Settings to filter to your area."
    : `Showing open jobs within ${RADIUS_MI} miles of your saved ${anchor.source === "provider" ? "service location" : "delivery address"}.`;

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="overline">Live map</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Every open job.</h1>
      <p className="text-slate-600 mt-2 max-w-xl">
        Pins coloured by category. Toggle <span className="text-teal-700 font-semibold">Remote-friendly</span> for remote-only opportunities.
      </p>

      {/* ── Map (untouched — same component, same height) ──────────────────── */}
      <div className="mt-6">
        <MapView
          pins={pins}
          highlightId={highlight}
          onPinClick={(p) => setHighlight(p.id)}
          remoteOnly={remoteOnly}
          setRemoteOnly={setRemoteOnly}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          height={520}
        />
      </div>

      {/* ── Chronological feed (newest first, 50-mile radius) ──────────────── */}
      <div className="mt-12" data-testid="map-job-list">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-display text-2xl font-black tracking-tighter">
            {feed.length} {feed.length === 1 ? "open job" : "open jobs"}
          </h2>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500" data-testid="map-feed-sort-label">
            Newest first
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-6" data-testid="map-feed-radius-note">{showingMessage}</p>

        {feed.length === 0 && (
          <div className="text-center py-16 border border-slate-200 text-sm text-slate-500" data-testid="map-empty">
            {anchor
              ? `No open jobs within ${RADIUS_MI} miles right now. Try toggling Remote-friendly above or widen your search.`
              : "No jobs match your filters yet. Try switching off Remote-friendly or picking a different category group above."}
          </div>
        )}

        <ul className="divide-y divide-slate-200 border border-slate-200" data-testid="map-feed-list">
          {feed.map((p) => (
            <FeedRow key={p.id} pin={p} highlight={highlight === p.id} onHover={() => setHighlight(p.id)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function FeedRow({ pin, highlight, onHover }) {
  const groupColor = CATEGORY_COLORS[pin.category_group]?.hex || "#475569";
  const distLabel = pin.is_remote
    ? "Remote"
    : pin.distance_miles != null
      ? `${pin.distance_miles.toFixed(1)} mi away`
      : pin.address || "—";

  return (
    <li
      onMouseEnter={onHover}
      className={`group transition-colors ${highlight ? "bg-teal-50/60" : "hover:bg-slate-50"}`}
      data-testid={`feed-row-${pin.id}`}
    >
      <Link to={`/jobs/${pin.id}`} className="flex items-stretch gap-0">
        {/* Coloured side rail keyed by category group */}
        <div className="w-1 flex-shrink-0" style={{ background: groupColor }} aria-hidden="true" />

        <div className="flex-1 min-w-0 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Title + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border" style={{ color: groupColor, borderColor: groupColor }}>
                {pin.category}
              </span>
              {pin.is_remote && (
                <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-teal-700 text-teal-700 flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" /> Remote
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-bold tracking-tight mt-1.5 leading-tight line-clamp-1 group-hover:text-teal-800">
              {pin.title}
            </h3>
            {pin.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{pin.description}</p>
            )}
          </div>

          {/* Stats: pay · distance · age */}
          <div className="flex sm:flex-col sm:items-end gap-4 sm:gap-1 text-xs font-mono shrink-0">
            <div className="flex items-center gap-1 text-slate-900">
              <DollarSign className="w-3 h-3" />
              <span className="font-display font-bold text-base">{Number(pin.pay_rate || 0).toFixed(2)}</span>
              <span className="text-slate-500">/ {pin.pay_unit}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <MapPin className="w-3 h-3" />
              <span className="truncate max-w-[12rem]">{distLabel}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" />
              {timeAgo(pin.created_at)}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
