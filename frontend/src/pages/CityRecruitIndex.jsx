import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Globe2, Search, Users, MapPin, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { flagOf } from "@/lib/useGlobalMarkets";
import AdSense from "@/components/AdSense";

export const CONTINENT_SLUGS = {
  africa: "AF", asia: "AS", europe: "EU", "north-america": "NA", "south-america": "SA", oceania: "OC",
};
const SLUG_OF = Object.fromEntries(Object.entries(CONTINENT_SLUGS).map(([k, v]) => [v, k]));

const CitySearch = () => {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return undefined; }
    const t = setTimeout(() => {
      api.get(`/recruit/cities?q=${encodeURIComponent(q)}&limit=24`).then((r) => setHits(r.data.items || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative max-w-xl" data-testid="join-search-wrap">
      <Search className="w-4 h-4 absolute left-3 top-3.5 text-neutral-400" />
      <input
        data-testid="join-index-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search any city or country…"
        className="w-full h-11 pl-10 pr-3 border border-neutral-300 focus:border-black focus:outline-none text-sm"
      />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-neutral-200 shadow-xl max-h-80 overflow-auto" data-testid="join-search-results">
          {hits.map((c) => (
            <Link key={c.slug} to={`/join/${c.slug}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50 text-sm" data-testid={`join-search-hit-${c.slug}`}>
              <span>{flagOf(c.country)} {c.city}</span>
              <span className="text-xs text-neutral-500">{c.country === "US" ? c.state : c.country_name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const CountryTile = ({ c }) => (
  <Link to={`/join/country/${c.code.toLowerCase()}`} className="group border border-neutral-200 hover:border-black p-4 transition-colors" data-testid={`join-country-${c.code}`}>
    <div className="font-display font-bold flex items-center gap-2"><span className="text-lg">{flagOf(c.code)}</span>{c.name}</div>
    <div className="text-xs font-mono text-neutral-500 mt-1">{c.cities} cities · {c.signups} signed up</div>
  </Link>
);

export default function CityRecruitIndex() {
  const { continent } = useParams();
  const [world, setWorld] = useState(null);
  useEffect(() => { api.get("/recruit/world").then((r) => setWorld(r.data)).catch(() => setWorld({ continents: [] })); }, []);
  const active = continent ? CONTINENT_SLUGS[continent] : null;
  const shown = (world?.continents || []).filter((c) => c.code !== "AN" && (!active || c.code === active));
  const title = active ? shown[0]?.name : "the world";

  return (
    <div className="min-h-screen bg-white text-black" data-testid="join-index">
      <Helmet>
        <title>{`Work with Lumo in ${title || "the world"} — every city hiring now`}</title>
        <meta name="description" content="Lumo is hiring couriers, drivers and local pros in 1,700+ cities across every country. Keep 90% of every job, same-day pay, loyalty bonus." />
        <link rel="canonical" href={`https://golumo.app/join${continent ? `/continent/${continent}` : ""}`} />
      </Helmet>
      <section className="bg-black text-white" data-testid="join-index-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-white/60 mb-4 flex items-center gap-2"><Globe2 className="w-4 h-4" /> Hiring worldwide</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95]">
            Earn with Lumo in {active ? title : "every city on Earth"}.
          </h1>
          <p className="mt-6 text-white/70 max-w-2xl">Same-day pay, 90% take-home, no lead fees. The first 100 sign-ups in every city earn a loyalty bonus after their 100th job.</p>
          {world && (
            <div className="mt-8 flex flex-wrap gap-6 text-sm font-mono text-white/60" data-testid="join-index-stats">
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /><b className="text-white">{world.total_cities?.toLocaleString()}</b> cities</span>
              <span className="flex items-center gap-2"><Globe2 className="w-4 h-4" /><b className="text-white">{world.total_countries}</b> countries</span>
              <span className="flex items-center gap-2"><Users className="w-4 h-4" /><b className="text-white">{(world.total_signups || 0).toLocaleString()}</b> signed up</span>
            </div>
          )}
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-8 space-y-6">
        <CitySearch />
        <div className="flex flex-wrap gap-2" data-testid="join-continent-tabs">
          <Link to="/join" className={`px-4 py-2 rounded-full border text-sm ${!active ? "bg-black text-white border-black" : "border-neutral-300 hover:border-black"}`} data-testid="join-continent-all">All</Link>
          {Object.entries(CONTINENT_SLUGS).map(([slug, code]) => (
            <Link key={slug} to={`/join/continent/${slug}`} className={`px-4 py-2 rounded-full border text-sm capitalize ${active === code ? "bg-black text-white border-black" : "border-neutral-300 hover:border-black"}`} data-testid={`join-continent-${slug}`}>
              {slug.replace("-", " ")}
            </Link>
          ))}
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pb-20" data-testid="join-index-grid">
        {!world && <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {shown.map((ct) => (
          <div key={ct.code} className="mb-12" data-testid={`join-continent-section-${ct.code}`}>
            <div className="flex items-baseline justify-between border-b border-neutral-200 pb-2 mb-4">
              <Link to={`/join/continent/${SLUG_OF[ct.code]}`} className="font-display text-2xl font-black hover:underline">{ct.name}</Link>
              <span className="text-xs font-mono text-neutral-500">{ct.countries.length} countries · {ct.cities} cities</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ct.countries.map((c) => <CountryTile key={c.code} c={c} />)}
            </div>
          </div>
        ))}
        <AdSense testid="adsense-join-index" />
      </section>
    </div>
  );
}
