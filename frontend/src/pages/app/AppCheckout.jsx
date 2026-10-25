import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Minus, Plus, Store, Bike } from "lucide-react";
import { api } from "@/lib/api";
import AddressInput from "@/components/AddressInput";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function Row({ label, value, testid, bold }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold text-base pt-2 border-t border-slate-200" : ""}`} data-testid={testid}>
      <span>{label}</span><span className="font-mono">{value}</span>
    </div>
  );
}

export default function AppCheckout() {
  const { storeId } = useParams();
  const [mode, setMode] = useState("pickup");
  const [addr, setAddr] = useState({ address: "", lat: null, lng: null });
  const [qt, setQt] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setErr("");
    api.post("/app/quote", { store_id: storeId, fulfillment: mode, lat: addr.lat, lng: addr.lng })
      .then(({ data }) => setQt(data))
      .catch((e) => { setQt(null); setErr(e?.response?.data?.detail || "Couldn't price this order"); });
  };
  useEffect(load, [storeId, mode, addr.lat, addr.lng]); // eslint-disable-line

  const qty = async (it, d) => {
    await api.patch(`/cart/items/${it.id}`, { quantity: it.quantity + d });
    load();
  };

  const pay = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/app/checkout", { store_id: storeId, fulfillment: mode, lat: addr.lat, lng: addr.lng, address: addr.address, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-32 max-w-xl mx-auto" data-testid="app-checkout">
      <h1 className="font-display text-2xl font-black tracking-tight">{qt?.store_name || "Your order"}</h1>
      <div className="grid grid-cols-2 p-1 rounded-full bg-slate-100 mt-4" data-testid="checkout-mode">
        {[["pickup", "Pickup", Store], ["delivery", "Delivery", Bike]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setMode(k)} className={`h-11 rounded-full text-sm font-semibold flex items-center justify-center gap-2 ${mode === k ? "bg-white shadow" : "text-slate-500"}`} data-testid={`checkout-mode-${k}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>
      {mode === "delivery" && (
        <div className="mt-4" data-testid="checkout-address">
          <div className="text-sm font-semibold mb-1.5">Deliver to</div>
          <AddressInput value={addr.address} onChange={(address) => setAddr((a) => ({ ...a, address }))} onPlace={(p) => setAddr({ address: p.address, lat: p.lat ?? null, lng: p.lng ?? null })} />
        </div>
      )}
      {err && <div className="mt-4 text-sm text-red-600" data-testid="checkout-error">{String(err)}</div>}
      {qt && (
        <>
          <div className="mt-5 space-y-2.5" data-testid="checkout-items">
            {qt.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3" data-testid={`checkout-item-${it.id}`}>
                <div className="flex-1 min-w-0"><div className="font-medium truncate">{it.name}</div><div className="text-xs font-mono text-slate-500">{money(it.price_usd)}</div></div>
                <div className="flex items-center gap-2">
                  <button onClick={() => qty(it, -1)} className="w-8 h-8 rounded-full border flex items-center justify-center" data-testid={`checkout-dec-${it.id}`}><Minus className="w-4 h-4" /></button>
                  <span className="w-5 text-center font-mono">{it.quantity}</span>
                  <button onClick={() => qty(it, 1)} className="w-8 h-8 rounded-full border flex items-center justify-center" data-testid={`checkout-inc-${it.id}`}><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 space-y-2" data-testid="checkout-breakdown">
            <Row label="Items" value={money(qt.subtotal)} testid="checkout-subtotal" />
            <Row label={`Service fee (${qt.service_fee_pct}%)`} value={money(qt.service_fee)} testid="checkout-service-fee" />
            {mode === "delivery" && <Row label={`Delivery (${qt.miles} mi · ${qt.size_label.toLowerCase()})`} value={money(qt.delivery_fee)} testid="checkout-delivery-fee" />}
            {qt.tax_amount > 0 && <Row label={qt.tax_label} value={money(qt.tax_amount)} testid="checkout-tax" />}
            <Row label="Total" value={money(qt.total)} testid="checkout-total" bold />
          </div>
          {mode === "delivery" && <p className="text-xs text-slate-500 mt-2">Your driver keeps 90% of the delivery fee. Bigger items that need a larger vehicle cost more to deliver.</p>}
        </>
      )}
      <div className="fixed left-4 right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[1095] max-w-xl mx-auto">
        <button disabled={!qt || busy || (mode === "delivery" && !addr.address.trim())} onClick={pay} className="w-full h-14 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-40 shadow-xl" data-testid="checkout-pay">
          {busy ? "Opening payment…" : qt ? `Pay ${money(qt.total)}` : "Pay"}
        </button>
      </div>
    </div>
  );
}
