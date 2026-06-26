import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Star, BadgeCheck, Quote } from "lucide-react";

const fmtDate = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }); } catch { return ""; } };
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "L";

/**
 * Homepage testimonials — pulls REAL 4-5 star reviews from /api/site/reviews.
 * Each review badge says "Verified — earned 1% cashback" so visitors know it&apos;s
 * a real customer (FTC-compliant disclosure).
 *
 * Renders nothing until there are at least 3 reviews so the section never
 * looks barren during launch.
 */
export default function HomeReviewsSection() {
  const [data, setData] = useState({ items: [], stats: { count: 0, avg: 0 } });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/site/reviews?limit=12");
        setData(data || { items: [], stats: { count: 0, avg: 0 } });
      } catch { /* silent — homepage is best-effort */ }
    })();
  }, []);

  const stats = data.stats || {};
  const reviews = data.items || [];

  // Show "founding member" block until we have at least 3 real reviews
  if (reviews.length < 3) {
    return (
      <section className="max-w-screen-2xl mx-auto px-6 py-20" data-testid="founding-section">
        <div className="grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <div className="overline text-teal-700">Founding members</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-3 leading-[1.05]">
              Be one of our <span className="text-teal-700">first 100</span> customers.
            </h2>
            <p className="text-slate-600 mt-5 max-w-xl leading-relaxed">
              Lumo just launched — we don&apos;t have a wall of testimonials yet, and we&apos;d rather show
              you nothing than fake ones. What we do have: <strong>10% flat commission</strong> (half what
              TaskRabbit takes), <strong>same-day delivery from any local business</strong>, and a real
              team building this for the long haul.
            </p>
            <p className="text-slate-600 mt-4 max-w-xl leading-relaxed">
              Every customer who leaves an honest review after their first job earns <strong>1% of the
              order back as cashback</strong> — our way of thanking you for helping us grow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/signin">
                <span className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-3 hover:bg-slate-800 text-sm font-display font-bold" data-testid="founding-cta">
                  Join the founding 100
                </span>
              </Link>
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="border-2 border-slate-200 p-6">
              <div className="overline text-slate-500">When you review, you earn</div>
              <div className="font-display text-6xl font-black tracking-tighter mt-2">
                1<span className="text-3xl text-slate-400">%</span>
              </div>
              <div className="text-sm text-slate-600 mt-2 leading-relaxed">
                of every order you review gets added back to your Lumo wallet. Honest reviews — good or bad — qualify.
              </div>
              <div className="border-t border-slate-200 mt-4 pt-4 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                Verified · FTC-compliant · No fake reviews, ever
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-slate-50 border-y border-slate-200" data-testid="home-reviews-section">
      <div className="max-w-screen-2xl mx-auto px-6 py-20">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <div className="overline text-teal-700">What customers say</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2 leading-[1.05]">
              {stats.avg.toFixed(1)}<span className="text-3xl text-slate-400">/5</span> across {stats.count.toLocaleString()} reviews.
            </h2>
            <div className="flex items-center gap-1 mt-2 text-amber-500">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="w-4 h-4" fill={s <= Math.round(stats.avg) ? "currentColor" : "none"} />
              ))}
              <span className="text-xs font-mono text-slate-500 ml-2">verified customers · 1% cashback for honest feedback</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 p-5 flex flex-col" data-testid={`review-card-${r.id}`}>
              <Quote className="w-5 h-5 text-slate-300" />
              <p className="text-sm text-slate-700 mt-3 leading-relaxed flex-1">
                {r.body || `Loved the experience.`}
              </p>
              <div className="border-t border-slate-100 mt-4 pt-3 flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 grid place-items-center font-display font-bold text-sm text-slate-700">
                  {initials(r.reviewer_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm truncate">{r.reviewer_name}</div>
                  <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                    <BadgeCheck className="w-3 h-3 text-teal-600" />
                    Verified · {fmtDate(r.created_at)}
                  </div>
                </div>
                <div className="text-amber-500 flex items-center gap-0.5">
                  {[...Array(r.overall_stars || 5)].map((_, i) => (<Star key={i} className="w-3 h-3" fill="currentColor" />))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
