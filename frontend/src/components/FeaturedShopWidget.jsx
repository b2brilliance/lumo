import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, ExternalLink, ArrowRight, Store } from "lucide-react";
import { api } from "@/lib/api";

/* FeaturedShopWidget — 3 featured products on the customer home so
 * people discover the /shop from the main flow. Silently hides itself
 * if there are no featured products or the endpoint fails. */

const RETAILER_ACCENT = {
  amazon:    "bg-[#FF9900] text-black",
  best_buy:  "bg-[#0046BE] text-white",
  wayfair:   "bg-[#7B189F] text-white",
  target:    "bg-[#CC0000] text-white",
  walmart:   "bg-[#0071DC] text-white",
};

export default function FeaturedShopWidget() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/shop/products", { params: { featured: true, limit: 3 } });
        if (!cancelled) setItems(data.items || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  const goToProduct = async (p) => {
    try {
      const { data } = await api.post(`/shop/click/${p.id}`);
      window.open(data.affiliate_url || p.affiliate_url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(p.affiliate_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section className="border-t border-neutral-200 bg-white" data-testid="landing-featured-shop">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className="overline mb-3 flex items-center gap-2">
              <Store className="w-3 h-3" /> From the Lumo Shop
            </div>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-black leading-tight tracking-tight">
              Handpicked partner deals.
            </h2>
          </div>
          <Link to="/shop" className="btn-lumo btn-lumo-outline btn-lumo-sm" data-testid="landing-featured-shop-all">
            Browse all products <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {items.map((p) => {
            const accent = RETAILER_ACCENT[p.retailer] || "bg-neutral-900 text-white";
            return (
              <button
                key={p.id}
                onClick={() => goToProduct(p)}
                className="group text-left card-lumo card-lumo-hoverable flex flex-col p-0 overflow-hidden"
                data-testid={`landing-featured-shop-item-${p.id}`}
              >
                <div className="relative w-full aspect-[4/3] bg-neutral-50 overflow-hidden">
                  <img
                    src={p.image_url}
                    alt={p.title}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { e.currentTarget.src = "https://placehold.co/400x400/f5f5f5/999999?text=No+Image"; }}
                  />
                  <div className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold ${accent}`}>
                    {p.retailer_label || p.retailer}
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="font-display font-semibold text-base text-black leading-snug line-clamp-2">{p.title}</div>
                  {p.rating && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-neutral-500">
                      <Star className="w-3.5 h-3.5 fill-current text-amber-500" strokeWidth={0} />
                      <span className="font-mono">{p.rating.toFixed(1)}</span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-display font-bold text-lg text-black">
                      {p.price_display || (p.price ? `$${p.price.toFixed(2)}` : "See price")}
                    </div>
                    <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-black transition-colors" strokeWidth={2} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-neutral-500 max-w-xl">
          Lumo does not fulfill or ship these items — tapping any card takes you to the retailer. We earn a small commission on qualifying purchases.
        </p>
      </div>
    </section>
  );
}
