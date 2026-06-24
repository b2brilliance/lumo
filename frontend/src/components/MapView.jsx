import React, { useEffect, useRef, useState } from "react";
import { api, CATEGORY_COLORS } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Simple SVG mini-map. Bounds cover continental US.
const BOUNDS = { minLat: 24.5, maxLat: 49.5, minLng: -125.0, maxLng: -66.5 };

function project(lat, lng, w, h) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * w;
  const y = h - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * h;
  return { x, y };
}

export default function MapView({
  pins = [],
  highlightId = null,
  height = 480,
  onPinClick = null,
  controls = true,
  remoteOnly,
  setRemoteOnly,
  groupFilter,
  setGroupFilter,
}) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: height });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [height]);

  return (
    <div className="border border-slate-200" data-testid="map-view">
      {controls && (
        <div className="flex flex-wrap items-center gap-4 p-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2" data-testid="map-remote-toggle">
            <Switch
              id="remote-filter"
              checked={!!remoteOnly}
              onCheckedChange={setRemoteOnly}
              className="data-[state=checked]:bg-teal-700"
            />
            <Label htmlFor="remote-filter" className="text-sm">Remote-friendly only</Label>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {Object.entries(CATEGORY_COLORS).map(([k, c]) => (
              <button
                key={k}
                onClick={() => setGroupFilter && setGroupFilter(groupFilter === k ? null : k)}
                className={`flex items-center gap-1.5 px-2 py-1 border ${groupFilter === k ? "border-slate-900" : "border-slate-200"}`}
                data-testid={`map-filter-${k}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: c.hex }} />
                <span className="font-mono uppercase tracking-wider">{c.label}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-slate-500 font-mono" data-testid="map-pin-count">
            {pins.length} pins
          </div>
        </div>
      )}
      <div ref={wrapRef} className="relative bg-slate-100" style={{ height }}>
        <svg width="100%" height={height} className="block" style={{ background: "linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%)" }}>
          {/* US-ish outline (very rough) */}
          <rect x="0" y="0" width="100%" height={height} fill="none" />
          {[...Array(10)].map((_, i) => (
            <line key={`h${i}`} x1="0" y1={(height / 10) * i} x2="100%" y2={(height / 10) * i} stroke="#CBD5E1" strokeWidth="0.5" />
          ))}
          {[...Array(20)].map((_, i) => (
            <line key={`v${i}`} x1={(size.w / 20) * i} y1="0" x2={(size.w / 20) * i} y2={height} stroke="#CBD5E1" strokeWidth="0.5" />
          ))}
          {pins.map((p) => {
            const lat = p.lat ?? 39.8;
            const lng = p.lng ?? -98.5;
            const { x, y } = project(lat, lng, size.w, height);
            const grp = p.is_remote ? "remote_jobs" : p.category_group;
            const color = CATEGORY_COLORS[grp]?.hex || "#475569";
            const isH = highlightId === p.id;
            return (
              <g
                key={p.id}
                transform={`translate(${x}, ${y})`}
                style={{ cursor: "pointer" }}
                onClick={() => onPinClick && onPinClick(p)}
                data-testid={`map-pin-${p.id}`}
              >
                {isH && <circle r="14" fill={color} fillOpacity="0.25" />}
                <circle r="6" fill={color} stroke="#fff" strokeWidth="2" />
                {isH && (
                  <text x="10" y="-6" fontSize="11" fill="#0F172A" fontFamily="IBM Plex Mono">
                    {p.title}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 font-mono uppercase tracking-widest">
          USA · Schematic view
        </div>
      </div>
    </div>
  );
}
