import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Search, Star, ExternalLink, Info } from "lucide-react";
import { api } from "@/lib/api";

/* Shop — affiliate product feed.
 *
 * Lumo doesn't fulfill these items. Every card click bounces the user
 * to the retailer via /api/shop/click/:id which records the click and
 * returns the affiliate URL. We open that URL in a new tab. */

const RETAILER_ACCENT = {
  amazon:    "bg-[#FF9900] text-black",
  best_buy:  "bg-[#0046BE] text-white",
  wayfair:   "bg-[#7B189F] text-white",
  target:    "bg-[#CC0000] text-white",
  walmart:   "bg-[#0071DC] text-white",
};

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [retailer, setRetailer] = useState("");
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 120 };
      if (retailer) params.retailer = retailer;
      if (q.trim()) params.q = q.trim();
      const [prod, ret] = await Promise.all([
        api.get("/shop/products", { params }),
        api.get("/shop/retailers"),
      ]);
      setProducts(prod.data.items || []);
      setTotal(prod.data.total || 0);
      setRetailers(ret.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [retailer]);

  const onSearch = (e) => {
    e?.preventDefault?.();
    load();
  };

  const goToProduct = async (p) => {
    try {
      const { data } = await api.post(`/shop/click/${p.id}`);
      window.open(data.affiliate_url || p.affiliate_url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(p.affiliate_url, "_blank", "noopener,noreferrer");
    }
  };

  const filterActive = Boolean(retailer || q.trim());
  const featured = useMemo(
    () => (filterActive ? [] : products.filter((p) => p.is_featured).slice(0, 3)),
    [products, filterActive],
  );
  const rest = useMemo(
    () => (filterActive ? products : products.filter((p) => !p.is_featured)),
    [products, filterActive],
  );

  return (
    <div className="bg-white min-h-screen" data-testid="page-shop">
      <Helmet>
        <title>Shop — hand-picked partner deals · Lumo</title>
        <meta name="description" content="Shop curated products from Amazon, Best Buy, Wayfair, Target and Walmart. Lumo earns a small commission on qualifying purchases — no extra cost to you." />
      </Helmet>

      {/* Hero */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14 sm:py-20">
          <div className="overline mb-3">Partner shop</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-black leading-[1.05] tracking-tight max-w-4xl">
            Everyday gear from the retailers you already trust.
          </h1>
          <p className="mt-5 text-lg text-neutral-600 leading-relaxed max-w-2xl">
            Hand-picked products from Amazon, Best Buy, Wayfair, Target and Walmart. Tap any card to shop on the retailer's site. Lumo earns a small commission — no extra cost to you.
          </p>

          <form onSubmit={onSearch} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-2xl" data-testid="shop-search-form">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products…"
                className="w-full bg-neutral-50 border border-neutral-300 focus:border-black focus:bg-white focus:ring-2 focus:ring-black rounded-full pl-12 pr-4 h-14 text-base text-black placeholder:text-neutral-500 transition-all outline-none"
                data-testid="shop-search-input"
              />
            </div>
            <button type="submit" className="btn-lumo btn-lumo-primary btn-lumo-lg" data-testid="shop-search-submit">
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Retailer filter chips */}
      <section className="border-b border-neutral-200 bg-white sticky top-16 z-10" data-testid="shop-retailer-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-4 flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setRetailer("")}
            className={`btn-lumo btn-lumo-sm flex-shrink-0 ${retailer === "" ? "btn-lumo-primary" : "btn-lumo-secondary"}`}
            data-testid="shop-retailer-all"
          >
            All ({total || products.length})
          </button>
          {retailers.map((r) => (
            <button
              key={r.value}
              onClick={() => setRetailer(r.value)}
              className={`btn-lumo btn-lumo-sm flex-shrink-0 ${retailer === r.value ? "btn-lumo-primary" : "btn-lumo-secondary"}`}
              data-testid={`shop-retailer-${r.value}`}
            >
              {r.label} <span className="opacity-60 ml-0.5">({r.count})</span>
            </button>
          ))}
        </div>
      </section>

      {/* Featured strip */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-10 border-b border-neutral-200" data-testid="shop-featured">
          <div className="overline mb-6">Featured this week</div>
          <div className="grid md:grid-cols-3 gap-6">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} onClick={goToProduct} large />
            ))}
          </div>
        </section>
      )}

      {/* Products grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12" data-testid="shop-products">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="overline">{retailer ? retailers.find((r) => r.value === retailer)?.label : "All products"}</div>
            <div className="font-display font-semibold text-2xl text-black mt-1">{products.length} items</div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse bg-neutral-100 rounded-xl aspect-[3/4]" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-24 text-neutral-500" data-testid="shop-empty">
            No products match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6" data-testid="shop-grid">
            {rest.map((p) => (
              <ProductCard key={p.id} product={p} onClick={goToProduct} />
            ))}
          </div>
        )}
      </section>

      {/* Disclosure */}
      <section className="border-t border-neutral-200 bg-neutral-50" data-testid="shop-disclosure">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 lg:px-12 py-10">
          <div className="flex items-start gap-3 text-sm text-neutral-600 leading-relaxed">
            <Info className="w-5 h-5 flex-shrink-0 text-black mt-0.5" strokeWidth={2} />
            <div>
              <span className="font-medium text-black">Affiliate disclosure. </span>
              Lumo earns a small commission when you buy through these links — Amazon Associates, Best Buy Partner Network, Wayfair Affiliate, Target Partners and Walmart Creator. Prices and availability come from the retailer and can change at any time. Lumo does not stock, ship or return these items — refunds and support are handled by the retailer.
            </div>
          </div>
          <div className="mt-6 text-xs text-neutral-500">
            Not seeing what you need? <Link to="/services" className="underline hover:text-black">Book a Lumo pro instead →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductCard({ product, onClick, large = false }) {
  const accent = RETAILER_ACCENT[product.retailer] || "bg-neutral-900 text-white";
  return (
    <button
      onClick={() => onClick(product)}
      className="group text-left card-lumo card-lumo-hoverable flex flex-col p-0 overflow-hidden"
      data-testid={`shop-product-${product.id}`}
    >
      <div className={`relative w-full ${large ? "aspect-[4/3]" : "aspect-square"} bg-neutral-50 overflow-hidden`}>
        <img
          src={product.image_url}
          alt={product.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { e.currentTarget.src = "https://placehold.co/400x400/f5f5f5/999999?text=No+Image"; }}
        />
        <div className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold ${accent}`}>
          {product.retailer_label || product.retailer}
        </div>
        {product.is_featured && (
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold bg-black text-white">
            Featured
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="font-display font-semibold text-base text-black leading-snug line-clamp-2">{product.title}</div>
        {product.rating && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-neutral-500">
            <Star className="w-3.5 h-3.5 fill-current text-amber-500" strokeWidth={0} />
            <span className="font-mono">{product.rating.toFixed(1)}</span>
            {product.review_count && <span>· {formatK(product.review_count)}</span>}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="font-display font-bold text-lg text-black">{product.price_display || (product.price ? `$${product.price.toFixed(2)}` : "See price")}</div>
          <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-black transition-colors" strokeWidth={2} />
        </div>
      </div>
    </button>
  );
}

function formatK(n) {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}
