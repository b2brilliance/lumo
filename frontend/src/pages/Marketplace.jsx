import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import MediaUpload from "@/components/MediaUpload";
import AddressInput from "@/components/AddressInput";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function Marketplace() {
  const { user } = useAuth();
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const [items, setItems] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", price: "", category: "other",
    media_url: null, media_type: null, delivery_available: true,
  });
  const [orderTarget, setOrderTarget] = useState(null);
  const [order, setOrder] = useState({ delivery_fee: "9.99", delivery_address: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/marketplace/listings");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/marketplace/listings", { ...form, price: parseFloat(form.price) });
      toast.success("Listing created");
      setOpenCreate(false);
      setForm({ title: "", description: "", price: "", category: "other", media_url: null, media_type: null, delivery_available: true });
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const checkout = async () => {
    if (!user || user === false) { window.location.href = "/login"; return; }
    setBusy(true);
    try {
      const { data } = await api.post("/checkout/deposit", {
        item_price: orderTarget.price,
        delivery_fee: parseFloat(order.delivery_fee || "0"),
        listing_id: orderTarget.id,
        quantity: 1,
        delivery_address: order.delivery_address ? { address: order.delivery_address } : null,
        notes: order.notes,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };

  const item = orderTarget;
  const itemDeposit = item ? +(item.price * 0.10).toFixed(2) : 0;
  const deliveryDeposit = +(parseFloat(order.delivery_fee || "0") * 0.10).toFixed(2);
  const depositTotal = +(itemDeposit + deliveryDeposit).toFixed(2);

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Marketplace</div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Peer-to-peer.</h1>
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
                  <Button size="sm" onClick={() => { setOrderTarget(it); setOrder({ delivery_fee: "9.99", delivery_address: "", notes: "" }); }} className="bg-teal-700 hover:bg-teal-800" data-testid={`marketplace-buy-${it.id}`}>Buy</Button>
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
          <DialogHeader><DialogTitle className="font-display">New listing</DialogTitle><DialogDescription>Create a P2P marketplace listing with optional photo or video.</DialogDescription></DialogHeader>
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
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="listing-category" className="mt-1" />
              </div>
            </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="overline">Delivery fee ($)</Label>
                  <Input type="number" step="0.01" value={order.delivery_fee} onChange={(e) => setOrder({ ...order, delivery_fee: e.target.value })} data-testid="buy-delivery-fee" className="mt-1" />
                </div>
                <div>
                  <Label className="overline">Address</Label>
                  <div className="mt-1">
                    <AddressInput
                      value={order.delivery_address}
                      onChange={(v) => setOrder({ ...order, delivery_address: v })}
                      placeholder="Where should we deliver?"
                      data-testid="buy-delivery-address"
                    />
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-3 space-y-1 font-mono text-sm">
                <div className="flex justify-between"><span>Item</span><span>${orderTarget.price.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Item Deposit</span><span>${itemDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Delivery Deposit</span><span>${deliveryDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t pt-2 mt-1 text-base"><span>Pay now</span><span data-testid="buy-deposit-total">${depositTotal.toFixed(2)}</span></div>
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
    </div>
  );
}
