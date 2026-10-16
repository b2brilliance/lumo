import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingDown, TrendingUp, Tag, Heart, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const fmt = (n, cur = "USD") => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format(n || 0); }
  catch { return `${cur} ${Math.round(n || 0)}`; }
};

export function hasPriceDrop(item) {
  return item?.previous_price != null && item.price < item.previous_price;
}

export function PriceDropBadge({ item, className = "" }) {
  if (!hasPriceDrop(item)) return null;
  const pct = item.price_drop_pct ?? Math.round(((item.previous_price - item.price) / item.previous_price) * 100);
  return (
    <span className={`inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-mono uppercase tracking-widest px-2 py-1 ${className}`} data-testid={`price-drop-${item.id}`}>
      <TrendingDown className="w-3 h-3" />Price cut {pct}%
    </span>
  );
}

export function WasPrice({ item }) {
  if (!hasPriceDrop(item)) return null;
  return <span className="text-xs font-mono text-slate-400 line-through ml-2" data-testid={`was-price-${item.id}`}>{fmt(item.previous_price, item.currency)}</span>;
}

export function PriceHistory({ item }) {
  const hist = item?.price_history || [];
  if (hist.length < 2) return null;
  const rows = [...hist].reverse();
  return (
    <div className="mt-10" data-testid="price-history">
      <h2 className="font-display text-xl font-bold mb-3">Price history</h2>
      <div className="border border-slate-200 divide-y divide-slate-100">
        {rows.map((h, i) => {
          const prev = rows[i + 1];
          const diff = prev ? h.price - prev.price : 0;
          const Icon = h.event === "drop" ? TrendingDown : h.event === "increase" ? TrendingUp : Tag;
          return (
            <div key={`${h.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid={`price-history-row-${i}`}>
              <Icon className={`w-4 h-4 ${h.event === "drop" ? "text-emerald-600" : h.event === "increase" ? "text-rose-600" : "text-slate-400"}`} />
              <span className="font-mono text-xs text-slate-500 w-24">{new Date(h.at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
              <span className="flex-1">{h.event === "listed" ? "Listed" : h.event === "drop" ? "Price cut" : "Price increase"}</span>
              <span className="font-display font-bold">{fmt(h.price, item.currency)}</span>
              {prev && <span className={`font-mono text-xs w-20 text-right ${diff < 0 ? "text-emerald-700" : "text-rose-700"}`}>{diff < 0 ? "−" : "+"}{fmt(Math.abs(diff), item.currency)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OwnerPriceEditor({ item, endpoint, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.price ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = parseFloat(val);
    if (!(n > 0)) { toast.error("Enter a valid price"); return; }
    setBusy(true);
    try {
      const { data } = await api.patch(endpoint, { price: n });
      toast.success(n < item.price ? "Price cut — people who saved this get an alert" : "Price updated");
      setEditing(false);
      onSaved?.(data);
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-widest border border-slate-200 px-2 py-1 hover:border-slate-900" data-testid={`edit-price-${item.id}`}>
        <Pencil className="w-3 h-3" />Edit price
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" data-testid={`edit-price-form-${item.id}`}>
      <input type="number" value={val} onChange={(e) => setVal(e.target.value)} className="w-28 h-8 border border-slate-900 px-2 text-sm" data-testid={`edit-price-input-${item.id}`} />
      <button type="button" onClick={save} disabled={busy} className="h-8 w-8 bg-slate-900 text-white flex items-center justify-center" data-testid={`edit-price-save-${item.id}`}><Check className="w-4 h-4" /></button>
      <button type="button" onClick={() => setEditing(false)} className="h-8 w-8 border border-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
    </span>
  );
}

export function useWatch(kind) {
  const { user } = useAuth();
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    if (!user) { setIds(new Set()); return; }
    api.get(`/watch/${kind}/ids`).then(({ data }) => setIds(new Set(data.ids))).catch(() => {});
  }, [user, kind]);
  const toggle = useCallback(async (id) => {
    const { data } = await api.post(`/watch/${kind}/${id}`);
    setIds((prev) => { const n = new Set(prev); if (data.watching) n.add(id); else n.delete(id); return n; });
    return data.watching;
  }, [kind]);
  return { ids, toggle, signedIn: !!user };
}

export function WatchButton({ watch, id, className = "" }) {
  const nav = useNavigate();
  const on = watch.ids.has(id);
  const click = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!watch.signedIn) { nav("/signin"); return; }
    try {
      const w = await watch.toggle(id);
      toast.success(w ? "Saved — we'll alert you if the price drops" : "Removed from saved");
    } catch (err) { toast.error(formatApiError(err)); }
  };
  return (
    <button type="button" onClick={click} aria-label={on ? "Unsave" : "Save"} className={`w-9 h-9 bg-white/95 border border-slate-200 flex items-center justify-center hover:scale-105 transition-transform ${className}`} data-testid={`watch-${id}`}>
      <Heart className={`w-4 h-4 ${on ? "fill-rose-600 text-rose-600" : "text-slate-700"}`} />
    </button>
  );
}
