import React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Sparkles, Briefcase, CalendarDays, Building2, ShoppingBag, MapPin } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useGlobalMarkets, flagOf, VERTICAL_TITLE } from "@/lib/useGlobalMarkets";

const V_ICON = { services: Sparkles, jobs: Briefcase, rentals: CalendarDays, homes: Building2, marketplace: ShoppingBag };

export default function CountryHub() {
  const { country: slug, city: citySlug } = useParams();
  const data = useGlobalMarkets();
  const { country: current, setCountryOverride } = useLocale();
  if (!data) return <div className="p-12 text-slate-500 font-mono text-sm">Loading…</div>;
  const c = data.countries.find((x) => x.slug === slug);
  if (!c) return <Navigate to="/global" replace />;
  const city = citySlug ? c.cities.find((x) => x.slug === citySlug) : null;
  if (citySlug && !city) return <Navigate to={`/in/${c.slug}`} replace />;
  const place = city ? city.name : c.name;

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10 pb-28" data-testid="country-hub">
      <Helmet>
        <title>{`Lumo ${city ? `${city.name}, ${c.name}` : c.name} — services, jobs, rentals, homes & marketplace`}</title>
        <meta name="description" content={`Hire local help, find work, rent, buy and sell, and search homes in ${place}.`} />
        <link rel="canonical" href={`https://golumo.app/in/${c.slug}${city ? `/${city.slug}` : ""}`} />
      </Helmet>
      <Link to={city ? `/in/${c.slug}` : "/global"} className="text-xs font-mono text-slate-500 hover:underline">← {city ? c.name : "All countries"}</Link>
      <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter mt-2 flex items-center gap-3">
        <span>{flagOf(c.code)}</span>Lumo {place}
      </h1>
      {current !== c.code && setCountryOverride && (
        <button onClick={() => { setCountryOverride(c.code); toast.success(`Lumo set to ${c.name}`); }} className="mt-4 rounded-full border border-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-900 hover:text-white transition-colors" data-testid="country-set-default">
          Use {c.name} prices & language
        </button>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-8" data-testid="country-verticals">
        {data.verticals.map((v) => {
          const Icon = V_ICON[v.key];
          const target = `/in/${c.slug}/${(city || c.cities[0]).slug}/${v.key}`;
          return (
            <Link key={v.key} to={target} className="rounded-2xl bg-slate-900 text-white p-5 hover:scale-[1.02] transition-transform" data-testid={`country-vertical-${v.key}`}>
              <Icon className="w-5 h-5 text-teal-300" />
              <div className="font-display font-bold mt-3">{VERTICAL_TITLE[v.key](place)}</div>
            </Link>
          );
        })}
      </div>

      {!city && (
        <section className="mt-10" data-testid="country-cities">
          <h2 className="font-display text-xl font-bold mb-3">Cities</h2>
          <div className="flex flex-wrap gap-2">
            {c.cities.map((ct) => (
              <Link key={ct.slug} to={`/in/${c.slug}/${ct.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 hover:border-slate-900 px-4 py-2 text-sm transition-colors" data-testid={`country-city-${ct.slug}`}>
                <MapPin className="w-3.5 h-3.5" />{ct.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
