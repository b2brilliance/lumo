import React, { useEffect, useState } from "react";
import { api, ALL_CATEGORIES, LOCATION_COPY, locationModeFor, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import MediaUpload from "@/components/MediaUpload";
import AddressInput from "@/components/AddressInput";
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
    allowed_payment_methods: ["app", "cash", "card"],
    pickup_address: "", pickup_lat: null, pickup_lng: null,
    dropoff_address: "", dropoff_lat: null, dropoff_lng: null,
    media_url: null, media_type: null,
  });
  const locMode = locationModeFor(form.category);
  const locCopy = LOCATION_COPY[locMode];
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: j }, { data: o }] = await Promise.all([
      api.get(`/jobs?customer_id=${user.id}`),
      api.get(`/orders`),
    ]);
    setJobs(j); setOrders(o);
  };
  useEffect(() => { load(); }, [user.id]); // eslint-disable-next-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
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
      };
      if (locMode === "pickup_dropoff") {
        body.pickup_location = form.pickup_address ? { lat: form.pickup_lat ?? 40.7128, lng: form.pickup_lng ?? -74.006, address: form.pickup_address } : null;
        body.dropoff_location = form.dropoff_address ? { lat: form.dropoff_lat ?? 40.7128, lng: form.dropoff_lng ?? -74.006, address: form.dropoff_address } : null;
      } else if (locMode === "onsite") {
        body.pickup_location = form.pickup_address ? { lat: form.pickup_lat ?? 40.7128, lng: form.pickup_lng ?? -74.006, address: form.pickup_address } : null;
      }
      await api.post("/jobs", body);
      toast.success("Service request posted");
      setForm({ ...form, title: "", description: "", pay_rate: "", media_url: null, media_type: null });
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
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="overline">Pay rate ($)</Label>
              <Input type="number" step="0.01" value={form.pay_rate} onChange={(e) => set("pay_rate", e.target.value)} required data-testid="job-pay-rate" className="mt-1" />
            </div>
            <div>
              <Label className="overline">Est. units{form.pay_unit !== "flat" && ` (${form.pay_unit}s)`}</Label>
              <Input type="number" step="0.5" value={form.estimated_units} onChange={(e) => set("estimated_units", e.target.value)} disabled={form.pay_unit === "flat"} data-testid="job-estimated-units" className="mt-1" />
            </div>
          </div>
          {locMode === "pickup_dropoff" && (
            <div className="border-l-2 border-red-500 pl-3">
              <div className="overline text-red-700 mb-2">{locCopy.title}</div>
              <div className="space-y-3">
                <div>
                  <Label className="overline">{locCopy.pickup_label}</Label>
                  <div className="mt-1">
                    <AddressInput
                      value={form.pickup_address}
                      onChange={(v) => set("pickup_address", v)}
                      onPlace={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                      placeholder={locCopy.pickup_placeholder}
                      data-testid="job-pickup-address"
                    />
                  </div>
                </div>
                <div>
                  <Label className="overline">{locCopy.dropoff_label}</Label>
                  <div className="mt-1">
                    <AddressInput
                      value={form.dropoff_address}
                      onChange={(v) => set("dropoff_address", v)}
                      onPlace={(p) => setForm((f) => ({ ...f, dropoff_address: p.address, dropoff_lat: p.lat, dropoff_lng: p.lng }))}
                      placeholder={locCopy.dropoff_placeholder}
                      data-testid="job-dropoff-address"
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
                <div className="mt-1">
                  <AddressInput
                    value={form.pickup_address}
                    onChange={(v) => set("pickup_address", v)}
                    onPlace={(p) => setForm((f) => ({ ...f, pickup_address: p.address, pickup_lat: p.lat, pickup_lng: p.lng }))}
                    placeholder={locCopy.pickup_placeholder}
                    data-testid="job-service-address"
                    required
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
          <Button type="submit" disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="post-job-submit">
            {busy ? "Posting…" : "Post request"}
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
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="overline">Your orders ({orders.length})</div>
            <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="my-orders-list">
              {orders.length === 0 && <div className="p-6 text-sm text-slate-500">No orders yet — shop the <Link className="underline text-teal-700" to="/stores">stores</Link> or <Link className="underline text-teal-700" to="/restaurants">restaurants</Link>.</div>}
              {orders.map((o) => (
                <div key={o.id} className="p-4 flex items-center gap-4" data-testid={`my-order-${o.id}`}>
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-500">{o.status}</div>
                  <div className="flex-1">
                    <div className="font-display font-bold">Order ${o.item_total.toFixed(2)} + ${o.delivery_fee.toFixed(2)} delivery</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">
                      Deposit ${o.deposit_total.toFixed(2)} · Remaining ${o.remaining_total.toFixed(2)}
                    </div>
                  </div>
                  {o.status === "deposit_paid" || o.status === "in_progress" || o.status === "completed" ? (
                    <Link to={`/orders/${o.id}/pay`} className="text-xs underline text-teal-700" data-testid={`order-pay-final-${o.id}`}>Pay remaining →</Link>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
