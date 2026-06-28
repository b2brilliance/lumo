import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ReviewSummaryBadge } from "@/components/ReviewsSection";
import { Search, Store, UtensilsCrossed, KeyRound, Car, ShoppingBag, X } from "lucide-react";
import { useLocale } from "@/lib/locale";

const SECTIONS = [
  { key: "stores",       label: "Stores",          icon: Store,           color: "#2563eb" },
  { key: "restaurants",  label: "Restaurants",     icon: UtensilsCrossed, color: "#dc2626" },
  { key: "rentals",      label: "Rentals",         icon: KeyRound,        color: "#7c3aed" },
  { key: "autos",        label: "Auto Sales",      icon: Car,             color: "#059669" },
  { key: "marketplace",  label: "Community Market", icon: ShoppingBag,    color: "#d97706" },
];

export default function Directory({ role }) {
  // Default selected section when arriving via /stores or /restaurants
  const initialSection = role === "restaurant" ? "restaurants" : "stores";
  const [active, setActive] = useState(initialSection);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const { formatPrice } = useLocale();

  // Debounce the search input by 250ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch unified search results whenever the active section or query changes
  useEffect(() => {
    setLoading(true);
    const types = active === "all" ? SECTIONS.map((s) => s.key).join(",") : active;
    api.get(`/search/marketplaces?q=${encodeURIComponent(debouncedQ)}&types=${types}&limit=40`)
      .then(({ data }) => setResults(Array.isArray(data) ? data : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [active, debouncedQ]);

  const grouped = useMemo(() => {
    const byType = {};
    for (const r of results) {
      const k = r.type;
      if (!byType[k]) byType[k] = [];
      byType[k].push(r);
    }
    return byType;
  }, [results]);

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10" data-testid="marketplace-directory">
      <div className="overline">Marketplaces</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
        Find anything local.
      </h1>
      <p className="text-slate-600 mt-3 max-w-xl">
        One search across every marketplace on Lumo — stores, restaurants, rentals, cars for sale, and community listings from your neighbors.
      </p>

      {/* Search bar */}
      <div className="mt-8 relative max-w-2xl" data-testid="marketplace-search-wrap">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search stores, food, rentals, cars, marketplace…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-11 pr-10 py-3 border border-slate-300 bg-white font-mono text-sm focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
          data-testid="marketplace-search-input"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
            data-testid="marketplace-search-clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Section filter pills */}
      <div className="mt-5 flex items-center gap-2 flex-wrap" data-testid="marketplace-section-pills">
        <button
          type="button"
          onClick={() => setActive("all")}
          className={`inline-flex items-center gap-2 px-3.5 py-2 border font-mono text-sm transition-colors ${
            active === "all"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"
          }`}
          data-testid="section-pill-all"
        >
          <span className="font-bold uppercase tracking-wider text-[11px]">All</span>
        </button>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 border font-mono text-sm transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"
              }`}
              data-testid={`section-pill-${s.key}`}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: isActive ? "#fff" : s.color }} />
              <span className="font-bold uppercase tracking-wider text-[11px]">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div className="mt-6 text-xs font-mono text-slate-500" data-testid="results-count">
        {loading
          ? "Searching…"
          : `${results.length} ${results.length === 1 ? "result" : "results"}${debouncedQ ? ` for "${debouncedQ}"` : ""}`}
      </div>

      {!loading && results.length === 0 && (
        <div className="mt-6 border border-dashed border-slate-300 p-10 text-center text-slate-500 text-sm" data-testid="marketplace-empty">
          {debouncedQ
            ? `Nothing matches "${debouncedQ}" in this section. Try the "All" pill or a different keyword.`
            : "No listings in this section yet."}
        </div>
      )}

      {active === "all" ? (
        // Grouped by section when "All" is selected
        SECTIONS.map((s) => {
          const items = grouped[s.key] || [];
          if (items.length === 0) return null;
          const Icon = s.icon;
          return (
            <section key={s.key} className="mt-10" data-testid={`section-${s.key}`}>
              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-4 h-4" style={{ color: s.color }} />
                <h2 className="font-display text-xl font-black tracking-tighter">{s.label}</h2>
                <span className="text-xs font-mono text-slate-400">({items.length})</span>
              </div>
              <ResultGrid items={items} formatPrice={formatPrice} />
            </section>
          );
        })
      ) : (
        <div className="mt-6">
          <ResultGrid items={results} formatPrice={formatPrice} />
        </div>
      )}
    </div>
  );
}

function ResultGrid({ items, formatPrice }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200" data-testid="result-grid">
      {items.map((r) => (
        <Link
          key={`${r.type}-${r.id}`}
          to={r.link}
          className="group bg-white hover:bg-slate-50 transition-colors flex flex-col"
          data-testid={`result-${r.type}-${r.id}`}
        >
          <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
            {r.image_url && (
              <img src={r.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            )}
          </div>
          <div className="p-4 flex-1">
            <div className="overline text-[10px]">{r.subtitle}</div>
            <div className="font-display text-base font-bold mt-1 leading-tight">{r.title || "Untitled"}</div>
            {(r.type === "store" || r.type === "restaurant") && (
              <div className="mt-1.5"><ReviewSummaryBadge targetType="store" targetId={r.id} /></div>
            )}
            {r.price != null && (
              <div className="font-mono text-sm font-bold text-slate-900 mt-2">
                {formatPrice(r.price)}{r.price_unit ? ` / ${r.price_unit}` : ""}
              </div>
            )}
            {r.address && <div className="text-xs text-slate-500 mt-1.5 font-mono truncate">{r.address}</div>}
          </div>
        </Link>
      ))}
    </div>
  );
}
