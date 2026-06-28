import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import AffiliateBlock from "@/components/AffiliateBlock";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import MediaUpload from "@/components/MediaUpload";
import AddressInput from "@/components/AddressInput";
import MapPickerButton from "@/components/MapPickerButton";
import { MARKETPLACE_CATEGORY_OPTIONS, MARKETPLACE_SCHEMAS } from "@/lib/marketplaceSchemas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLocale } from "@/lib/locale";
import { computeStoreDeliveryQuote, milesBetween } from "@/lib/deliveryPricing";

// Default fallback fee when seller hasn't provided a pickup location yet.
const FALLBACK_DELIVERY_FEE = 9.99;

export default function Marketplace() {
  const { user } = useAuth();
  const { country, taxLabel, computeBreakdown } = useLocale();
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const [items, setItems] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", price: "", category: "other",
    media_url: null, media_type: null, delivery_available: true,
    pickup_address: "", pickup_lat: null, pickup_lng: null,
  });
  const [orderTarget, setOrderTarget] = useState(null);
  const [order, setOrder] = useState({
    delivery_fee: FALLBACK_DELIVERY_FEE.toFixed(2),
    delivery_address: "",
    delivery_lat: null,
    delivery_lng: null,
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  // Pre-fill default delivery address from the user's saved Settings preference.
  const defaultAddr = user?.default_delivery_address;
  const openBuy = (it) => {
    setOrderTarget(it);
    setOrder({
      delivery_fee: FALLBACK_DELIVERY_FEE.toFixed(2),
      delivery_address: defaultAddr?.address || "",
      delivery_lat: defaultAddr?.lat ?? null,
      delivery_lng: defaultAddr?.lng ?? null,
      notes: "",
    });
  };

  const load = async () => {
    const { data } = await api.get("/marketplace/listings");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const location = (form.pickup_lat != null && form.pickup_lng != null)
        ? { lat: form.pickup_lat, lng: form.pickup_lng, address: form.pickup_address || "" }
        : null;
      await api.post("/marketplace/listings", {
        ...form,
        price: parseFloat(form.price),
        location,
      });
      toast.success("Listing created");
      setOpenCreate(false);
      setForm({
        title: "", description: "", price: "", category: "other",
        media_url: null, media_type: null, delivery_available: true,
        attributes: { subcategory: "" },
        pickup_address: "", pickup_lat: null, pickup_lng: null,
      });
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const catSchema = MARKETPLACE_SCHEMAS[form.category];
  const subFields = catSchema?.subcategories?.[form.attributes?.subcategory]?.fields || [];
  const allFields = [...(catSchema?.baseFields || []), ...subFields];
  const setAttr = (k, v) => setForm((f) => ({ ...f, attributes: { ...(f.attributes || {}), [k]: v } }));
  const visible = (field) => !field.showIf || Object.entries(field.showIf).every(([k, v]) => form.attributes?.[k] === v);

  // Distance-based delivery quote for the buy dialog (mirrors the Customer Hub /
  // store flow). When seller has a pickup location AND customer has selected an
  // address with coords, we compute Haversine miles and auto-quote a fair fee.
  const sellerLoc = orderTarget?.location;
  const hasSellerCoords = sellerLoc && sellerLoc.lat != null && sellerLoc.lng != null;
  const deliveryMiles = useMemo(() => {
    if (!hasSellerCoords || order.delivery_lat == null) return null;
    return milesBetween(
      { lat: sellerLoc.lat, lng: sellerLoc.lng },
      { lat: order.delivery_lat, lng: order.delivery_lng },
    );
  }, [hasSellerCoords, sellerLoc, order.delivery_lat, order.delivery_lng]);
  const deliveryQuote = deliveryMiles != null ? computeStoreDeliveryQuote({ miles: deliveryMiles }) : null;

  // Whenever the computed quote changes, sync the editable delivery_fee input
  // so the breakdown stays consistent. Users can still override manually.
  // NOTE: depend only on `deliveryMiles` (primitive) — `deliveryQuote` is a
  // fresh object reference on every render which would cause an infinite loop.
  useEffect(() => {
    if (deliveryQuote) {
      setOrder((o) => ({ ...o, delivery_fee: deliveryQuote.total.toFixed(2) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMiles]);

  const checkout = async () => {
    if (!user || user === false) { window.location.href = "/login"; return; }
    setBusy(true);
    try {
      const { data } = await api.post("/checkout/deposit", {
        item_price: orderTarget.price,
        delivery_fee: parseFloat(order.delivery_fee || "0"),
        listing_id: orderTarget.id,
        quantity: 1,
        delivery_address: order.delivery_address ? { address: order.delivery_address, lat: order.delivery_lat, lng: order.delivery_lng } : null,
        notes: order.notes,
        origin_url: window.location.origin,
        country,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };

  const item = orderTarget;
  const deliveryFeeNum = parseFloat(order.delivery_fee || "0");
  const breakdown = item ? computeBreakdown(item.price, deliveryFeeNum) : null;

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Community Market</div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">From your neighbors.</h1>
          <p className="text-slate-600 mt-2 max-w-xl">List anything. Bundled 10% deposit. Delivery wired in.</p>
        </div>
        {user && user !== false && (
          <Button onClick={() => setOpenCreate(true)} className="bg-slate-900 hover:bg-slate-800" data-testid="marketplace-create">+ Create listing</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-200 mt-8 border border-slate-200" data-testid="marketplace-grid">
        {items.length === 0 && <div className="bg-white p-8 text-sm text-slate-500 col-span-full">No listings yet.</div>}
        {items.map((it) => {
          const img = it.media_url ? (it.media_url.startsWith("http") ? it.media_url : `${BACKEND_URL}${it.media_url}`) : null;
          return (
            <div key={it.id} className="bg-white flex flex-col" data-testid={`marketplace-item-${it.id}`}>
              <div className="aspect-[4/3] bg-slate-100">
                {img && (it.media_type?.startsWith("video")
                  ? <video src={img} className="w-full h-full object-cover" muted />
                  : <img src={img} alt="" className="w-full h-full object-cover" />)}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="overline">{it.category}</div>
                <div className="font-display text-lg font-bold mt-1">{it.title}</div>
                <div className="text-xs text-slate-500 mt-1 flex-1">{it.description}</div>
                <div className="flex items-center justify-between mt-3">
                  <div className="font-display text-2xl font-bold">${it.price.toFixed(2)}</div>
                  <Button size="sm" onClick={() => openBuy(it)} className="bg-teal-700 hover:bg-teal-800" data-testid={`marketplace-buy-${it.id}`}>Buy</Button>
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-2">{it.seller_name}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create listing */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent data-testid="listing-dialog">
          <DialogHeader><DialogTitle className="font-display">New listing</DialogTitle><DialogDescription>List an item on the Community Market with an optional photo or video.</DialogDescription></DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div>
              <Label className="overline">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required data-testid="listing-title" className="mt-1" />
            </div>
            <div>
              <Label className="overline">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required data-testid="listing-description" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="overline">Price ($)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required data-testid="listing-price" className="mt-1" />
              </div>
              <div>
                <Label className="overline">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, attributes: { subcategory: "" } })}>
                  <SelectTrigger className="mt-1" data-testid="listing-category"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {MARKETPLACE_CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="overline">Pickup location (for distance-based delivery quoting)</Label>
              <div className="mt-1 flex gap-2 items-start">
                <div className="flex-1">
                  <AddressInput
                    value={form.pickup_address}
                    onChange={(v) => setForm((f) => ({ ...f, pickup_address: v }))}
                    onPlace={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                    placeholder="Where will buyers pick up or drivers collect this?"
                    data-testid="listing-pickup-address"
                  />
                </div>
                <MapPickerButton
                  value={{ lat: form.pickup_lat, lng: form.pickup_lng, address: form.pickup_address }}
                  onPick={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-1">
                Optional — enables Haversine distance pricing for buyers far away
              </div>
            </div>
            {catSchema && (
              <div className="space-y-3 border border-slate-200 p-3 bg-slate-50/40" data-testid="listing-attributes">
                <div className="overline">Item details</div>
                <div>
                  <Label className="overline">{catSchema.subcategoryLabel || "Type"}</Label>
                  <Select value={form.attributes?.subcategory || ""} onValueChange={(v) => setAttr("subcategory", v)}>
                    <SelectTrigger className="mt-1" data-testid="listing-subcategory"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(catSchema.subcategories).map(([v, opt]) => (
                        <SelectItem key={v} value={v}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {allFields.filter(visible).map((f) => (
                  <div key={f.name}>
                    <Label className="overline">{f.label}{f.required && <span className="text-red-600 ml-0.5">*</span>}</Label>
                    {f.type === "select" ? (
                      <Select value={form.attributes?.[f.name] || ""} onValueChange={(v) => setAttr(f.name, v)}>
                        <SelectTrigger className="mt-1" data-testid={`listing-attr-${f.name}`}><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : f.type === "number" ? (
                      <Input type="number" min={f.min} max={f.max} step={f.step || 1} value={form.attributes?.[f.name] ?? ""} onChange={(e) => setAttr(f.name, e.target.value === "" ? null : parseFloat(e.target.value))} className="mt-1" data-testid={`listing-attr-${f.name}`} />
                    ) : (
                      <Input value={form.attributes?.[f.name] || ""} onChange={(e) => setAttr(f.name, e.target.value)} placeholder={f.placeholder} className="mt-1" data-testid={`listing-attr-${f.name}`} />
                    )}
                  </div>
                ))}
              </div>
            )}
            <MediaUpload value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
            <DialogFooter>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800" data-testid="listing-submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Buy listing */}
      <Dialog open={!!orderTarget} onOpenChange={(o) => !o && setOrderTarget(null)}>
        <DialogContent data-testid="buy-dialog">
          <DialogHeader><DialogTitle className="font-display">Buy: {orderTarget?.title}</DialogTitle><DialogDescription>10% bundled deposit on item and delivery. Remaining balance settled on delivery.</DialogDescription></DialogHeader>
          {orderTarget && (
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
                      data-testid="buy-delivery-address"
                    />
                  </div>
                  <MapPickerButton
                    value={{ lat: order.delivery_lat, lng: order.delivery_lng, address: order.delivery_address }}
                    onPick={(p) => setOrder((o) => ({ ...o, delivery_address: p.address, delivery_lat: p.lat, delivery_lng: p.lng }))}
                  />
                </div>
              </div>
              <div>
                <Label className="overline">Delivery fee ($)</Label>
                <Input type="number" step="0.01" value={order.delivery_fee} onChange={(e) => setOrder({ ...order, delivery_fee: e.target.value })} data-testid="buy-delivery-fee" className="mt-1" />
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-1">
                  Auto-quoted from distance. Edit if you&apos;ve agreed something different with the seller.
                </div>
              </div>
              {deliveryQuote && (
                <div className="border border-teal-700/40 bg-teal-50/40 p-3 text-xs font-mono space-y-0.5" data-testid="buy-delivery-quote">
                  <div className="overline text-teal-800 mb-1">Distance-based delivery quote</div>
                  <div className="flex justify-between"><span>From {sellerLoc?.address || orderTarget.seller_name}</span><span>{deliveryQuote.miles} mi</span></div>
                  <div className="flex justify-between"><span>Base</span><span>${deliveryQuote.base_fee.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>{deliveryQuote.miles} mi × $1.50</span><span>${deliveryQuote.distance_fee.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-teal-900 border-t border-teal-700/30 pt-1 mt-1"><span>Auto-quote</span><span>${deliveryQuote.total.toFixed(2)}</span></div>
                </div>
              )}
              {!hasSellerCoords && (
                <div className="text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 p-2" data-testid="buy-no-seller-loc">
                  Seller hasn&apos;t set a pickup location — using flat default. Edit fee above if needed.
                </div>
              )}
              {hasSellerCoords && order.delivery_lat == null && (
                <div className="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 p-2" data-testid="buy-pick-address-hint">
                  Pick your delivery address above to get an exact distance-based quote.
                </div>
              )}
              <div className="border-t border-slate-200 pt-3 space-y-1 font-mono text-sm">
                <div className="flex justify-between"><span>Item</span><span>${orderTarget.price.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Delivery fee</span><span>${deliveryFeeNum.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Item Deposit</span><span>${breakdown.itemDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Delivery Deposit</span><span>${breakdown.deliveryDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-700"><span>{taxLabel} (100% upfront)</span><span data-testid="buy-tax-amount">${breakdown.tax.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t pt-2 mt-1 text-base"><span>Pay now</span><span data-testid="buy-deposit-total">${breakdown.depositTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs text-slate-500"><span>Remaining due on delivery</span><span>${breakdown.remaining.toFixed(2)}</span></div>
              </div>
              <DialogFooter>
                <Button onClick={checkout} disabled={busy} className="bg-teal-700 hover:bg-teal-800" data-testid="buy-checkout-submit">
                  {busy ? "Redirecting…" : "Pay deposit"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <div className="mt-10 -mx-4 sm:-mx-6">
        <AffiliateBlock category="marketplace" title="Earn cashback while you shop" subtitle="Cashback portals, gift cards, and exclusive deals from our partners." />
      </div>
    </div>
  );
}
