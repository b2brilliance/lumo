import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import AddressInput from "@/components/AddressInput";
import MapPickerButton from "@/components/MapPickerButton";
import { computeStoreDeliveryQuote, milesBetween } from "@/lib/deliveryPricing";
import { toast } from "sonner";

export default function StoreProfile({ role }) {
  const { id } = useParams();
  const { user } = useAuth();
  const [store, setStore] = useState(null);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [order, setOrder] = useState({
    quantity: 1, delivery_address: "", delivery_fee: "0", notes: "",
    delivery_lat: null, delivery_lng: null,
    payment_methods: ["app", "cash", "card"], terms: "",
  });
  const [busy, setBusy] = useState(false);
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const isRestaurant = role === "restaurant";

  useEffect(() => {
    api.get(`/storefronts/${id}`).then(({ data }) => setStore(data));
    api.get(`/inventory?owner_id=${id}`).then(({ data }) => setItems(data));
  }, [id]);

  const storeLoc = store?.storefront?.location;
  const storeMiles = storeLoc && order.delivery_lat != null
    ? milesBetween({ lat: storeLoc.lat, lng: storeLoc.lng }, { lat: order.delivery_lat, lng: order.delivery_lng })
    : null;
  const storeQuote = storeMiles != null ? computeStoreDeliveryQuote({ miles: storeMiles }) : null;

  useEffect(() => {
    if (storeQuote) setOrder((o) => ({ ...o, delivery_fee: storeQuote.total.toFixed(2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMiles]);

  if (!store) return <div className="p-12 text-slate-500">Loading…</div>;
  const sf = store.storefront;

  const openOrder = (it) => {
    if (!user || user === false) {
      window.location.href = "/login";
      return;
    }
    setTarget(it);
    setOrder((o) => ({ ...o, quantity: 1, delivery_address: "", delivery_lat: null, delivery_lng: null }));
    setOpen(true);
  };

  const togglePM = (m) => setOrder((o) => ({
    ...o, payment_methods: o.payment_methods.includes(m) ? o.payment_methods.filter((x) => x !== m) : [...o.payment_methods, m]
  }));

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        item_price: target.price,
        delivery_fee: parseFloat(order.delivery_fee || "0"),
        inventory_item_id: target.id,
        store_id: store.id,
        quantity: parseInt(order.quantity || "1"),
        delivery_address: order.delivery_address ? { address: order.delivery_address } : null,
        notes: order.notes,
        origin_url: window.location.origin,
        allowed_payment_methods: order.payment_methods,
        payment_terms: order.terms,
      };
      const { data } = await api.post("/checkout/deposit", body);
      window.location.href = data.url;
    } catch (e) {
      toast.error("Checkout failed");
      setBusy(false);
    }
  };

  const itemTotal = target ? target.price * order.quantity : 0;
  const itemDeposit = +(itemTotal * 0.10).toFixed(2);
  const deliveryFee = parseFloat(order.delivery_fee || "0");
  const deliveryDeposit = +(deliveryFee * 0.10).toFixed(2);
  const depositTotal = +(itemDeposit + deliveryDeposit).toFixed(2);
  const remaining = +(itemTotal + deliveryFee - depositTotal).toFixed(2);

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4">
          {sf.logo_url && <div className="aspect-square bg-slate-100"><img src={sf.logo_url} alt="" className="w-full h-full object-cover" /></div>}
          <div className="mt-6">
            <div className="overline">{isRestaurant ? sf.cuisine || "Food" : sf.category || "Retail"}</div>
            <h1 className="font-display text-4xl font-black tracking-tighter mt-2">{sf.name}</h1>
            <div className="mt-4 space-y-1 text-sm text-slate-600">
              <div className="font-mono">{sf.address}</div>
              {sf.hours && <div className="font-mono">{sf.hours}</div>}
            </div>
            <p className="text-slate-600 mt-4 text-sm">{sf.description}</p>
          </div>
        </div>
        <div className="lg:col-span-8">
          <div className="overline">{isRestaurant ? "Menu" : "Inventory"} ({items.length})</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 mt-3 border border-slate-200" data-testid="store-inventory-grid">
            {items.length === 0 && <div className="bg-white p-8 text-sm text-slate-500 col-span-full">No items listed yet.</div>}
            {items.map((it) => {
              const img = it.media_url ? (it.media_url.startsWith("http") ? it.media_url : `${BACKEND_URL}${it.media_url}`) : null;
              return (
                <div key={it.id} className="bg-white flex flex-col" data-testid={`store-item-${it.id}`}>
                  <div className="aspect-square bg-slate-100">
                    {img && <img src={img} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="font-display font-bold">{it.name}</div>
                    <div className="text-xs text-slate-500 mt-1 flex-1">{it.description}</div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="font-display text-xl font-bold">${Number(it.price).toFixed(2)}</div>
                      <Button size="sm" onClick={() => openOrder(it)} className="bg-slate-900 hover:bg-slate-800" data-testid={`order-item-${it.id}`}>Order</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="order-dialog" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Order: {target?.name}</DialogTitle>
            <DialogDescription>10% bundled deposit on item and delivery. Set your payment terms below.</DialogDescription>
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <div>
                <Label className="overline">Delivery address</Label>
                <div className="mt-1 flex gap-2 items-start">
                  <div className="flex-1">
                    <AddressInput
                      value={order.delivery_address}
                      onChange={(v) => setOrder({ ...order, delivery_address: v })}
                      onPlace={(p) => setOrder((o) => ({ ...o, delivery_address: p.address, delivery_lat: p.lat, delivery_lng: p.lng }))}
                      placeholder="Where should we deliver?"
                      data-testid="order-delivery-address"
                    />
                  </div>
                  <MapPickerButton
                    value={{ lat: order.delivery_lat, lng: order.delivery_lng, address: order.delivery_address }}
                    onPick={(p) => setOrder((o) => ({ ...o, delivery_address: p.address, delivery_lat: p.lat, delivery_lng: p.lng }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="overline">Quantity</Label>
                  <Input type="number" min="1" value={order.quantity} onChange={(e) => setOrder({ ...order, quantity: e.target.value })} data-testid="order-quantity" className="mt-1" />
                </div>
                <div>
                  <Label className="overline">Delivery fee ($)</Label>
                  <Input type="number" step="0.01" value={order.delivery_fee} onChange={(e) => setOrder({ ...order, delivery_fee: e.target.value })} data-testid="order-delivery-fee" className="mt-1" />
                </div>
              </div>
              {storeQuote && (
                <div className="border border-teal-700/40 bg-teal-50/40 p-3 text-xs font-mono space-y-0.5" data-testid="store-delivery-quote">
                  <div className="overline text-teal-800 mb-1">Delivery from {store.storefront.name}</div>
                  <div className="flex justify-between"><span>Base</span><span>${storeQuote.base_fee.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>{storeQuote.miles} mi × $1.50</span><span>${storeQuote.distance_fee.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-teal-900 border-t border-teal-700/30 pt-1 mt-1"><span>Auto-quote</span><span>${storeQuote.total.toFixed(2)}</span></div>
                </div>
              )}
              <div>
                <Label className="overline">Payment methods accepted (for balance)</Label>
                <div className="flex gap-4 mt-2 text-sm">
                  {["app", "card", "cash"].map((m) => (
                    <label key={m} className="flex items-center gap-2 capitalize cursor-pointer" data-testid={`order-pm-${m}`}>
                      <Checkbox checked={order.payment_methods.includes(m)} onCheckedChange={() => togglePM(m)} />
                      {m === "app" ? "In-app" : m}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label className="overline">Payment terms (notes)</Label>
                <Textarea value={order.terms} onChange={(e) => setOrder({ ...order, terms: e.target.value })} placeholder="e.g. Pay balance on delivery via cash" data-testid="order-terms" className="mt-1" />
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-1 font-mono text-sm">
                <div className="flex justify-between"><span>Item total</span><span>${itemTotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Delivery fee</span><span>${deliveryFee.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Item Deposit</span><span>${itemDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Delivery Deposit</span><span>${deliveryDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t border-slate-200 pt-2 mt-2 text-base">
                  <span>Pay now (deposit)</span><span data-testid="order-deposit-total">${depositTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500"><span>Remaining due on delivery</span><span>${remaining.toFixed(2)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="bg-teal-700 hover:bg-teal-800" data-testid="order-checkout-submit">
              {busy ? "Redirecting…" : "Pay deposit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
