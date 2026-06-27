import React, { useEffect, useMemo, useState } from "react";
import { api, ALL_CATEGORIES, LOCATION_COPY, locationModeFor, locationLabelsFor, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import MediaUpload from "@/components/MediaUpload";
import AddressInput from "@/components/AddressInput";
import MapPickerButton from "@/components/MapPickerButton";
import ServiceDetailsForm from "@/components/ServiceDetailsForm";
import DeliveryActions from "@/components/DeliveryActions";
import { computeDeliveryQuote, computeMovingQuote, milesBetween } from "@/lib/deliveryPricing";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import CategoryBadge from "@/components/CategoryBadge";
import { Link } from "react-router-dom";

export default function CustomerHub() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({
    title: "", description: "", category: "delivery",
    pay_rate: "", pay_unit: "flat", estimated_units: "1",
    payment_terms: "",
    allowed_payment_methods: ["app"],
    pickup_address: "", pickup_lat: null, pickup_lng: null,
    dropoff_address: "", dropoff_lat: null, dropoff_lng: null,
    media_url: null, media_type: null,
    details: {},
  });
  const locMode = locationModeFor(form.category);
  const locCopy = locationLabelsFor(form.category, form.details?.subcategory) || LOCATION_COPY[locMode];

  // Delivery / courier auto-quote
  const isDeliveryCat = form.category === "delivery" || form.category === "courier";
  const isMovingCat = form.category === "moving";
  const deliveryQuote = useMemo(() => {
    if (!isDeliveryCat) return null;
    if (form.pickup_lat == null || form.dropoff_lat == null) return null;
    const miles = milesBetween(
      { lat: form.pickup_lat, lng: form.pickup_lng },
      { lat: form.dropoff_lat, lng: form.dropoff_lng }
    );
    return computeDeliveryQuote({
      miles,
      item_size: form.details?.item_size || "other",
      quantity: form.details?.quantity || 1,
      weight_estimate: form.details?.weight_estimate || 0,
      fragile: form.details?.fragile === "yes",
    });
  }, [isDeliveryCat, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng, form.details?.item_size, form.details?.quantity, form.details?.weight_estimate, form.details?.fragile]);

  const movingQuote = useMemo(() => {
    if (!isMovingCat) return null;
    // Labor-only doesn't need pickup/dropoff; everything else does
    const sub = form.details?.subcategory;
    if (sub !== "labor_only" && (form.pickup_lat == null || form.dropoff_lat == null)) return null;
    const miles = sub === "labor_only" ? 0 : milesBetween(
      { lat: form.pickup_lat, lng: form.pickup_lng },
      { lat: form.dropoff_lat, lng: form.dropoff_lng }
    );
    return computeMovingQuote({
      miles,
      move_type: sub || "local",
      property_size: form.details?.property_size || "1br",
      num_movers: form.details?.num_movers || 2,
      has_stairs: form.details?.has_stairs || "no",
      packing_needed: form.details?.packing_needed || "no",
      duration_hours: parseFloat(form.estimated_units || "2"),
    });
  }, [isMovingCat, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng, form.details?.subcategory, form.details?.property_size, form.details?.num_movers, form.details?.has_stairs, form.details?.packing_needed, form.estimated_units]);

  // Auto-fill pay_rate from quote
  useEffect(() => {
    if (deliveryQuote && deliveryQuote.total > 0) {
      setForm((f) => {
        if (f.category !== "delivery" && f.category !== "courier") return f;
        return { ...f, pay_rate: deliveryQuote.total.toFixed(2), pay_unit: "flat", estimated_units: "1" };
      });
    }
  }, [deliveryQuote]);

  useEffect(() => {
    if (movingQuote && movingQuote.total > 0) {
      setForm((f) => {
        if (f.category !== "moving") return f;
        return { ...f, pay_rate: movingQuote.total.toFixed(2), pay_unit: "flat" };
      });
    }
  }, [movingQuote]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: j }, { data: o }] = await Promise.all([
      api.get(`/jobs?customer_id=${user.id}`),
      api.get(`/orders`),
    ]);
    setJobs(j); setOrders(o);
  };
  useEffect(() => { load(); }, [user.id]); // eslint-disable-next-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => {
    // Reset details when category changes
    if (k === "category" && v !== f.category) return { ...f, category: v, details: {} };
    return { ...f, [k]: v };
  });
  const togglePM = (m) => set("allowed_payment_methods",
    form.allowed_payment_methods.includes(m)
      ? form.allowed_payment_methods.filter((x) => x !== m)
      : [...form.allowed_payment_methods, m]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        title: form.title, description: form.description,
        category: form.category,
        pay_rate: parseFloat(form.pay_rate),
        pay_unit: form.pay_unit,
        estimated_units: parseFloat(form.estimated_units || "1"),
        payment_terms: form.payment_terms,
        allowed_payment_methods: form.allowed_payment_methods,
        media_url: form.media_url, media_type: form.media_type,
        pickup_location: null,
        dropoff_location: null,
        details: form.details || {},
        delivery_quote: deliveryQuote || movingQuote || null,
      };
      if (locMode === "pickup_dropoff") {
        body.pickup_location = form.pickup_address ? { lat: form.pickup_lat ?? 40.7128, lng: form.pickup_lng ?? -74.006, address: form.pickup_address } : null;
        body.dropoff_location = form.dropoff_address ? { lat: form.dropoff_lat ?? 40.7128, lng: form.dropoff_lng ?? -74.006, address: form.dropoff_address } : null;
      } else if (locMode === "onsite") {
        body.pickup_location = form.pickup_address ? { lat: form.pickup_lat ?? 40.7128, lng: form.pickup_lng ?? -74.006, address: form.pickup_address } : null;
      }
      await api.post("/jobs", body);
      toast.success("Service request posted");
      setForm({ ...form, title: "", description: "", pay_rate: "", media_url: null, media_type: null, details: {} });
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="overline">Customer Hub</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Hi, {user.name.split(" ")[0]}.</h1>
      <div className="grid lg:grid-cols-12 gap-8 mt-8">
        <form onSubmit={submit} className="lg:col-span-5 border border-slate-200 p-6 space-y-4" data-testid="post-job-form">
          <div className="overline">Post a service request</div>
          <div>
            <Label className="overline">Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Move a couch across town" required data-testid="job-title" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Details, address, timing..." required data-testid="job-description" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="mt-1" data-testid="job-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ServiceDetailsForm
            category={form.category}
            details={form.details || {}}
            onChange={(d) => setForm((f) => ({ ...f, details: d }))}
          />
          {/* For delivery / courier / moving, pay rate is auto-calculated from
              the item + distance — hide the manual inputs to avoid confusion. */}
          {!isDeliveryCat && !isMovingCat && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="overline">Pay unit</Label>
                  <Select value={form.pay_unit} onValueChange={(v) => set("pay_unit", v)}>
                    <SelectTrigger className="mt-1" data-testid="job-pay-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Per hour</SelectItem>
                      <SelectItem value="day">Per day</SelectItem>
                      <SelectItem value="week">Per week</SelectItem>
                      <SelectItem value="flat">Flat (one-time)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="overline">
                    {form.pay_unit === "flat" ? "Estimated time" :
                     form.pay_unit === "hour" ? "How many hours?" :
                     form.pay_unit === "day" ? "How many days?" :
                     form.pay_unit === "week" ? "How many weeks?" : "Estimated units"}
                  </Label>
                  <Input type="number" step="0.5" value={form.estimated_units} onChange={(e) => set("estimated_units", e.target.value)} disabled={form.pay_unit === "flat"} data-testid="job-estimated-units" className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="overline">Pay rate ($)</Label>
                <Input type="number" step="0.01" value={form.pay_rate} onChange={(e) => set("pay_rate", e.target.value)} required data-testid="job-pay-rate" className="mt-1" />
              </div>
            </>
          )}
          {locMode === "pickup_dropoff" && (
            <div className="border-l-2 border-red-500 pl-3">
              <div className="overline text-red-700 mb-2">{locCopy.title}</div>
              <div className="space-y-3">
                <div>
                  <Label className="overline">{locCopy.pickup_label}</Label>
                  <div className="mt-1 flex gap-2 items-start">
                    <div className="flex-1">
                      <AddressInput
                        value={form.pickup_address}
                        onChange={(v) => set("pickup_address", v)}
                        onPlace={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                        placeholder={locCopy.pickup_placeholder}
                        data-testid="job-pickup-address"
                      />
                    </div>
                    <MapPickerButton
                      value={{ lat: form.pickup_lat, lng: form.pickup_lng, address: form.pickup_address }}
                      onPick={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="overline">{locCopy.dropoff_label}</Label>
                  <div className="mt-1 flex gap-2 items-start">
                    <div className="flex-1">
                      <AddressInput
                        value={form.dropoff_address}
                        onChange={(v) => set("dropoff_address", v)}
                        onPlace={(p) => setForm((f) => ({ ...f, dropoff_address: p.address, dropoff_lat: p.lat, dropoff_lng: p.lng }))}
                        placeholder={locCopy.dropoff_placeholder}
                        data-testid="job-dropoff-address"
                      />
                    </div>
                    <MapPickerButton
                      value={{ lat: form.dropoff_lat, lng: form.dropoff_lng, address: form.dropoff_address }}
                      onPick={(p) => setForm((f) => ({ ...f, dropoff_address: p.address, dropoff_lat: p.lat, dropoff_lng: p.lng }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          {locMode === "onsite" && (
            <div className="border-l-2 border-blue-500 pl-3">
              <div className="overline text-blue-700 mb-2">{locCopy.title}</div>
              <div>
                <Label className="overline">{locCopy.pickup_label}</Label>
                <div className="mt-1 flex gap-2 items-start">
                  <div className="flex-1">
                    <AddressInput
                      value={form.pickup_address}
                      onChange={(v) => set("pickup_address", v)}
                      onPlace={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                      placeholder={locCopy.pickup_placeholder}
                      data-testid="job-service-address"
                      required
                    />
                  </div>
                  <MapPickerButton
                    value={{ lat: form.pickup_lat, lng: form.pickup_lng, address: form.pickup_address }}
                    onPick={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                  />
                </div>
              </div>
            </div>
          )}
          {locMode === "remote" && (
            <div className="border-l-2 border-teal-500 pl-3 py-2">
              <div className="overline text-teal-700">{locCopy.title}</div>
              <p className="text-xs text-slate-500 mt-1 font-mono">Remote-friendly — providers anywhere can apply.</p>
            </div>
          )}
          <div>
            <Label className="overline">Allowed payment methods (terms)</Label>
            <div className="flex gap-4 mt-2 text-sm">
              {["app", "card", "cash"].map((m) => (
                <label key={m} className="flex items-center gap-2 capitalize cursor-pointer" data-testid={`job-pm-${m}`}>
                  <Checkbox checked={form.allowed_payment_methods.includes(m)} onCheckedChange={() => togglePM(m)} />
                  {m === "app" ? "In-app" : m}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="overline">Notes / terms (optional)</Label>
            <Textarea value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} placeholder="e.g. Pay after delivery, half cash half app" data-testid="job-payment-terms" className="mt-1" />
          </div>
          <MediaUpload value={form} onChange={(v) => set("media_url", v.media_url) || setForm((f) => ({ ...f, ...v }))} />
          {isMovingCat && movingQuote && (
            <div className="border border-red-700/40 bg-red-50/40 p-4" data-testid="moving-quote">
              <div className="flex items-center justify-between">
                <div className="overline text-red-800">Your price · auto-calculated</div>
                {movingQuote.is_long_distance && (
                  <span className="text-[10px] font-mono uppercase tracking-wider border border-amber-400 bg-amber-50 text-amber-800 px-1.5 py-0.5">Long-distance</span>
                )}
                {movingQuote.mode === "labor_only" && (
                  <span className="text-[10px] font-mono uppercase tracking-wider border border-blue-400 bg-blue-50 text-blue-800 px-1.5 py-0.5">Labor only</span>
                )}
              </div>
              <div className="font-mono text-sm mt-3 space-y-1">
                {movingQuote.mode === "labor_only" ? (
                  <>
                    <div className="flex justify-between"><span>{movingQuote.movers} movers × {movingQuote.hours} hr × $45</span><span>${movingQuote.labor_fee.toFixed(2)}</span></div>
                    {movingQuote.stairs_fee > 0 && <div className="flex justify-between"><span>Stairs surcharge</span><span>${movingQuote.stairs_fee.toFixed(2)}</span></div>}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Base · {movingQuote.base_property} × {movingQuote.movers} movers ({movingQuote.mover_multiplier}×){movingQuote.mode === "long_distance" ? " · long-distance" : ""}{movingQuote.mode === "single_item" ? " · single item" : ""}</span>
                      <span>${movingQuote.base_fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>First {movingQuote.short_distance_miles} mi × ${movingQuote.short_per_mile.toFixed(2)}</span>
                      <span>${movingQuote.short_distance_fee.toFixed(2)}</span>
                    </div>
                    {movingQuote.is_long_distance && (
                      <>
                        <div className="flex justify-between text-amber-800">
                          <span>Long-haul {movingQuote.long_distance_miles} mi × ${movingQuote.long_per_mile.toFixed(2)}</span>
                          <span>${movingQuote.long_distance_fee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-amber-800">
                          <span>Long-haul surcharge (50+ mi)</span>
                          <span>${movingQuote.long_haul_surcharge.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {movingQuote.stairs_fee > 0 && <div className="flex justify-between"><span>Stairs</span><span>${movingQuote.stairs_fee.toFixed(2)}</span></div>}
                    {movingQuote.packing_fee > 0 && <div className="flex justify-between"><span>Packing service</span><span>${movingQuote.packing_fee.toFixed(2)}</span></div>}
                  </>
                )}
                <div className="flex justify-between font-display text-base font-black border-t border-red-700/30 pt-2 mt-2 text-red-900">
                  <span>Your price</span><span data-testid="moving-quote-total">${movingQuote.total.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Auto-calculated from your property size, movers, stairs, packing service, and distance. Adjust above if your job is unusual.
              </p>
            </div>
          )}
          {isDeliveryCat && deliveryQuote && (
            <div className="border border-teal-700/40 bg-teal-50/40 p-4" data-testid="delivery-quote">
              <div className="flex items-center justify-between">
                <div className="overline text-teal-800">Your price · auto-calculated</div>
                {deliveryQuote.is_long_distance && (
                  <span className="text-[10px] font-mono uppercase tracking-wider border border-amber-400 bg-amber-50 text-amber-800 px-1.5 py-0.5">Long-distance</span>
                )}
              </div>
              <div className="font-mono text-sm mt-3 space-y-1">
                <div className="flex justify-between"><span>Base fee · {deliveryQuote.size_label}</span><span>${deliveryQuote.base_fee.toFixed(2)}</span></div>
                <div className="flex justify-between">
                  <span>First {deliveryQuote.short_distance_miles} mi × ${deliveryQuote.short_per_mile.toFixed(2)}</span>
                  <span>${deliveryQuote.short_distance_fee.toFixed(2)}</span>
                </div>
                {deliveryQuote.is_long_distance && (
                  <>
                    <div className="flex justify-between text-amber-800">
                      <span>Long-haul {deliveryQuote.long_distance_miles} mi × ${deliveryQuote.long_per_mile.toFixed(2)}</span>
                      <span>${deliveryQuote.long_distance_fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-amber-800">
                      <span>Long-haul surcharge (50+ mi)</span>
                      <span>${deliveryQuote.long_haul_surcharge.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {deliveryQuote.extra_items_fee > 0 && <div className="flex justify-between"><span>Extra items ({(form.details?.quantity || 1) - 1})</span><span>${deliveryQuote.extra_items_fee.toFixed(2)}</span></div>}
                {deliveryQuote.weight_fee > 0 && <div className="flex justify-between"><span>Weight surcharge (over 5 lb)</span><span>${deliveryQuote.weight_fee.toFixed(2)}</span></div>}
                {deliveryQuote.fragile_multiplier > 1 && <div className="flex justify-between text-amber-700"><span>Fragile handling (+20%)</span><span>×{deliveryQuote.fragile_multiplier}</span></div>}
                <div className="flex justify-between font-display text-base font-black border-t border-teal-700/30 pt-2 mt-2 text-teal-900">
                  <span>Your price</span><span data-testid="delivery-quote-total">${deliveryQuote.total.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Calculated from the item, your pickup and drop-off addresses, and any extras. Sales tax (if any) is added at checkout.
              </p>
            </div>
          )}
          <Button
            type="submit"
            disabled={busy || ((isDeliveryCat || isMovingCat) && !(deliveryQuote || movingQuote))}
            className="w-full bg-slate-900 hover:bg-slate-800"
            data-testid="post-job-submit"
          >
            {busy ? "Posting…"
              : (isDeliveryCat && !deliveryQuote) ? "Enter pickup + drop-off addresses to see price"
              : (isMovingCat && !movingQuote) ? "Add details + addresses to see price"
              : "Post request"}
          </Button>
        </form>

        <div className="lg:col-span-7 space-y-8">
          <div>
            <div className="flex items-center justify-between">
              <div className="overline">Your service requests ({jobs.length})</div>
              <Link to="/marketplace" className="text-xs text-teal-700 underline">+ Post a marketplace listing</Link>
            </div>
            <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="my-jobs-list">
              {jobs.length === 0 && <div className="p-6 text-sm text-slate-500">No requests yet.</div>}
              {jobs.map((j) => (
                <div key={j.id} className="p-4 flex items-center gap-4" data-testid={`my-job-${j.id}`}>
                  <CategoryBadge group={j.category_group} isRemote={j.is_remote} />
                  <div className="flex-1">
                    <div className="font-display font-bold">{j.title}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">
                      ${j.pay_rate.toFixed(2)} / {j.pay_unit} · {j.status.toUpperCase()}
                      {j.provider_name && ` · ${j.provider_name}`}
                    </div>
                  </div>
                  {j.provider_id && j.status !== "completed" && (
                    <Link
                      to={`/jobs/${j.id}/track`}
                      className="text-[10px] font-mono uppercase tracking-wider border border-teal-700 bg-teal-700 text-white px-2.5 py-1.5 hover:bg-teal-800 whitespace-nowrap"
                      data-testid={`track-job-${j.id}`}
                    >
                      Track →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="overline">Your orders ({orders.length})</div>
            <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="my-orders-list">
              {orders.length === 0 && <div className="p-6 text-sm text-slate-500">No orders yet — shop the <Link className="underline text-teal-700" to="/stores">stores</Link> or <Link className="underline text-teal-700" to="/restaurants">restaurants</Link>.</div>}
              {orders.map((o) => (
                <div key={o.id} className="p-4" data-testid={`my-order-${o.id}`}>
                  <div className="flex items-center gap-4">
                    <div className="text-xs font-mono uppercase tracking-wider text-slate-500">{o.delivery_status || o.status}</div>
                    <div className="flex-1">
                      <div className="font-display font-bold">Order ${o.item_total.toFixed(2)} + ${o.delivery_fee.toFixed(2)} delivery</div>
                      <div className="text-xs text-slate-500 mt-1 font-mono">
                        Deposit paid ${o.deposit_total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <DeliveryActions
                    row={o} kind="order" viewerRole="customer"
                    onUpdated={(u) => setOrders((arr) => arr.map((x) => x.id === o.id ? { ...x, ...u } : x))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
