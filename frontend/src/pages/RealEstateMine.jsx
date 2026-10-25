import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReModeSwitch from "@/components/app/ReModeSwitch";

export default function RealEstateMine() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get(`/real-estate?owner_id=${user.id}&limit=100`).then(({ data }) => setItems(data.items || data || [])).catch(() => setItems([]));
  }, [user.id]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5" data-testid="re-mine-page">
      <ReModeSwitch />
      <div className="flex items-center justify-between mt-5">
        <h1 className="font-display text-2xl font-black tracking-tight">My listings</h1>
        <Link to="/real-estate/list" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-slate-900 text-white text-sm font-semibold active:scale-95 transition-transform" data-testid="re-mine-new">
          <Plus className="w-4 h-4" /> New listing
        </Link>
      </div>
      {items === null && <div className="py-16 text-center text-slate-400" data-testid="re-mine-loading">Loading…</div>}
      {items?.length === 0 && (
        <div className="mt-10 text-center py-14 border border-dashed border-slate-300 rounded-3xl" data-testid="re-mine-empty">
          <Building2 className="w-8 h-8 mx-auto text-slate-400" />
          <div className="font-semibold mt-3">No listings yet</div>
          <p className="text-sm text-slate-500 mt-1">List a home to sell or rent out. It's free.</p>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {items?.map((it) => (
          <Link key={it.id} to={`/real-estate/${it.id}`} className="flex gap-3 p-3 rounded-2xl border border-slate-200 active:bg-slate-50" data-testid={`re-mine-item-${it.id}`}>
            <div className="w-24 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0">
              {it.photos?.[0] && <img src={it.photos[0]} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{it.title}</div>
              <div className="text-sm text-slate-500 truncate">{[it.city, it.state].filter(Boolean).join(", ")}</div>
              <div className="text-sm font-mono mt-1">{it.price ? `$${Number(it.price).toLocaleString()}` : ""} {it.listing_kind ? `· ${it.listing_kind}` : ""}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
