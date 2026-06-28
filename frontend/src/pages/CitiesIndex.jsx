import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { MapPin, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";

/* Cities index — top-level SEO hub that links to every per-city page on the
 * site. The richer the internal-link graph here, the faster Google indexes
 * the long-tail landing pages (`/work/<cat>/<city>`, etc.).            */
export default function CitiesIndex() {
  const [cities, setCities] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/landing/cities");
        if (alive) setCities(data?.cities || []);
      } catch {
        if (alive) setCities([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Group cities by region for a scannable layout.
  const groups = {
    "North America": ["US", "CA", "MX"],
    "Europe":        ["GB", "IE", "FR", "DE", "ES", "IT", "NL", "SE", "PL", "PT"],
    "Asia":          ["JP", "KR", "CN", "HK", "SG", "TH", "PH", "ID", "MY", "IN"],
    "Middle East & Africa": ["AE", "QA", "SA", "EG", "NG", "KE", "ZA", "MA"],
    "Latin America": ["BR", "AR", "CL", "PE", "CO"],
    "Oceania":       ["AU", "NZ"],
  };

  return (
    <div className="bg-white" data-testid="cities-index">
      <Helmet>
        <title>Lumo in every major city — find work, hire help, sell, rent</title>
        <meta name="description" content="Lumo operates in 70+ cities across the globe. Browse every city we serve to find local providers, post a job, list a rental, or earn on demand near you." />
        <link rel="canonical" href="https://golumo.app/cities" />
        <meta property="og:title" content="Lumo cities — find local providers in 70+ metros" />
        <meta property="og:description" content="Same-day delivery, on-demand services, marketplace listings — pick your city." />
        <meta property="og:url" content="https://golumo.app/cities" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://golumo.app/" },
            { "@type": "ListItem", "position": 2, "name": "Cities", "item": "https://golumo.app/cities" },
          ],
        })}</script>
      </Helmet>

      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <div className="overline">Locations</div>
          <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mt-3">
            Lumo, city by city.
          </h1>
          <p className="text-lg text-slate-600 mt-6 max-w-2xl leading-relaxed">
            Find work, hire help, sell, or list rentals in any of the {cities.length || "70+"} cities Lumo serves worldwide.
          </p>
        </div>
      </section>

      <section className="max-w-screen-2xl mx-auto px-6 py-12 space-y-12">
        {Object.entries(groups).map(([region, codes]) => {
          const list = cities.filter((c) => codes.includes(c.country));
          if (list.length === 0) return null;
          return (
            <div key={region} data-testid={`cities-region-${region.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
              <h2 className="font-display text-2xl font-black tracking-tight mb-4">{region}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-slate-200 border border-slate-200">
                {list.map((c) => (
                  <Link
                    key={c.slug}
                    to={`/cities/${c.slug}`}
                    className="bg-white p-4 hover:bg-slate-50 transition-colors group"
                    data-testid={`cities-link-${c.slug}`}
                  >
                    <MapPin className="w-4 h-4 text-teal-700" />
                    <div className="font-display font-bold mt-2">{c.name}</div>
                    <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mt-1 inline-flex items-center gap-1">
                      {c.country} <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
