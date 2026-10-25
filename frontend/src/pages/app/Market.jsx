import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, Store } from "lucide-react";
import { api } from "@/lib/api";

const STORE_TYPE = { restaurant: "Restaurant", food_truck: "Food truck", storefront: "Store", personal_shop: "Personal shop" };

function StoreCard({ s }) {
  const sf = s.storefront || {};
  const img = (sf.photos || [])[0] || sf.logo_url;
  return (
    <Link to={`/app/store/${s.id}`} className="block rounded-3xl overflow-hidden border border-slate-200 active:scale-[0.99] transition-transform" data-testid={`market-store-${s.id}`}>
      <div className="h-32 bg-slate-100">{img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Store className="w-8 h-8 text-slate-300" /></div>}</div>
      <div className="p-3.5">
        <div className="font-semibold">{sf.name || s.name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{[STORE_TYPE[sf.store_type], sf.cuisine || sf.category, sf.offers_delivery === false ? "Pickup only" : "Pickup or delivery"].filter(Boolean).join(" · ")}</div>
      </div>
    </Link>
  );
}

function ItemRow({ it }) {
  return (
    <Link to={`/app/store/${it.owner_id}`} className="flex gap-3 p-2.5 rounded-2xl border border-slate-200 active:bg-slate-50" data-testid={`market-item-${it.id}`}>
      <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0">{it.media_url && <img src={it.media_url} alt="" className="w-full h-full object-cover" />}</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{it.name}</div>
        <div className="text-xs text-slate-500 truncate">{it.store_name}</div>
        <div className="text-sm line-clamp-1 text-slate-600">{it.description}</div>
        <div className="font-mono text-sm mt-0.5">${Number(it.price).toFixed(2)}</div>
      </div>
    </Link>
  );
}

export default function Market() {
  const { kind: kindParam } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const kind = kindParam === "products" ? "products" : "food";
  const q = sp.get("q") || "";
  const category = sp.get("category") || "";
  const [text, setText] = useState(q);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const get = (k) => api.get("/app/market", { params: { kind: k, q: q || undefined, category: category || undefined } }).then(({ data: d }) => d);
    const empty = { stores: [], items: [], categories: [] };
    if (!kindParam && q) {
      // Global search: food and products together.
      Promise.all([get("food"), get("products")])
        .then(([a, b]) => setData({ categories: [], stores: [...a.stores, ...b.stores], items: [...a.items, ...b.items] }))
        .catch(() => setData(empty));
    } else {
      get(kind).then(setData).catch(() => setData(empty));
    }
  }, [kind, kindParam, q, category]);

  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };
  const filtering = !!(q || category);

  return (
    <div className="px-4 pt-4 pb-6 max-w-xl mx-auto" data-testid={`market-${kind}`}>
      <div className="grid grid-cols-2 p-1 rounded-full bg-slate-100" data-testid="market-kind-switch">
        {[["food", "Food"], ["products", "Products"]].map(([k, l]) => (
          <button key={k} onClick={() => nav(`/app/market/${k}${q ? `?q=${encodeURIComponent(q)}` : ""}`)} className={`h-10 rounded-full text-sm font-semibold ${kind === k ? "bg-white shadow" : "text-slate-500"}`} data-testid={`market-kind-${k}`}>{l}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setParam("q", text.trim()); }} className="mt-3 relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "food" ? "Search dishes or restaurants" : "Search products or shops"} className="w-full h-12 pl-12 pr-4 rounded-2xl bg-slate-100 text-[15px] focus:outline-none focus:ring-2 focus:ring-slate-900" data-testid="market-search-input" />
      </form>
      <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar" data-testid="market-categories">
        <button onClick={() => setParam("category", "")} className={`shrink-0 h-9 px-4 rounded-full text-sm border ${!category ? "bg-slate-900 text-white border-slate-900" : "border-slate-200"}`} data-testid="market-cat-all">All</button>
        {(data?.categories || []).map((c) => (
          <button key={c} onClick={() => setParam("category", c)} className={`shrink-0 h-9 px-4 rounded-full text-sm border ${category === c ? "bg-slate-900 text-white border-slate-900" : "border-slate-200"}`} data-testid={`market-cat-${c}`}>{c}</button>
        ))}
      </div>
      {!data && <div className="py-16 text-center text-slate-400" data-testid="market-loading">Loading…</div>}
      {data && filtering && (
        <div className="mt-5 space-y-2.5" data-testid="market-items">
          {data.items.map((it) => <ItemRow key={it.id} it={it} />)}
        </div>
      )}
      {data && (
        <>
          <div className="mt-6 font-semibold">{!kindParam && q ? "Stores" : kind === "food" ? "Restaurants & food trucks" : "Stores & shops"}</div>
          <div className="mt-3 grid grid-cols-1 gap-3" data-testid="market-stores">
            {data.stores.map((s) => <StoreCard key={s.id} s={s} />)}
          </div>
          {data.stores.length === 0 && data.items.length === 0 && (
            <div className="mt-4 py-12 text-center border border-dashed border-slate-300 rounded-3xl text-slate-500" data-testid="market-empty">Nothing here yet. Check back soon.</div>
          )}
        </>
      )}
    </div>
  );
}
