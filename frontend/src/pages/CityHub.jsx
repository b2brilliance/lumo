import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, MapPin, Briefcase, Sparkles, Store, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import AffiliateBlock from "@/components/AffiliateBlock";

/* Per-city hub — one indexable page per city that fans out to every
 * find-help / work / sell / rent-out landing page for that city. This is
 * the bridge that turns the cities index into hundreds of long-tail
 * landing-page entry points.                                            */
export default function CityHub() {
  const { slug } = useParams();
  const [city, setCity] = useState(null);
  const [types, setTypes] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data: c }, { data: t }] = await Promise.all([
          api.get("/landing/cities"),
          api.get("/landing/types"),
        ]);
        if (!alive) return;
        const found = (c?.cities || []).find((x) => x.slug === slug) || null;
        setCity(found);
        setTypes(t?.types || {});
      } catch {
        if (alive) { setCity(null); setTypes({}); }
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const sections = useMemo(() => {
    const meta = {
      "find-help": { Icon: Sparkles, blurb: "Vetted pros nearby, on-demand.", color: "text-teal-700" },
      "work":      { Icon: Briefcase, blurb: "Flexible gigs — keep 90% per job.", color: "text-amber-600" },
      "sell":      { Icon: Store,    blurb: "Sell with same-day delivery built in.", color: "text-blue-600" },
      "rent-out":  { Icon: KeyRound, blurb: "Earn from what you already own.", color: "text-red-600" },
    };
    return Object.entries(types).map(([key, t]) => ({
      key,
      label: t.label,
      categories: t.categories || {},
      ...meta[key],
    }));
  }, [types]);

  if (city === null && Object.keys(types).length > 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="font-display text-3xl font-bold">City not found</h1>
        <p className="text-slate-600 mt-2">
          We don&apos;t have a hub for &ldquo;{slug}&rdquo; yet. Browse all <Link to="/cities" className="text-teal-700 underline">Lumo cities</Link>.
        </p>
      </div>
    );
  }

  const cityName = city?.name || slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const cityCountry = city?.country || "";
  const canonical = `https://golumo.app/cities/${slug}`;

  return (
    <div className="bg-white" data-testid="city-hub">
      <Helmet>
        <title>{`${cityName} — Find help, earn, sell & rent on Lumo`}</title>
        <meta name="description" content={`Lumo in ${cityName}: hire local providers, post a job, list rentals or sell with built-in same-day delivery. Same-day pay for workers, 10% flat fee for hosts.`} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={`Lumo ${cityName} — local services, jobs & rentals`} />
        <meta property="og:description" content={`Same-day delivery, on-demand services, marketplace listings in ${cityName}.`} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://golumo.app/" },
            { "@type": "ListItem", "position": 2, "name": "Cities", "item": "https://golumo.app/cities" },
            { "@type": "ListItem", "position": 3, "name": cityName, "item": canonical },
          ],
        })}</script>
        {city && (
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Place",
            "name": cityName,
            "geo": { "@type": "GeoCoordinates", "latitude": city.lat, "longitude": city.lng },
            "address": { "@type": "PostalAddress", "addressLocality": cityName, "addressCountry": cityCountry },
          })}</script>
        )}
      </Helmet>

      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <Link to="/cities" className="text-sm font-mono uppercase tracking-wider text-slate-500 hover:text-teal-700">
            ← All cities
          </Link>
          <div className="overline mt-4 inline-flex items-center gap-2"><MapPin className="w-3 h-3" /> {cityCountry}</div>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mt-3">
            Lumo in {cityName}.
          </h1>
          <p className="text-lg text-slate-600 mt-6 max-w-2xl leading-relaxed">
            Hire help, earn money, sell with same-day delivery, or rent out what you own — all in one place, right here in {cityName}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/map" className="inline-flex items-center gap-2 bg-teal-700 text-white px-5 py-2.5 font-mono uppercase tracking-wider text-xs hover:bg-teal-800" data-testid="city-hub-map-cta">
              See jobs near {cityName} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link to="/become-a-provider" className="inline-flex items-center gap-2 border border-slate-300 px-5 py-2.5 font-mono uppercase tracking-wider text-xs hover:bg-slate-50" data-testid="city-hub-earn-cta">
              Earn in {cityName}
            </Link>
          </div>
        </div>
      </section>

      {sections.map((s) => (
        <section key={s.key} className="border-b border-slate-200">
          <div className="max-w-screen-2xl mx-auto px-6 py-12">
            <div className="flex items-center gap-2">
              <s.Icon className={`w-5 h-5 ${s.color}`} />
              <div className="overline">{s.label}</div>
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-2">
              {s.label} — {cityName}
            </h2>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">{s.blurb}</p>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-slate-200 border border-slate-200">
              {Object.entries(s.categories).map(([cat, label]) => (
                <Link
                  key={cat}
                  to={`/${s.key}/${cat}/${slug}`}
                  className="bg-white p-3 hover:bg-slate-50 transition-colors group"
                  data-testid={`city-hub-${s.key}-${cat}`}
                >
                  <div className="text-sm font-display font-bold capitalize">{label}</div>
                  <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-1">
                    in {cityName}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}
      <AffiliateBlock category="city" citySlug={slug} title={`Travel & local picks — ${cityName}`} subtitle="Hotels, tours, transport — vetted partners for your trip." />
      <AffiliateBlock category="rentals" citySlug={slug} variant="compact" />
    </div>
  );
}
