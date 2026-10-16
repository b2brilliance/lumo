import React from "react";
import { Link } from "react-router-dom";
import { Home, BedDouble, Bath, Maximize, MapPin, Heart, Users } from "lucide-react";
import { fmtPrice, KIND_LABEL, UNIT_LABEL } from "./reUtils";

export default function ReCard({ r, active, favorited, onFavorite, onHover, compact }) {
  const photo = (r.photos && r.photos[0]) || null;
  return (
    <div
      className={`relative border bg-white transition-colors group ${active ? "border-slate-900" : "border-slate-200 hover:border-slate-900"}`}
      onMouseEnter={() => onHover?.(r.id)}
      onMouseLeave={() => onHover?.(null)}
      data-testid={`re-card-${r.id}`}
    >
      <Link to={`/real-estate/${r.id}`} className="block">
        <div className={`${compact ? "aspect-[16/9]" : "aspect-[4/3]"} bg-slate-100 relative overflow-hidden`}>
          {photo ? (
            <img src={photo} alt={r.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Home className="w-10 h-10 opacity-30" /></div>
          )}
          <div className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-widest bg-white/95 px-2 py-1 border border-slate-200">
            {KIND_LABEL[r.listing_kind] || "Listing"}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-xl font-bold">{fmtPrice(r.price, r.currency)}</span>
            <span className="text-xs font-mono text-slate-500">{UNIT_LABEL[r.price_unit] || ""}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-600 mt-1">
            {r.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble className="w-3 h-3" />{r.bedrooms} bd</span>}
            {r.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath className="w-3 h-3" />{r.bathrooms} ba</span>}
            {r.sqft != null && <span className="inline-flex items-center gap-1"><Maximize className="w-3 h-3" />{Math.round(r.sqft).toLocaleString()} sqft</span>}
            {r.max_guests != null && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{r.max_guests}</span>}
          </div>
          <div className="font-medium text-sm truncate mt-2">{r.title}</div>
          {(r.address || r.city) && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{r.address || [r.city, r.country].filter(Boolean).join(", ")}</span>
            </div>
          )}
        </div>
      </Link>
      {onFavorite && (
        <button
          type="button"
          onClick={() => onFavorite(r.id)}
          className="absolute top-3 right-3 w-9 h-9 bg-white/95 border border-slate-200 flex items-center justify-center hover:scale-105 transition-transform"
          aria-label={favorited ? "Remove from saved homes" : "Save home"}
          data-testid={`re-fav-${r.id}`}
        >
          <Heart className={`w-4 h-4 ${favorited ? "fill-rose-600 text-rose-600" : "text-slate-700"}`} />
        </button>
      )}
    </div>
  );
}
