import React, { useEffect, useState } from "react";
import { ExternalLink, Info, Tag } from "lucide-react";
import { api, API } from "@/lib/api";
import { useLocale } from "@/lib/locale";

/* AffiliateBlock — drops a row of partner offers into any page.
 *
 *   <AffiliateBlock category="autos" />
 *
 * Pulls offers from /api/affiliates/offers, filtered by category + visitor
 * country, and renders FTC-compliant cards. Clicks bounce through
 * /api/affiliates/click/<slug> so we can log + inject tracking IDs server-
 * side.                                                                  */
export default function AffiliateBlock({
  category,
  citySlug = "",
  title,
  subtitle,
  limit = 8,
  variant = "grid", // "grid" or "compact"
}) {
  const { country } = useLocale() || {};
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get("/affiliates/offers", {
          params: { category, country: country || "" },
        });
        if (alive) setOffers((data?.offers || []).slice(0, limit));
      } catch {
        if (alive) setOffers([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [category, country, limit]);

  if (loading) {
    return (
      <div className="border-y border-slate-200 bg-slate-50/50 py-8" data-testid={`affiliate-block-${category}-loading`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400">Loading partner offers…</div>
        </div>
      </div>
    );
  }

  if (offers.length === 0) return null;

  const headline = title || "Partner offers";
  const blurb = subtitle || "These partners pay Lumo when you sign up — no extra cost to you.";
  const clickHref = (slug) =>
    `${API}/affiliates/click/${slug}${citySlug ? `?city_slug=${encodeURIComponent(citySlug)}` : ""}`;

  if (variant === "compact") {
    return (
      <div className="border-y border-slate-200 bg-amber-50/40 py-4" data-testid={`affiliate-block-${category}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-amber-800 mb-2">
            <Tag className="w-3 h-3" /> Sponsored — Lumo earns when you sign up
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {offers.map((o) => (
              <a
                key={o.slug}
                href={clickHref(o.slug)}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="flex-shrink-0 min-w-[220px] bg-white border border-slate-200 px-3 py-2 hover:border-teal-700 transition-colors group"
                data-testid={`affiliate-link-${o.slug}`}
              >
                <div className="flex items-center gap-2">
                  {o.logo && <img src={o.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" />}
                  <div className="font-display font-bold text-sm truncate">{o.name}</div>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{o.blurb}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="border-y border-slate-200 bg-slate-50/60 py-10" data-testid={`affiliate-block-${category}`}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-amber-800 mb-1">
          <Tag className="w-3 h-3" /> Sponsored partners
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-black tracking-tighter">{headline}</h2>
        <p className="text-sm text-slate-600 mt-1 inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" /> {blurb}
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
          {offers.map((o) => (
            <a
              key={o.slug}
              href={clickHref(o.slug)}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="bg-white p-4 hover:bg-slate-50 transition-colors flex flex-col h-full group"
              data-testid={`affiliate-link-${o.slug}`}
            >
              <div className="flex items-start gap-3">
                {o.logo && (
                  <img
                    src={o.logo}
                    alt=""
                    className="w-10 h-10 object-contain bg-white border border-slate-100 p-1 flex-shrink-0"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-sm leading-tight">{o.name}</div>
                  {o.payout && (
                    <div className="text-[10px] font-mono uppercase tracking-wider text-teal-700 mt-0.5">
                      {o.payout}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed flex-1">{o.blurb}</p>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-slate-500 group-hover:text-teal-700">
                Open offer <ExternalLink className="w-3 h-3" />
              </div>
              {o.needs_setup && (
                <div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-amber-700">
                  Admin: add tracking ID
                </div>
              )}
            </a>
          ))}
        </div>
        <div className="text-[10px] text-slate-400 mt-3 font-mono uppercase tracking-wider">
          Disclosure: Lumo may earn a commission when you sign up or purchase through these links. FTC-compliant.
        </div>
      </div>
    </section>
  );
}
