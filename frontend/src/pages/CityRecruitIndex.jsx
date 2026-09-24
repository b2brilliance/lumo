import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin, ArrowRight, Search, Users, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import AdSense from "@/components/AdSense";

/*
 * /join — nationwide recruit-city directory.
 *
 * Every top-100 US metro has its own /join/:slug landing page (seeded
 * server-side in `recruit_cities_us_seed.py`). This index page lists
 * them all so:
 *   1. Drivers can browse and find their city
 *   2. Google can crawl every city URL for SEO
 *   3. Admin can spot inactive cities and re-activate them
 */

export default function CityRecruitIndex() {
  const [cities, setCities] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/recruit/cities");
        setCities(data?.items || []);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  // Group by state so 122 rows feel navigable
  const grouped = useMemo(() => {
    const filtered = q
      ? cities.filter((c) =>
          `${c.city} ${c.state} ${c.state_full || ""}`.toLowerCase().includes(q.toLowerCase())
        )
      : cities;
    const map = new Map();
    for (const c of filtered) {
      const key = c.state_full || c.state;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    // Sort state → city
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, list]) => [state, list.sort((a, b) => a.city.localeCompare(b.city))]);
  }, [cities, q]);

  const totalSignups = useMemo(
    () => cities.reduce((sum, c) => sum + (c.signups_total || 0), 0),
    [cities]
  );

  return (
    <div className="min-h-screen bg-white text-black">
      <Helmet>
        <title>Drive with Lumo — Every US city hiring now | Lumo</title>
        <meta
          name="description"
          content="Lumo is hiring 300 drivers, movers, cleaners and pros in every major US city. Pick your metro, pocket $100 after your first 100 jobs, keep 90% of every dollar."
        />
        <link rel="canonical" href="https://golumo.app/join" />
      </Helmet>

      {/* Hero */}
      <section className="border-b border-neutral-200 bg-black text-white" data-testid="join-index-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-white/60 mb-4">
            Hiring nationwide · Every major US metro
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95]">
            Drive with Lumo <br className="hidden sm:block" /> in every US city.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-white/70 max-w-2xl leading-relaxed">
            Same-day pay, 90% take-home, no lead fees. First 100 sign-ups in
            every city earn a <span className="font-bold text-white">$100 bonus</span>{" "}
            after their 100th completed job.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm font-mono text-white/60">
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />{" "}
              <b className="text-white">{cities.length}</b>&nbsp;cities live
            </span>
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />{" "}
              <b className="text-white">{totalSignups.toLocaleString()}</b>&nbsp;drivers signed up
            </span>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-8">
        <div className="relative max-w-lg">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            data-testid="join-index-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your city or state…"
            className="w-full h-11 pl-10 pr-3 border border-neutral-300 focus:border-black focus:outline-none text-sm font-mono placeholder:text-neutral-400"
          />
        </div>
      </section>

      {/* AdSense (only appears once admin sets publisher ID) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <AdSense testid="adsense-join-index" />
      </div>

      {/* City grid, grouped by state */}
      <section
        className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pb-16"
        data-testid="join-index-grid"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading cities…
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-sm text-neutral-500">No cities match "{q}".</div>
        ) : (
          grouped.map(([state, list]) => (
            <div key={state} className="mb-12" data-testid={`join-state-${state.replace(/\s+/g, "-").toLowerCase()}`}>
              <div className="flex items-baseline justify-between border-b border-neutral-200 pb-2 mb-4">
                <h2 className="font-display text-2xl font-black tracking-tight">{state}</h2>
                <span className="text-xs font-mono text-neutral-500">{list.length} cit{list.length === 1 ? "y" : "ies"}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {list.map((c) => (
                  <Link
                    key={c.slug}
                    to={`/join/${c.slug}`}
                    data-testid={`join-city-${c.slug}`}
                    className="group border border-neutral-200 hover:border-black transition-colors p-4 flex flex-col justify-between min-h-[100px]"
                  >
                    <div>
                      <div className="font-display text-base font-bold">{c.city}</div>
                      <div className="text-xs font-mono text-neutral-500 mt-0.5">
                        {c.signups_total || 0} / {c.goal_workers || 300} signed up
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                        {c.state}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
