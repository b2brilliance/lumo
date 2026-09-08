import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import AffiliateBlock from "@/components/AffiliateBlock";
import PageHero from "@/components/PageHero";
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
import { useLocation, useNavigate } from "react-router-dom";
import { MapPin, Search, X, SlidersHorizontal } from "lucide-react";

// Default fallback fee when seller hasn't provided a pickup location yet.
const FALLBACK_DELIVERY_FEE = 9.99;

export default function Marketplace() {
  const { user } = useAuth();
  const { country, taxLabel, computeBreakdown } = useLocale();
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const [items, setItems] = useState([]);
  const [openCreate, setOpenCreate] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Deep-link support: /marketplace/new auto-opens the "list an item" dialog
  // so the "Sell an item" tile on Landing can drop users straight into the
  // seller flow. If the user isn't signed in we still open the dialog — the
  // form's own submit path will redirect them to /login as needed.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (location.pathname === "/marketplace/new") {
      setOpenCreate(true);
    }
  }, [location.pathname]);

  // When the dialog CLOSES on /marketplace/new (was open, now shut), rewrite
  // the URL back to /marketplace so refreshing doesn't loop the modal open
  // again. We track wasOpenRef so we don't rewrite on the very first mount
  // (where openCreate is still `false` before the pathname effect flips it).
  useEffect(() => {
    if (openCreate) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current && location.pathname === "/marketplace/new") {
      navigate("/marketplace", { replace: true });
      wasOpenRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreate]);

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

  // ── Filters (client-side, applied to the loaded items list) ───────────
  const [filters, setFilters] = useState({
    search: "",
    category: "all",
    minPrice: "",
    maxPrice: "",
    radius: "any", // "any" | "5" | "10" | "25" | "50" | "100"
    sort: "newest", // "newest" | "price_asc" | "price_desc" | "distance"
  });
  const [showFilters, setShowFilters] = useState(false);
  // Buyer coords for distance filtering / distance sort. Priority: saved
  // default_delivery_address → browser geolocation (opt-in).
  const [buyerCoords, setBuyerCoords] = useState(null);
  useEffect(() => {
    const dfl = user?.default_delivery_address;
    if (dfl?.lat != null && dfl?.lng != null && !buyerCoords) {
      setBuyerCoords({ lat: dfl.lat, lng: dfl.lng, label: dfl.address || "Saved address" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation unsupported"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setBuyerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "My location" }),
      () => toast.error("Location access denied"),
    );
  };
  const resetFilters = () => setFilters({ search: "", category: "all", minPrice: "", maxPrice: "", radius: "any", sort: "newest" });

  // Compute filtered + sorted items. Distance is calculated per item once.
  const filteredItems = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const min = filters.minPrice ? parseFloat(filters.minPrice) : null;
    const max = filters.maxPrice ? parseFloat(filters.maxPrice) : null;
    const radius = filters.radius !== "any" ? parseFloat(filters.radius) : null;

    const withDistance = items.map((it) => {
      let dist = null;
      if (buyerCoords && it.location?.lat != null && it.location?.lng != null) {
        dist = milesBetween(buyerCoords, { lat: it.location.lat, lng: it.location.lng });
      }
      return { ...it, _distance: dist };
    });

    const result = withDistance.filter((it) => {
      if (q) {
        const hay = `${it.title || ""} ${it.description || ""} ${it.seller_name || ""} ${(it.attributes && Object.values(it.attributes).join(" ")) || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.category !== "all" && it.category !== filters.category) return false;
      if (min != null && it.price < min) return false;
      if (max != null && it.price > max) return false;
      if (radius != null) {
        if (it._distance == null) return false; // no coords → can't guarantee radius
        if (it._distance > radius) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      switch (filters.sort) {
        case "price_asc":  return (a.price || 0) - (b.price || 0);
        case "price_desc": return (b.price || 0) - (a.price || 0);
        case "distance":
          if (a._distance == null && b._distance == null) return 0;
          if (a._distance == null) return 1;
          if (b._distance == null) return -1;
          return a._distance - b._distance;
        case "newest":
        default:
          return (b.created_at || "").localeCompare(a.created_at || "");
      }
    });
    return result;
  }, [items, filters, buyerCoords]);

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.category !== "all" ? 1 : 0) +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.radius !== "any" ? 1 : 0) +
    (filters.sort !== "newest" ? 1 : 0);

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
    <div className="max-w-screen-2xl mx-auto py-0">
      <PageHero
        image="https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=1600"
        overline="Community Market"
        title="From your neighbors."
        subtitle="List anything. Bundled 10% deposit. Delivery wired in."
        action={user && user !== false ? (
          <Button onClick={() => setOpenCreate(true)} className="bg-white text-slate-900 hover:bg-slate-100" data-testid="marketplace-create">+ Create listing</Button>
        ) : null}
      />
      <div className="px-4 sm:px-6 pb-10">

      {/* ── FILTER BAR ─────────────────────────────────────────────── */}
      <div className="mt-4 border border-slate-200 bg-white" data-testid="marketplace-filters">
        {/* Row 1: Search + primary actions */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search listings…"
              className="pl-9"
              data-testid="marketplace-filter-search"
            />
          </div>
          <Select value={filters.sort} onValueChange={(v) => setFilters((f) => ({ ...f, sort: v }))}>
            <SelectTrigger className="w-[170px]" data-testid="marketplace-filter-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="price_asc">Price ↑</SelectItem>
              <SelectItem value="price_desc">Price ↓</SelectItem>
              <SelectItem value="distance" disabled={!buyerCoords}>Nearest first{!buyerCoords ? " (set location)" : ""}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="rounded-none"
            data-testid="marketplace-filter-toggle"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            {showFilters ? "Hide filters" : "More filters"}
            {activeFilterCount > 0 && (
              <span className="ml-2 bg-teal-700 text-white text-[10px] font-mono px-1.5 py-0.5">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="marketplace-filter-reset" className="text-xs text-slate-500">
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Row 2: expandable filter grid */}
        {showFilters && (
          <div className="border-t border-slate-200 p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <div>
              <Label className="overline text-[10px]">Category</Label>
              <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1" data-testid="marketplace-filter-category"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {MARKETPLACE_CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="overline text-[10px]">Min price</Label>
              <Input
                type="number"
                min="0"
                value={filters.minPrice}
                onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
                placeholder="$0"
                className="mt-1"
                data-testid="marketplace-filter-min-price"
              />
            </div>
            <div>
              <Label className="overline text-[10px]">Max price</Label>
              <Input
                type="number"
                min="0"
                value={filters.maxPrice}
                onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                placeholder="$∞"
                className="mt-1"
                data-testid="marketplace-filter-max-price"
              />
            </div>
            <div>
              <Label className="overline text-[10px]">Within</Label>
              <Select value={filters.radius} onValueChange={(v) => setFilters((f) => ({ ...f, radius: v }))} disabled={!buyerCoords}>
                <SelectTrigger className="mt-1" data-testid="marketplace-filter-radius">
                  <SelectValue placeholder={buyerCoords ? "Any distance" : "Set location"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any distance</SelectItem>
                  <SelectItem value="5">5 mi</SelectItem>
                  <SelectItem value="10">10 mi</SelectItem>
                  <SelectItem value="25">25 mi</SelectItem>
                  <SelectItem value="50">50 mi</SelectItem>
                  <SelectItem value="100">100 mi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="overline text-[10px]">Location</Label>
              {buyerCoords ? (
                <div className="mt-1 flex items-center gap-1">
                  <div className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs flex-1 truncate flex items-center gap-1" title={buyerCoords.label}>
                    <MapPin className="w-3 h-3 text-teal-700 flex-shrink-0" />
                    <span className="truncate">{buyerCoords.label}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setBuyerCoords(null); setFilters((f) => ({ ...f, radius: "any", sort: f.sort === "distance" ? "newest" : f.sort })); }} data-testid="marketplace-filter-clear-location" className="px-2">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={useMyLocation} className="mt-1 w-full rounded-none" data-testid="marketplace-filter-use-location">
                  <MapPin className="w-3.5 h-3.5 mr-1" /> Use my location
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Result count */}
        <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500 flex justify-between" data-testid="marketplace-result-count">
          <span>{filteredItems.length} of {items.length} listing{items.length === 1 ? "" : "s"}</span>
          {buyerCoords && filters.sort === "distance" && <span>sorted by distance</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-200 mt-2 border border-slate-200" data-testid="marketplace-grid">
        {filteredItems.length === 0 && <div className="bg-white p-8 text-sm text-slate-500 col-span-full">{items.length === 0 ? "No listings yet." : "No listings match your filters."}</div>}
        {filteredItems.map((it) => {
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
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-2 flex justify-between">
                  <span>{it.seller_name}</span>
                  {it._distance != null && (
                    <span className="text-teal-700 flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" /> {it._distance < 10 ? it._distance.toFixed(1) : Math.round(it._distance)} mi
                    </span>
                  )}
                </div>
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
      <div className="mt-10 -mx-4 sm:-mx-6 border-t border-neutral-200 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" data-testid="marketplace-shop-teaser">
          <div>
            <div className="overline mb-1">Also on Lumo</div>
            <div className="font-display font-semibold text-xl text-black">Looking for something new instead?</div>
            <p className="text-sm text-neutral-600 mt-1">Browse hand-picked products from Amazon, Best Buy, Wayfair and more in the Lumo Shop.</p>
          </div>
          <a href="/shop" className="btn-lumo btn-lumo-primary flex-shrink-0" data-testid="marketplace-shop-link">
            Visit the shop →
          </a>
        </div>
      </div>
      </div>
    </div>
  );
}
