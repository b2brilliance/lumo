import React from "react";
import { ExternalLink, Navigation, Map as MapIcon } from "lucide-react";

// Public map links + embedded OpenStreetMap view of the exact property location.
export default function ReLocation({ listing }) {
  const { lat, lng } = listing;
  const address = [listing.address, listing.city, listing.state, listing.country].filter(Boolean).join(", ");
  const hasCoords = lat != null && lng != null;
  const query = hasCoords ? `${lat},${lng}` : address;
  if (!query) return null;
  const d = 0.008;
  const embed = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d / 2},${lng + d},${lat + d / 2}&layer=mapnik&marker=${lat},${lng}`
    : null;
  const links = [
    { label: "OpenStreetMap", Icon: MapIcon, href: hasCoords ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`, testid: "re-link-osm" },
    { label: "Google Maps", Icon: ExternalLink, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, testid: "re-link-gmaps" },
    { label: "Directions", Icon: Navigation, href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`, testid: "re-link-directions" },
  ];
  return (
    <div className="mt-10" data-testid="re-location">
      <h2 className="font-display text-xl font-bold mb-3">Location</h2>
      {embed && (
        <iframe title="Property location" src={embed} className="w-full h-72 border border-slate-200" loading="lazy" data-testid="re-location-map" />
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {links.map(({ label, Icon, href, testid }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 border border-slate-200 hover:border-slate-900 px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors"
             data-testid={testid}>
            <Icon className="w-3.5 h-3.5" />{label}
          </a>
        ))}
      </div>
    </div>
  );
}
