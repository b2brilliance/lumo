import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AffiliateBlock from "@/components/AffiliateBlock";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Home, BedDouble, Bath, Maximize, MapPin } from "lucide-react";

const PROPERTY_TYPES = [
  { v: "", l: "All types" },
  { v: "house", l: "House" },
  { v: "condo", l: "Condo" },
  { v: "townhouse", l: "Townhouse" },
  { v: "multi_family", l: "Multi-family" },
  { v: "apartment", l: "Apartment" },
  { v: "land", l: "Land" },
  { v: "commercial", l: "Commercial" },
];

function PriceTag({ price, kind }) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-2xl font-bold">{fmt.format(price)}</span>
      {kind === "rent" && <span className="text-xs font-mono text-slate-500">/mo</span>}
    </div>
  );
}

function ListingCard({ r }) {
  const photo = (r.photos && r.photos[0]) || null;
  return (
    <Link to={`/real-estate/${r.id}`} className="block border border-slate-200 hover:border-slate-900 transition-colors group" data-testid={`re-card-${r.id}`}>
      <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
        {photo ? (
          <img src={photo} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Home className="w-10 h-10 opacity-30" /></div>
        )}
        <div className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-widest bg-white/90 px-2 py-1 border border-slate-200">
          {r.listing_kind === "rent" ? "For rent" : "For sale"}
        </div>
      </div>
      <div className="p-4">
        <div className="font-display font-bold text-base truncate group-hover:underline">{r.title}</div>
        {r.address && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
            <MapPin className="w-3 h-3" /><span className="truncate">{r.address}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <PriceTag price={r.price} kind={r.listing_kind} />
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            {r.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble className="w-3 h-3" />{r.bedrooms}</span>}
            {r.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath className="w-3 h-3" />{r.bathrooms}</span>}
            {r.sqft != null && <span className="inline-flex items-center gap-1"><Maximize className="w-3 h-3" />{Math.round(r.sqft)}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function RealEstate() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const f = {
    q: params.get("q") || "",
    listing_kind: params.get("listing_kind") || "",
    property_type: params.get("property_type") || "",
    city: params.get("city") || "",
    min_price: params.get("min_price") || "",
    max_price: params.get("max_price") || "",
    min_beds: params.get("min_beds") || "",
    min_baths: params.get("min_baths") || "",
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) url.set(k, v); });
    url.set("limit", "60");
    api.get(`/real-estate?${url}`).then(({ data }) => {
      if (!cancelled) { setItems(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [params]);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8" data-testid="real-estate-page">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Lumo · Marketplace</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight">Real Estate</h1>
          <p className="text-slate-600 mt-1 text-sm max-w-xl">Homes for sale and for rent — direct from sellers and landlords. Message owners privately through Lumo.</p>
        </div>
        <Link to="/real-estate/list">
          <Button className="bg-slate-900 hover:bg-slate-800" data-testid="re-list-btn">List a property</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-6 text-xs">
        <Input data-testid="re-filter-q" placeholder="Search title, city…" defaultValue={f.q} onBlur={(e) => set("q", e.target.value)} />
        <Select value={f.listing_kind || "any"} onValueChange={(v) => set("listing_kind", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="re-filter-kind"><SelectValue placeholder="Sale / Rent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Sale + Rent</SelectItem>
            <SelectItem value="sale">For sale</SelectItem>
            <SelectItem value="rent">For rent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={f.property_type || "any"} onValueChange={(v) => set("property_type", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="re-filter-type"><SelectValue placeholder="Property type" /></SelectTrigger>
          <SelectContent>
            {PROPERTY_TYPES.map((p) => <SelectItem key={p.v || "any"} value={p.v || "any"}>{p.l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input data-testid="re-filter-city" placeholder="City" defaultValue={f.city} onBlur={(e) => set("city", e.target.value)} />
        <Input data-testid="re-filter-min-price" placeholder="Min $" type="number" defaultValue={f.min_price} onBlur={(e) => set("min_price", e.target.value)} />
        <Input data-testid="re-filter-max-price" placeholder="Max $" type="number" defaultValue={f.max_price} onBlur={(e) => set("max_price", e.target.value)} />
        <div className="flex gap-2">
          <Input data-testid="re-filter-min-beds" placeholder="Beds+" type="number" defaultValue={f.min_beds} onBlur={(e) => set("min_beds", e.target.value)} />
          <Input data-testid="re-filter-min-baths" placeholder="Baths+" type="number" defaultValue={f.min_baths} onBlur={(e) => set("min_baths", e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-500 font-mono text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-24 text-center text-slate-500 font-mono text-sm">No listings match those filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="re-grid">
          {items.map((r) => <ListingCard key={r.id} r={r} />)}
        </div>
      )}
      <div className="mt-12 -mx-4 sm:-mx-6">
        <AffiliateBlock category="real-estate" title="Mortgage & home services partners" subtitle="Get pre-approved, find a top agent, lock in home insurance." />
      </div>
    </div>
  );
}
