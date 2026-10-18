import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { flagOf } from "@/lib/useGlobalMarkets";

export default function JoinCountry() {
  const { cc } = useParams();
  const [cities, setCities] = useState(null);
  useEffect(() => {
    setCities(null);
    api.get(`/recruit/cities?country=${cc}&limit=500`).then((r) => setCities(r.data.items || [])).catch(() => setCities([]));
  }, [cc]);
  const name = cities?.[0]?.country_name || cc.toUpperCase();
  const isUS = cc.toLowerCase() === "us";
  if (cities && cities.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center" data-testid="join-country-not-found">
        <h1 className="font-display text-2xl font-bold">We're not hiring there yet.</h1>
        <Link to="/join" className="btn-lumo btn-lumo-primary btn-lumo-sm mt-6" data-testid="join-country-browse">Browse all countries</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" data-testid="join-country-page">
      <Helmet>
        <title>{`Work with Lumo in ${name} — cities hiring now`}</title>
        <meta name="description" content={`Lumo is hiring couriers, drivers and local pros across ${name}. Pick your city and apply in 10 minutes.`} />
        <link rel="canonical" href={`https://golumo.app/join/country/${cc.toLowerCase()}`} />
      </Helmet>
      <section className="bg-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14 sm:py-20">
          <Link to="/join" className="text-xs font-mono text-white/60 hover:text-white" data-testid="join-country-back">← All countries</Link>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mt-4 flex items-center gap-4">
            <span>{flagOf(cc.toUpperCase())}</span> Earn with Lumo in {name}
          </h1>
          {cities && <p className="mt-4 text-white/70 font-mono text-sm">{cities.length} cities hiring</p>}
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10" data-testid="join-country-cities">
        {!cities && <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {cities && cities.length === 0 && <div className="text-neutral-500" data-testid="join-country-empty">No cities yet. <Link to="/join" className="underline">Browse all countries</Link>.</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(cities || []).map((c) => (
            <Link key={c.slug} to={`/join/${c.slug}`} className="group border border-neutral-200 hover:border-black p-4 min-h-[96px] flex flex-col justify-between transition-colors" data-testid={`join-city-${c.slug}`}>
              <div>
                <div className="font-display font-bold">{c.city}</div>
                {c.local_name && c.local_name !== c.city && <div className="text-xs text-neutral-500" data-no-i18n="true">{c.local_name}</div>}
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-neutral-500 mt-2">
                <span>{isUS ? c.state : `${c.signups_total} / ${c.goal_workers || 300}`}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
