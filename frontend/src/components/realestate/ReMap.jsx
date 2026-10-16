import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtPrice } from "./reUtils";

function pinIcon(r, active) {
  const lift = r._dup ? `position:relative;top:-${30 * r._dup}px;` : "";
  return L.divIcon({
    className: "",
    html: `<div style="${lift}"><div class="re-pin${active ? " re-pin-active" : ""}">${fmtPrice(r.price, r.currency, true)}</div></div>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}

// Fires onBounds only for user-driven moves; programmatic fits are ignored.
function BoundsWatcher({ onBounds, programmatic }) {
  useMapEvents({
    moveend(e) {
      if (programmatic.current) { programmatic.current = false; return; }
      const b = e.target.getBounds();
      onBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    },
  });
  return null;
}

function Fitter({ fitTo, programmatic, resizeKey }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (!fitTo) return;
    programmatic.current = true;
    if (fitTo.bbox) {
      map.fitBounds([[fitTo.bbox.south, fitTo.bbox.west], [fitTo.bbox.north, fitTo.bbox.east]], { padding: [20, 20] });
    } else if (fitTo.points?.length) {
      map.fitBounds(L.latLngBounds(fitTo.points).pad(0.15), { maxZoom: 13 });
    } else {
      programmatic.current = false;
    }
  }, [fitTo, map, programmatic, resizeKey]);
  return null;
}

export default function ReMap({ items, activeId, onHover, onSelect, onBounds, fitTo, resizeKey }) {
  const programmatic = useRef(false);
  // Stack pins that share exact coordinates vertically (pixel offset) so each stays clickable.
  const pins = useMemo(() => {
    const seen = {};
    return items.filter((r) => r.lat != null && r.lng != null).map((r) => {
      const k = `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`;
      seen[k] = (seen[k] || 0) + 1;
      return { ...r, _dup: seen[k] - 1 };
    });
  }, [items]);
  return (
    <div className="relative w-full h-full" data-testid="re-map">
      <MapContainer center={[25, 0]} zoom={2} minZoom={2} worldCopyJump className="w-full h-full z-0" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsWatcher onBounds={onBounds} programmatic={programmatic} />
        <Fitter fitTo={fitTo} programmatic={programmatic} resizeKey={resizeKey} />
        {pins.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat, r.lng]}
            icon={pinIcon(r, r.id === activeId)}
            zIndexOffset={r.id === activeId ? 1000 : 0}
            eventHandlers={{
              click: () => onSelect?.(r),
              mouseover: () => onHover?.(r.id),
              mouseout: () => onHover?.(null),
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
