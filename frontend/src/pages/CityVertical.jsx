import React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowUpRight } from "lucide-react";
import { useGlobalMarkets, flagOf, VERTICAL_LINKS, VERTICAL_TITLE } from "@/lib/useGlobalMarkets";

export default function CityVertical() {
  const { country: slug, city: citySlug, vertical } = useParams();
  const data = useGlobalMarkets();
  if (!data) return <div className="p-12 text-slate-500 font-mono text-sm">Loading…</div>;
  const c = data.countries.find((x) => x.slug === slug);
  const city = c?.cities.find((x) => x.slug === citySlug);
  if (!c || !city || !VERTICAL_TITLE[vertical]) return <Navigate to={c ? `/in/${c.slug}` : "/global"} replace />;
  const title = VERTICAL_TITLE[vertical](city.name);
  const others = data.verticals.filter((v) => v.key !== vertical);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10 pb-28" data-testid="city-vertical">
      <Helmet>
        <title>{`${title}, ${c.name} · Lumo`}</title>
        <meta name="description" content={`${title}, ${c.name}. Free to browse on Lumo.`} />
        <link rel="canonical" href={`https://golumo.app/in/${c.slug}/${city.slug}/${vertical}`} />
      </Helmet>
      <Link to={`/in/${c.slug}/${city.slug}`} className="text-xs font-mono text-slate-500 hover:underline">← {city.name}, {c.name}</Link>
      <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter mt-2">
        <span className="mr-3">{flagOf(c.code)}</span>{title}
      </h1>
      <div className="flex flex-wrap gap-3 mt-8" data-testid="city-vertical-ctas">
        {VERTICAL_LINKS[vertical](city.name).map((l, i) => (
          <Link key={l.label} to={l.to} className={`inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium transition-transform hover:scale-[1.03] ${i === 0 ? "bg-slate-900 text-white" : "border border-slate-900"}`} data-testid={`city-vertical-cta-${i}`}>
            {l.label}<ArrowUpRight className="w-4 h-4" />
          </Link>
        ))}
      </div>
      <section className="mt-12">
        <h2 className="font-display text-lg font-bold mb-3">More in {city.name}</h2>
        <div className="flex flex-wrap gap-2">
          {others.map((v) => (
            <Link key={v.key} to={`/in/${c.slug}/${city.slug}/${v.key}`} className="rounded-full border border-slate-200 hover:border-slate-900 px-4 py-2 text-sm transition-colors" data-testid={`city-vertical-other-${v.key}`}>
              {VERTICAL_TITLE[v.key](city.name)}
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold mb-3">Other cities</h2>
        <div className="flex flex-wrap gap-2">
          {c.cities.filter((x) => x.slug !== city.slug).map((x) => (
            <Link key={x.slug} to={`/in/${c.slug}/${x.slug}/${vertical}`} className="rounded-full border border-slate-200 hover:border-slate-900 px-4 py-2 text-sm transition-colors">
              {VERTICAL_TITLE[vertical](x.name)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
