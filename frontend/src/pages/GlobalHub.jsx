import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Globe2 } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { useGlobalMarkets, flagOf } from "@/lib/useGlobalMarkets";

export default function GlobalHub() {
  const data = useGlobalMarkets();
  const { country } = useLocale();
  const mine = data?.countries.find((c) => c.code === country);
  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10 pb-28" data-testid="global-hub">
      <Helmet>
        <title>Lumo worldwide — services, jobs, rentals, homes & marketplace in 50 countries</title>
        <meta name="description" content="Lumo works in Nigeria, Kenya, India, Brazil, Mexico, the UAE, the UK, the US and 40+ more countries." />
      </Helmet>
      <div className="flex items-center gap-3"><Globe2 className="w-8 h-8" /><h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter">Lumo worldwide</h1></div>
      {mine && (
        <Link to={`/in/${mine.slug}`} className="mt-6 inline-flex items-center gap-3 rounded-full bg-slate-900 text-white px-5 py-3 font-medium hover:scale-[1.02] transition-transform" data-testid="global-my-country">
          <span className="text-xl">{flagOf(mine.code)}</span>Lumo in {mine.name}
        </Link>
      )}
      {!data && <div className="mt-10 text-slate-500 font-mono text-sm">Loading…</div>}
      {data?.regions.map((r) => {
        const list = data.countries.filter((c) => c.region === r);
        if (!list.length) return null;
        return (
          <section key={r} className="mt-10" data-testid={`global-region-${r.toLowerCase().replace(/\s+/g, "-")}`}>
            <h2 className="font-display text-xl font-bold mb-3">{r}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {list.map((c) => (
                <Link key={c.code} to={`/in/${c.slug}`} className="rounded-2xl border border-slate-200 hover:border-slate-900 p-4 flex items-center gap-3 transition-colors" data-testid={`global-country-${c.code}`}>
                  <span className="text-2xl">{flagOf(c.code)}</span>
                  <div className="min-w-0">
                    <div className="font-display font-bold truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.cities.slice(0, 2).map((x) => x.name).join(" · ")}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
