import React, { useCallback, useMemo, useState } from "react";
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from "@react-google-maps/api";
import { CATEGORY_COLORS } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const LIBRARIES = ["places"];

// US-centered default
const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };

const containerStyle = { width: "100%" };

const lightStyle = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text", stylers: [{ saturation: -100 }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
];

function pinSvgUrl(hexColor, isHighlight) {
  // Drop pin SVG, encoded as data url
  const fill = hexColor;
  const stroke = "#ffffff";
  const scale = isHighlight ? 1.2 : 1.0;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${28 * scale}" height="${36 * scale}" viewBox="0 0 28 36">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <circle cx="14" cy="14" r="5" fill="${stroke}"/>
</svg>`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
  center = null,
  zoom = null,
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "lumo-google-maps",
    googleMapsApiKey: GOOGLE_KEY || "",
    libraries: LIBRARIES,
  });

  const [map, setMap] = useState(null);
  const [openPin, setOpenPin] = useState(null);

  const onLoad = useCallback((m) => setMap(m), []);
  const onUnmount = useCallback(() => setMap(null), []);

  // Re-center on the provided anchor whenever it changes (auto-GPS, saved
  // address, etc.). Only adjusts zoom on the very first center to avoid
  // fighting the user's manual pan/zoom.
  const centeredRef = React.useRef(false);
  React.useEffect(() => {
    if (!map || !center || center.lat == null) return;
    map.panTo({ lat: center.lat, lng: center.lng });
    if (!centeredRef.current) {
      map.setZoom(zoom || 11);
      centeredRef.current = true;
    }
  }, [map, center, zoom]);

  const validPins = useMemo(
    () => pins.filter((p) => typeof p.lat === "number" && typeof p.lng === "number"),
    [pins]
  );

  // Fly to highlight
  React.useEffect(() => {
    if (!map || !highlightId) return;
    const p = validPins.find((x) => x.id === highlightId);
    if (p) {
      map.panTo({ lat: p.lat, lng: p.lng });
      if (map.getZoom() < 9) map.setZoom(11);
      setOpenPin(p);
    }
  }, [highlightId, map, validPins]);

  return (
    <div className="border border-slate-200" data-testid="map-view">
      {controls && (
        <div className="flex flex-wrap items-center gap-4 p-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2" data-testid="map-remote-toggle">
            <Switch id="remote-filter" checked={!!remoteOnly} onCheckedChange={setRemoteOnly} className="data-[state=checked]:bg-teal-700" />
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
            {validPins.length} pins
          </div>
        </div>
      )}

      <div style={{ height }} className="relative bg-slate-100">
        {!GOOGLE_KEY && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Set REACT_APP_GOOGLE_MAPS_API_KEY in frontend/.env to enable the map.
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
            Google Maps failed to load. Check that your API key is restricted to this domain.
          </div>
        )}
        {isLoaded && GOOGLE_KEY && (
          <GoogleMap
            mapContainerStyle={{ ...containerStyle, height }}
            center={center && center.lat != null ? { lat: center.lat, lng: center.lng } : DEFAULT_CENTER}
            zoom={center && center.lat != null ? (zoom || 11) : 4}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
              styles: lightStyle,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              clickableIcons: false,
            }}
          >
            {validPins.map((p) => {
              const grp = p.is_remote ? "remote_jobs" : p.category_group;
              const color = CATEGORY_COLORS[grp]?.hex || "#475569";
              const isH = highlightId === p.id;
              return (
                <MarkerF
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  icon={{ url: pinSvgUrl(color, isH) }}
                  onClick={() => { setOpenPin(p); onPinClick && onPinClick(p); }}
                  zIndex={isH ? 999 : 1}
                />
              );
            })}
            {openPin && (
              <InfoWindowF
                position={{ lat: openPin.lat, lng: openPin.lng }}
                onCloseClick={() => setOpenPin(null)}
              >
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    {openPin.title}
                  </div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "#475569" }}>
                    ${Number(openPin.pay_rate).toFixed(2)} / {openPin.pay_unit}
                  </div>
                  {openPin.address && (
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>{openPin.address}</div>
                  )}
                  <a href={`/jobs/${openPin.id}`} style={{ color: "#0F766E", fontSize: 11, textDecoration: "underline", marginTop: 6, display: "inline-block" }}>
                    View job →
                  </a>
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
