import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, ShoppingCart } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function StorePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [store, setStore] = useState(null);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);

  const loadCart = () => user && api.get("/cart").then(({ data }) => {
    const g = (data.groups || []).find((x) => x.store_id === id);
    setCount(g ? g.item_count : 0);
  }).catch(() => {});

  useEffect(() => {
    api.get(`/storefronts/${id}`).then(({ data }) => setStore(data)).catch(() => setStore(false));
    api.get("/inventory", { params: { owner_id: id } }).then(({ data }) => setItems(data || [])).catch(() => {});
  }, [id]);
  useEffect(() => { loadCart(); }, [id, user]); // eslint-disable-line

  const add = async (it) => {
    if (!user) return nav(`/signin?next=${encodeURIComponent(`/app/store/${id}`)}`);
    try {
      await api.post("/cart/add", { inventory_item_id: it.id, quantity: 1 });
      toast.success(`${it.name} added`);
      loadCart();
    } catch { toast.error("Couldn't add that item"); }
  };

  if (store === false) return <div className="p-10 text-center text-slate-500" data-testid="store-not-found">Store not found.</div>;
  if (!store) return <div className="p-10 text-center text-slate-400" data-testid="store-loading">Loading…</div>;
  const sf = store.storefront || {};
  const photos = sf.photos?.length ? sf.photos : sf.logo_url ? [sf.logo_url] : [];
  const groups = items.reduce((acc, it) => { (acc[it.category || "Other"] ||= []).push(it); return acc; }, {});

  return (
    <div className="pb-28 max-w-xl mx-auto" data-testid="store-page">
      {photos.length > 0 && (
        <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar h-52 bg-slate-100" data-testid="store-photos">
          {photos.map((u) => <img key={u} src={u} alt="" className="w-full h-52 object-cover shrink-0 snap-center" />)}
        </div>
      )}
      <div className="px-4 pt-4">
        <h1 className="font-display text-2xl font-black tracking-tight" data-testid="store-name">{sf.name || store.name}</h1>
        <div className="text-sm text-slate-500 mt-1">{[sf.cuisine || sf.category, sf.hours, sf.address].filter(Boolean).join(" · ")}</div>
        <div className="mt-2 flex gap-2 text-xs">
          {sf.offers_pickup !== false && <span className="px-2.5 py-1 rounded-full bg-slate-100">Pickup</span>}
          {sf.offers_delivery !== false && <span className="px-2.5 py-1 rounded-full bg-slate-100">Delivery</span>}
        </div>
        {sf.description && <p className="text-sm text-slate-600 mt-3">{sf.description}</p>}
      </div>
      <div className="px-4 mt-5 space-y-6">
        {Object.entries(groups).map(([cat, list]) => (
          <section key={cat} data-testid={`store-section-${cat}`}>
            <div className="font-semibold mb-2">{cat}</div>
            <div className="space-y-2.5">
              {list.map((it) => (
                <div key={it.id} className="flex gap-3 p-2.5 rounded-2xl border border-slate-200" data-testid={`store-item-${it.id}`}>
                  <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0">{it.media_url && <img src={it.media_url} alt="" className="w-full h-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-sm text-slate-600 line-clamp-2">{it.description}</div>
                    <div className="font-mono text-sm mt-0.5">${Number(it.price).toFixed(2)}</div>
                  </div>
                  <button onClick={() => add(it)} className="self-center w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center active:scale-90 transition-transform" aria-label={`Add ${it.name}`} data-testid={`store-add-${it.id}`}>
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
        {items.length === 0 && <div className="py-10 text-center text-slate-500" data-testid="store-empty">No items listed yet.</div>}
      </div>
      {count > 0 && (
        <Link to={`/app/checkout/${id}`} className="fixed left-4 right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[1095] h-14 rounded-full bg-slate-900 text-white flex items-center justify-center gap-2 font-semibold shadow-xl max-w-xl mx-auto" data-testid="store-view-cart">
          <ShoppingCart className="w-5 h-5" /> View cart ({count})
        </Link>
      )}
    </div>
  );
}
