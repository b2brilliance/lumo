import React, { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { RENTAL_CATEGORIES, RENTAL_PRICING_LABEL } from "@/lib/rentalCategories";
import { Input } from "@/components/ui/input";
import { MapPin, Star } from "lucide-react";

function PriceTag({ pricing }) {
  if (!pricing) return null;
  const entries = Object.entries(pricing).filter(([k, v]) => k !== "security_deposit" && typeof v === "number");
  if (entries.length === 0) return null;
  // Pick the smallest unit available to highlight
  const order = ["hourly", "daily", "weekend", "weekly", "monthly"];
  entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const [unit, value] = entries[0];
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-2xl font-bold">${value}</span>
      <span className="text-xs font-mono text-slate-500">{RENTAL_PRICING_LABEL[unit] || `/${unit}`}</span>
    </div>
  );
}

function RentalCard({ r }) {
  const cat = RENTAL_CATEGORIES[r.category] || {};
  const Icon = cat.icon;
  return (
    <Link to={`/rentals/${r.id}`} className="block border border-slate-200 hover:border-slate-900 transition-colors group" data-testid={`rental-card-${r.id}`}>
      <div className={`aspect-[4/3] flex items-center justify-center ${cat.color || "bg-slate-100"} relative`}>
        {Icon && <Icon className="w-12 h-12 opacity-40" />}
        <div className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-widest bg-white/90 px-2 py-1 border border-slate-200">
          {cat.label}
        </div>
        {r.booking_mode === "instant" && (
          <div className="absolute top-3 right-3 text-[10px] font-mono uppercase tracking-widest bg-slate-900 text-white px-2 py-1">
            ⚡ Instant book
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="font-display font-bold text-base truncate group-hover:underline">{r.title}</div>
        {r.location?.address && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
            <MapPin className="w-3 h-3" /><span className="truncate">{r.location.address}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <PriceTag pricing={r.pricing} />
          {r.attributes?.guests && (
            <span className="text-xs font-mono text-slate-500">·  sleeps {r.attributes.guests}</span>
          )}
          {r.attributes?.capacity && !r.attributes?.guests && (
            <span className="text-xs font-mono text-slate-500">cap. {r.attributes.capacity}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function Rentals() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  const q = params.get("q") || "";
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(q);

  useEffect(() => { setSearch(q); }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = new URLSearchParams();
    if (category) url.set("category", category);
    if (q) url.set("q", q);
    url.set("limit", "60");
    api.get(`/rentals?${url}`).then(({ data }) => {
      if (!cancelled) {
        setRentals(data || []);
        setLoading(false);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category, q]);

  const grouped = useMemo(() => {
    if (category) return null;
    const m = {};
    for (const r of rentals) {
      (m[r.category] = m[r.category] || []).push(r);
    }
    return m;
  }, [category, rentals]);

  const activeCat = category && RENTAL_CATEGORIES[category];

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="overline">Rentals</div>
      <div className="flex items-end justify-between gap-4 flex-wrap mt-2">
        <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter">
          {activeCat ? activeCat.label.toLowerCase() : "Rent anything, anywhere."}
        </h1>
        <form
          onSubmit={(e) => { e.preventDefault(); const p = new URLSearchParams(params); if (search) p.set("q", search); else p.delete("q"); setParams(p); }}
          className="flex-1 max-w-md"
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rentals — try “Tesla” or “tent” or “studio”"
            className="border-slate-300"
            data-testid="rentals-search-input"
          />
        </form>
      </div>
      {activeCat && (
        <p className="text-slate-600 mt-3 max-w-2xl">{activeCat.blurb}</p>
      )}

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mt-6">
        <Link
          to="/rentals"
          className={`text-xs font-mono uppercase tracking-wider px-3 py-1.5 border ${!category ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-700 hover:border-slate-900"}`}
          data-testid="rentals-cat-all"
        >
          All categories
        </Link>
        {Object.entries(RENTAL_CATEGORIES).map(([key, c]) => {
          const Icon = c.icon;
          const active = category === key;
          return (
            <Link
              key={key}
              to={`/rentals?category=${key}`}
              className={`flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-3 py-1.5 border ${active ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-700 hover:border-slate-900"}`}
              data-testid={`rentals-cat-${key}`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {c.label.split(",")[0].split("&")[0].trim()}
            </Link>
          );
        })}
      </div>

      {loading && <div className="mt-12 text-slate-500">Loading…</div>}

      {!loading && !category && grouped && (
        <div className="mt-10 space-y-12">
          {Object.entries(RENTAL_CATEGORIES).map(([key, cat]) => {
            const items = grouped[key] || [];
            if (items.length === 0) return null;
            const Icon = cat.icon;
            return (
              <section key={key}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 overline">
                      {Icon && <Icon className="w-3 h-3" />}{cat.label}
                    </div>
                    <h2 className="font-display text-2xl font-bold mt-1">{cat.label}</h2>
                  </div>
                  <Link to={`/rentals?category=${key}`} className="text-sm font-mono text-teal-700 hover:underline">See all →</Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                  {items.slice(0, 4).map((r) => <RentalCard key={r.id} r={r} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && category && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
          {rentals.length === 0 ? (
            <div className="col-span-full text-slate-500">No rentals match this filter yet.</div>
          ) : (
            rentals.map((r) => <RentalCard key={r.id} r={r} />)
          )}
        </div>
      )}
    </div>
  );
}
