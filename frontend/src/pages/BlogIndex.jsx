import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Calendar, Tag, ArrowUpRight, Loader2 } from "lucide-react";
import AdSense from "@/components/AdSense";

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); } catch { return iso; } };

export default function BlogIndex() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/blog?limit=30");
        setData(data);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="min-h-[60vh] grid place-items-center text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-white" data-testid="blog-index-page">
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <div className="overline text-teal-700">The Lumo blog</div>
          <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mt-3 leading-[1.05]">
            Stories from the local hustle.
          </h1>
          <p className="text-slate-600 mt-4 max-w-2xl">
            New posts twice a day · marketplace lessons, founder updates, city spotlights, and how-tos.
          </p>
        </div>
      </section>

      <section className="max-w-screen-2xl mx-auto px-6 py-12">
        <AdSense testid="adsense-blog-top" />
        {data.items.length === 0 ? (
          <div className="text-center py-24 text-slate-400 border border-slate-200">
            <div className="font-display text-2xl font-bold text-slate-700">First post coming soon.</div>
            <p className="text-sm mt-2">Our auto-pilot publishes the first blog within the next 12 hours.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200" data-testid="blog-grid">
            {data.items.map((p) => (
              <Link
                key={p.id}
                to={`/blog/${p.slug}`}
                className="group bg-white p-6 flex flex-col hover:bg-slate-50"
                data-testid={`blog-card-${p.slug}`}
              >
                {p.hero_image_url && (
                  <div className="aspect-[16/9] bg-slate-100 overflow-hidden mb-4">
                    <img src={p.hero_image_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                )}
                <div className="overline text-teal-700">{p.topic_label || "Article"}</div>
                <h2 className="font-display font-bold text-xl mt-2 tracking-tight leading-tight line-clamp-3">{p.title}</h2>
                {p.excerpt && <p className="text-sm text-slate-600 mt-2 leading-relaxed line-clamp-3">{p.excerpt}</p>}
                <div className="mt-auto pt-4 flex items-center gap-3 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(p.published_at)}</span>
                  {(p.tags || [])[0] && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{p.tags[0]}</span>}
                  <ArrowUpRight className="w-3 h-3 ml-auto group-hover:text-teal-700" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
