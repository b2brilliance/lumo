import React, { useState } from "react";
import { useCart } from "@/lib/cart";
import { useLocale } from "@/lib/locale";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import AddressInput from "@/components/AddressInput";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";

export default function Cart() {
  const { cart, updateItem, removeItem, clearStore, checkoutStore, loading } = useCart();
  const { country, taxLabel, computeBreakdown, formatPrice } = useLocale();
  const { user } = useAuth();
  const [busyStore, setBusyStore] = useState(null);
  const [storeForm, setStoreForm] = useState({});  // { [store_id]: { delivery_address, delivery_fee, notes, us_state } }

  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;

  // Pre-fill the cart's per-store address form from the user's saved default.
  const defAddr = user?.default_delivery_address || {};
  const getForm = (sid) => storeForm[sid] || {
    delivery_address: defAddr.address || "",
    delivery_lat: defAddr.lat ?? null,
    delivery_lng: defAddr.lng ?? null,
    delivery_fee: "9.99",
    notes: "",
    us_state: "",
  };
  const setForm = (sid, patch) => setStoreForm((f) => ({ ...f, [sid]: { ...getForm(sid), ...patch } }));

  const checkout = async (sid) => {
    setBusyStore(sid);
    try {
      const f = getForm(sid);
      await checkoutStore(sid, {
        delivery_address: f.delivery_address ? { address: f.delivery_address } : null,
        delivery_fee: parseFloat(f.delivery_fee || "0"),
        notes: f.notes,
        country,
        us_state: f.us_state || null,
      });
      // checkoutStore redirects on success
    } catch (e) {
      toast.error(formatApiError(e));
      setBusyStore(null);
    }
  };

  if (!cart || cart.groups.length === 0) {
    return (
      <div className="max-w-screen-md mx-auto px-6 py-16 text-center">
        <ShoppingCart className="w-16 h-16 mx-auto text-slate-300" />
        <h1 className="font-display text-3xl font-black tracking-tighter mt-4">Your cart is empty</h1>
        <p className="text-slate-600 mt-3">Browse the <Link to="/stores" className="text-teal-700 underline">stores</Link> and <Link to="/restaurants" className="text-teal-700 underline">restaurants</Link> to add items.</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="overline">Cart</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">{cart.total_items} item{cart.total_items === 1 ? "" : "s"}.</h1>
      <p className="text-slate-600 mt-2 max-w-xl">Items grouped by store. Each store checks out separately with its own deposit and delivery fee.</p>

      <div className="mt-8 space-y-8">
        {cart.groups.map((g) => {
          const f = getForm(g.store_id);
          const breakdown = computeBreakdown(g.subtotal_usd, parseFloat(f.delivery_fee || "0"));
          return (
            <section key={g.store_id} className="border border-slate-200" data-testid={`cart-store-${g.store_id}`}>
              <header className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
                <div>
                  <div className="overline">{g.store?.role === "restaurant" ? "Restaurant" : "Store"}</div>
                  <div className="font-display text-xl font-bold mt-1">{g.store?.name || "Store"}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => clearStore(g.store_id)} className="text-slate-500 hover:text-red-600" data-testid={`cart-clear-${g.store_id}`}>
                  Clear store
                </Button>
              </header>

              <div className="divide-y divide-slate-200">
                {g.items.map((it) => {
                  const img = it.media_url ? (it.media_url.startsWith("http") ? it.media_url : `${process.env.REACT_APP_BACKEND_URL}${it.media_url}`) : null;
                  return (
                    <div key={it.id} className="flex items-center gap-4 p-4" data-testid={`cart-item-${it.id}`}>
                      <div className="w-16 h-16 bg-slate-100 flex-shrink-0">
                        {img && <img src={img} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold truncate">{it.name}</div>
                        <div className="text-sm text-slate-500 font-mono">${Number(it.price_usd).toFixed(2)} each</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateItem(it.id, it.quantity - 1)} data-testid={`cart-decr-${it.id}`}><Minus className="w-3 h-3" /></Button>
                        <span className="w-8 text-center font-mono">{it.quantity}</span>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateItem(it.id, it.quantity + 1)} data-testid={`cart-incr-${it.id}`}><Plus className="w-3 h-3" /></Button>
                      </div>
                      <div className="w-24 text-right font-mono font-bold">${(Number(it.price_usd) * it.quantity).toFixed(2)}</div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => removeItem(it.id)} data-testid={`cart-remove-${it.id}`}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-slate-50/60 border-t border-slate-200 grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <Label className="overline">Delivery address</Label>
                    <div className="mt-1">
                      <AddressInput
                        value={f.delivery_address}
                        onChange={(v) => setForm(g.store_id, { delivery_address: v })}
                        onPlace={(p) => {
                          setForm(g.store_id, { delivery_address: p.address, delivery_lat: p.lat, delivery_lng: p.lng });
                          if (p.lat != null && p.lng != null) {
                            api.get(`/delivery/coverage?lat=${p.lat}&lng=${p.lng}`)
                              .then(({ data }) => setForm(g.store_id, { coverage: data }))
                              .catch(() => {});
                          }
                        }}
                        placeholder="Where should we deliver?"
                      />
                      {f.coverage && !f.coverage.covered && (
                        <div className="mt-2 border border-amber-300 bg-amber-50 text-amber-900 text-xs p-3" data-testid={`cart-no-coverage-${g.store_id}`}>
                          <p className="font-bold">We&apos;re not in your neighborhood yet.</p>
                          <p className="mt-1">No Lumo driver is on duty within range of this address right now, so we can&apos;t guarantee this delivery. We&apos;ve added you to our expansion list — you won&apos;t be charged until coverage opens up{f.coverage.nearest_miles != null ? ` (nearest driver: ${f.coverage.nearest_miles.toFixed(1)} mi away)` : ""}.</p>
                        </div>
                      )}
                      {f.coverage && f.coverage.covered && (
                        <p className="mt-1 text-[11px] font-mono text-teal-700" data-testid={`cart-coverage-ok-${g.store_id}`}>
                          ✓ {f.coverage.providers_in_range} Lumo driver{f.coverage.providers_in_range === 1 ? "" : "s"} can deliver here
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="overline">Delivery fee ($)</Label>
                      <Input type="number" step="0.01" value={f.delivery_fee} onChange={(e) => setForm(g.store_id, { delivery_fee: e.target.value })} className="mt-1" data-testid={`cart-delivery-fee-${g.store_id}`} />
                    </div>
                    {country === "US" && (
                      <div>
                        <Label className="overline">US state</Label>
                        <Input value={f.us_state} onChange={(e) => setForm(g.store_id, { us_state: e.target.value.toUpperCase() })} placeholder="e.g. CA" maxLength={2} className="mt-1 uppercase" data-testid={`cart-us-state-${g.store_id}`} />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="overline">Notes (optional)</Label>
                    <Textarea rows={2} value={f.notes} onChange={(e) => setForm(g.store_id, { notes: e.target.value })} className="mt-1" placeholder="Any special instructions" />
                  </div>
                </div>

                <div className="font-mono text-sm space-y-1" data-testid={`cart-breakdown-${g.store_id}`}>
                  <div className="flex justify-between"><span>Subtotal ({g.item_count} item{g.item_count === 1 ? "" : "s"})</span><span>${g.subtotal_usd.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Delivery fee</span><span>${parseFloat(f.delivery_fee || "0").toFixed(2)}</span></div>
                  <div className="flex justify-between text-teal-700"><span>10% Item Deposit</span><span>${breakdown.itemDeposit.toFixed(2)}</span></div>
                  <div className="flex justify-between text-teal-700"><span>10% Delivery Deposit</span><span>${breakdown.deliveryDeposit.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>{taxLabel} (100% upfront)</span><span data-testid={`cart-tax-${g.store_id}`}>${breakdown.tax.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-2 mt-2 text-base">
                    <span>Pay now (deposit)</span><span data-testid={`cart-deposit-total-${g.store_id}`}>${breakdown.depositTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500"><span>Remaining due on delivery</span><span>${breakdown.remaining.toFixed(2)}</span></div>
                  <Button onClick={() => checkout(g.store_id)} disabled={busyStore === g.store_id || (f.coverage && !f.coverage.covered)} className="w-full mt-3 bg-teal-700 hover:bg-teal-800" data-testid={`cart-checkout-${g.store_id}`}>
                    {busyStore === g.store_id ? "Redirecting…" : (f.coverage && !f.coverage.covered) ? "Not deliverable to this address" : "Checkout this store"}
                  </Button>
                  <p className="text-[10px] uppercase font-mono tracking-widest text-slate-400 text-center mt-2">Pre-tax in local currency: {formatPrice(g.subtotal_usd)}</p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-6 text-xs text-slate-500 font-mono">
        Grand subtotal across all stores: ${cart.grand_subtotal_usd.toFixed(2)} ({formatPrice(cart.grand_subtotal_usd)})
      </div>
    </div>
  );
}
