import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { MapPin, Clock, DollarSign, Globe, ExternalLink, Zap } from "lucide-react";
import { api, CATEGORY_COLORS, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { milesBetween } from "@/lib/deliveryPricing";
import MapView from "@/components/MapView";
import { toast } from "sonner";

const RADIUS_OPTIONS = [
  { value: 5,   label: "5 mi" },
  { value: 10,  label: "10 mi" },
  { value: 25,  label: "25 mi" },
  { value: 50,  label: "50 mi" },
  { value: 100, label: "100 mi" },
  { value: 250, label: "250 mi" },
  { value: 0,   label: "Any" },     // 0 = no distance filter
];
const RADIUS_STORAGE_KEY = "lumo.map.radius";

// Convert a pin's pay_rate into a comparable annualised dollar amount so the
// pay-range filter can mix hourly, flat, and yearly listings.
function normalizedAnnualPay(p) {
  const r = Number(p.pay_rate || 0);
  if (!Number.isFinite(r) || r <= 0) return 0;
  const unit = (p.pay_unit || "").toLowerCase();
  if (unit === "year") return r;
  if (unit === "month") return r * 12;
  if (unit === "week") return r * 52;
  if (unit === "day") return r * 250;     // ~working days/yr
  if (unit === "hour") return r * 2080;   // ~40 h x 52 w
  return r;
}

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
  const [params] = useSearchParams();
  const employmentFilter = params.get("employment");
  const [pins, setPins] = useState([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
  const [highlight, setHighlight] = useState(null);
  // User-selectable radius (persists across visits via localStorage). 0 = Any.
  const [radius, setRadius] = useState(() => {
    if (typeof window === "undefined") return 50;
    const stored = parseInt(window.localStorage.getItem(RADIUS_STORAGE_KEY), 10);
    return Number.isFinite(stored) ? stored : 50;
  });
  useEffect(() => {
    try { window.localStorage.setItem(RADIUS_STORAGE_KEY, String(radius)); } catch (_) { /* localStorage unavailable */ }
  }, [radius]);

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
    if (employmentFilter) params.set("employment_type", employmentFilter);
    const { data } = await api.get(`/map/jobs?${params}`);
    setPins(data);
  };
  useEffect(() => { load(); }, [remoteOnly, groupFilter, employmentFilter]);

  // Job-board-style filters for W-2 + Remote views (keyword/pay/schedule).
  // Hidden for on_demand / staffing where they're less useful.
  const showJobBoardFilters = employmentFilter === "w2" || employmentFilter === "remote";
  const [keyword, setKeyword] = useState("");
  const [minPay, setMinPay] = useState("");
  const [maxPay, setMaxPay] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState(null); // 'Full-time' | 'Part-time' | 'Contract' | null

  // Compute distance for each pin from the anchor, then filter by the selected
  // radius (0 = Any, no distance filter). Remote jobs always show.
  const feed = useMemo(() => {
    const withDistance = pins.map((p) => {
      if (p.is_remote) return { ...p, distance_miles: null };
      if (!anchor || p.lat == null) return { ...p, distance_miles: null };
      return { ...p, distance_miles: milesBetween({ lat: anchor.lat, lng: anchor.lng }, { lat: p.lat, lng: p.lng }) };
    });
    let filtered = (anchor && radius > 0)
      ? withDistance.filter((p) => p.is_remote || (p.distance_miles != null && p.distance_miles <= radius))
      : withDistance;

    // Job-board filters (only used when on /map?employment=w2 or =remote)
    if (showJobBoardFilters) {
      const kw = keyword.trim().toLowerCase();
      if (kw) {
        filtered = filtered.filter((p) =>
          (p.title || "").toLowerCase().includes(kw) ||
          (p.description || "").toLowerCase().includes(kw)
        );
      }
      const min = parseFloat(minPay);
      const max = parseFloat(maxPay);
      if (Number.isFinite(min)) filtered = filtered.filter((p) => normalizedAnnualPay(p) >= min);
      if (Number.isFinite(max)) filtered = filtered.filter((p) => normalizedAnnualPay(p) <= max);
      if (scheduleFilter) {
        filtered = filtered.filter((p) => (p.schedule || "").toLowerCase().includes(scheduleFilter.toLowerCase()));
      }
    }

    return filtered.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [pins, anchor, radius, showJobBoardFilters, keyword, minPay, maxPay, scheduleFilter]);

  const showingMessage = !anchor
    ? "Showing every open job — sign in or set a location in Settings to filter to your area."
    : radius === 0
      ? "Showing every open job (no distance filter)."
      : `Showing open jobs within ${radius} miles of your saved ${anchor.source === "provider" ? "service location" : "delivery address"}.`;

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="overline">Jobs near you</div>
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

      {/* ── Chronological feed (newest first, user-selectable radius) ──────── */}
      <div className="mt-12" data-testid="map-job-list">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-display text-2xl font-black tracking-tighter">
            {feed.length} {feed.length === 1 ? "open job" : "open jobs"}
          </h2>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500" data-testid="map-feed-sort-label">
            Newest first
          </div>
        </div>

        {/* Radius selector — segmented pill bar */}
        <div className="flex items-center gap-2 flex-wrap mb-2" data-testid="map-radius-selector">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mr-1">Radius</span>
          {RADIUS_OPTIONS.map((opt) => {
            const active = radius === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRadius(opt.value)}
                className={`text-xs font-mono px-2.5 py-1 border transition-colors ${active
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"}`}
                data-testid={`radius-opt-${opt.value}`}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 mb-6" data-testid="map-feed-radius-note">{showingMessage}</p>

        {/* Job-board filters (only for W-2 / Remote views) */}
        {showJobBoardFilters && (
          <div className="border border-slate-200 bg-slate-50/60 p-4 mb-6 grid sm:grid-cols-4 gap-3" data-testid="map-job-board-filters">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Search title or description</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="React · nursing · marketing…"
                className="mt-1 w-full px-3 py-2 border border-slate-300 bg-white text-sm"
                data-testid="map-filter-keyword"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Min pay (annualised $)</label>
              <input
                type="number"
                inputMode="numeric"
                value={minPay}
                onChange={(e) => setMinPay(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full px-3 py-2 border border-slate-300 bg-white text-sm"
                data-testid="map-filter-min-pay"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Max pay (annualised $)</label>
              <input
                type="number"
                inputMode="numeric"
                value={maxPay}
                onChange={(e) => setMaxPay(e.target.value)}
                placeholder="200000"
                className="mt-1 w-full px-3 py-2 border border-slate-300 bg-white text-sm"
                data-testid="map-filter-max-pay"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mr-2">Schedule</label>
              <div className="inline-flex flex-wrap gap-1.5 mt-1">
                {["Full-time", "Part-time", "Contract", "Flexible"].map((s) => {
                  const active = scheduleFilter === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScheduleFilter(active ? null : s)}
                      className={`text-xs font-mono px-2.5 py-1 border transition-colors ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"}`}
                      data-testid={`map-filter-schedule-${s.toLowerCase().replace(/[^a-z]/g, '-')}`}
                    >
                      {s}
                    </button>
                  );
                })}
                {(keyword || minPay || maxPay || scheduleFilter) && (
                  <button
                    type="button"
                    onClick={() => { setKeyword(""); setMinPay(""); setMaxPay(""); setScheduleFilter(null); }}
                    className="text-xs underline text-slate-500 hover:text-slate-900 ml-2"
                    data-testid="map-filter-clear"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {feed.length === 0 && (
          <div className="text-center py-16 border border-slate-200 text-sm text-slate-500" data-testid="map-empty">
            {anchor && radius > 0
              ? `No open jobs within ${radius} miles right now. Try widening the radius above or toggling Remote-friendly.`
              : "No jobs match your filters yet. Try switching off Remote-friendly or picking a different category group above."}
          </div>
        )}

        <ul className="divide-y divide-slate-200 border border-slate-200" data-testid="map-feed-list">
          {feed.map((p) => (
            <FeedRow key={p.id} pin={p} highlight={highlight === p.id} onHover={() => setHighlight(p.id)} user={user} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function FeedRow({ pin, highlight, onHover, user }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const groupColor = CATEGORY_COLORS[pin.category_group]?.hex || "#475569";
  const distLabel = pin.is_remote
    ? "Remote"
    : pin.distance_miles != null
      ? `${pin.distance_miles.toFixed(1)} mi away`
      : pin.address || "—";

  // Provider can one-tap accept any in-app on-demand job. External W-2 /
  // remote listings (apply_url) keep their "Apply externally" link.
  const empType = pin.employment_type || "on_demand";
  const isProvider = user && user !== false && user.role === "provider";
  const canQuickAccept = isProvider && empType === "on_demand" && !pin.apply_url;

  const acceptAndTrack = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/jobs/${pin.id}/accept`);
      toast.success("Job accepted — opening live tracker");
      navigate(`/jobs/${pin.id}/track`);
    } catch (err) {
      toast.error(formatApiError(err));
      setBusy(false);
    }
  };

  return (
    <li
      onMouseEnter={onHover}
      className={`group transition-colors ${highlight ? "bg-teal-50/60" : "hover:bg-slate-50"}`}
      data-testid={`feed-row-${pin.id}`}
    >
      {/* W-2 and remote sourced listings link out to the external posting,
          everyone else clicks into the in-app job detail. */}
      {pin.apply_url ? (
        <a href={pin.apply_url} target="_blank" rel="noopener noreferrer" className="flex items-stretch gap-0">
          <FeedRowContent pin={pin} groupColor={groupColor} distLabel={distLabel} external />
        </a>
      ) : (
        <Link to={`/jobs/${pin.id}`} className="flex items-stretch gap-0">
          <FeedRowContent
            pin={pin}
            groupColor={groupColor}
            distLabel={distLabel}
            acceptCta={canQuickAccept ? { onClick: acceptAndTrack, busy } : null}
          />
        </Link>
      )}
    </li>
  );
}

function FeedRowContent({ pin, groupColor, distLabel, external, acceptCta }) {
  return (
    <>
      {/* Coloured side rail keyed by category group */}
      <div className="w-1 flex-shrink-0" style={{ background: groupColor }} aria-hidden="true" />

        <div className="flex-1 min-w-0 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Title + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border" style={{ color: groupColor, borderColor: groupColor }}>
                {pin.category}
              </span>
              {pin.employment_type && pin.employment_type !== "on_demand" && (
                <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-amber-700 text-amber-700">
                  {pin.employment_type.replace(/_/g, " ")}
                </span>
              )}
              {pin.is_remote && (
                <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-teal-700 text-teal-700 flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" /> Remote
                </span>
              )}
              {external && (
                <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-slate-400 text-slate-500 flex items-center gap-1">
                  <ExternalLink className="w-2.5 h-2.5" /> External apply
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

          {/* Provider one-tap accept (on-demand only) — Uber-style: accept
              and the next screen is the live tracker with chat + GPS. */}
          {acceptCta && (
            <button
              type="button"
              onClick={acceptCta.onClick}
              disabled={acceptCta.busy}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-teal-700 text-white font-mono uppercase tracking-wider text-[11px] hover:bg-teal-800 disabled:opacity-60 sm:self-center"
              data-testid={`feed-accept-${pin.id}`}
              data-no-i18n="true"
            >
              <Zap className="w-3.5 h-3.5" />
              {acceptCta.busy ? "Accepting…" : "Accept & track"}
            </button>
          )}
        </div>
    </>
  );
}
