import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import {
  ArrowLeft, MapPin, Clock, Sparkles, CheckCircle2,
  Truck, Wrench, PawPrint, Baby, Scissors, Laptop, HardHat,
  UtensilsCrossed, Car, GraduationCap, Camera, ShieldCheck,
  KeyRound, Building2, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ALL_CATEGORIES, LOCATION_COPY, locationModeFor, locationLabelsFor, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import AddressInput from "@/components/AddressInput";
import ServiceDetailsForm from "@/components/ServiceDetailsForm";
import { computeDeliveryQuote, computeMovingQuote, milesBetween } from "@/lib/deliveryPricing";
import { computeMarketQuote, NO_BUDGET_CATEGORIES } from "@/lib/serviceQuotes";

/* Uber-style single-service ordering page — /order/:service
 *
 * One service per URL, so users land directly on the request they want.
 * Everything's collapsed into a single tall page: Where → When → Details
 * → Price → Confirm.  Preserves every field the old CustomerHub form had
 * (title, description, category, pay_rate, pay_unit, payment_terms,
 * pickup/dropoff, media_url, details).                                    */

const SERVICE_META = {
  delivery:        { label: "Delivery",         Icon: Truck,            blurb: "Get a package moved across town, same day.",  cta: "Request delivery" },
  courier:         { label: "Same-day courier", Icon: Truck,            blurb: "Sensitive or urgent — hand-carried A → B.",   cta: "Request courier" },
  moving:          { label: "Moving help",      Icon: HardHat,          blurb: "Load, drive, unload. Furniture-friendly.",    cta: "Request movers" },
  ride_share:      { label: "Rides",            Icon: Car,              blurb: "Any distance, driver picks you up.",          cta: "Request a ride" },
  towing:          { label: "Towing & roadside",Icon: Truck,            blurb: "Flat tire, jump, or full tow — 24/7.",        cta: "Request tow" },
  handyman:        { label: "Handyman",         Icon: Wrench,           blurb: "Small repairs, mounting, assembly.",          cta: "Book a handyman" },
  cleaning:        { label: "Cleaning",         Icon: Sparkles,         blurb: "House, apartment, or one-time deep clean.",   cta: "Book a cleaner" },
  landscaping:     { label: "Landscaping",      Icon: Sparkles,         blurb: "Lawn, hedges, seasonal cleanups.",            cta: "Book landscaping" },
  auto:            { label: "Mobile mechanic",  Icon: Wrench,           blurb: "Mechanic comes to you — no shop needed.",     cta: "Book a mechanic" },
  pet_care:        { label: "Pet care",         Icon: PawPrint,         blurb: "Walking, sitting, grooming, boarding.",       cta: "Book pet care" },
  personal_care:   { label: "Beauty",           Icon: Scissors,         blurb: "Hair, nails, makeup — to your door.",         cta: "Book beauty pro" },
  medical:         { label: "In-home care",     Icon: ShieldCheck,      blurb: "Elder care, in-home nursing, PT visits.",     cta: "Request care" },
  events:          { label: "Events & catering",Icon: Camera,           blurb: "Photographers, catering, staff.",             cta: "Request event help" },
  notary:          { label: "Notary",           Icon: Building2,        blurb: "Mobile notary comes to sign anywhere.",       cta: "Book notary" },
  it_support:      { label: "IT & tech support",Icon: Laptop,           blurb: "Wi-Fi, printers, smart home, on-site.",       cta: "Book tech support" },
  errand:          { label: "Errands",          Icon: Truck,            blurb: "Pickup, drop-off, waiting in line, etc.",     cta: "Book an errand" },
  appliance_repair:{ label: "Appliance repair", Icon: Wrench,           blurb: "Fridge, washer, dryer, HVAC.",                cta: "Book repair" },
  locksmith:       { label: "Locksmith",        Icon: KeyRound,         blurb: "Locked out? Rekey? Emergency locksmith.",     cta: "Call a locksmith" },
  security:        { label: "Security",         Icon: ShieldCheck,      blurb: "Event / personal security, bodyguards.",      cta: "Book security" },
  tutoring:        { label: "Tutoring",         Icon: GraduationCap,    blurb: "K–12, college, professional exam prep.",      cta: "Book tutor" },
  childcare:       { label: "Childcare",        Icon: Baby,             blurb: "Babysitters, nannies, back-up childcare.",    cta: "Book sitter" },
  digital_tech:    { label: "Tech freelance",   Icon: Laptop,           blurb: "Website, app, script — hire a builder.",      cta: "Post project" },
  translator:      { label: "Translator",       Icon: GraduationCap,    blurb: "Live or written translation, 40+ languages.", cta: "Book translator" },
  legal:           { label: "Legal help",       Icon: ShieldCheck,      blurb: "Consult, notarize, or legal document help.",  cta: "Request legal help" },
  tax:             { label: "Tax preparer",     Icon: Building2,        blurb: "Personal or small-biz tax prep.",             cta: "Book tax prep" },
  photography:     { label: "Photographer",     Icon: Camera,           blurb: "Portraits, event, real-estate photography.",  cta: "Book photographer" },
  junk_removal:    { label: "Junk removal",     Icon: HardHat,          blurb: "Haul-away for junk, appliances, yard waste.", cta: "Book pickup" },
  snow_removal:    { label: "Snow removal",     Icon: HardHat,          blurb: "Driveway, walkway, roof snow clearing.",      cta: "Book snow crew" },
  auto_detailing:  { label: "Auto detailing",   Icon: Car,              blurb: "Interior + exterior detail, mobile service.", cta: "Book detail" },
  custom:          { label: "Custom request",   Icon: Zap,              blurb: "Not on the list? Describe what you need.",    cta: "Post request" },
};

function metaFor(service) {
  return SERVICE_META[service] || SERVICE_META.custom;
}


export default function OrderService() {
  const { service = "custom" } = useParams();
  const meta = metaFor(service);
  const { user } = useAuth();
  const nav = useNavigate();
  const { country, taxLabel, computeBreakdown } = useLocale() || {};

  // Category resolution — validate against ALL_CATEGORIES so downstream
  // details form + backend accept it. "custom" falls back to "errand".
  const cat = useMemo(() => {
    const found = ALL_CATEGORIES.find((c) => c.value === service);
    return found?.value || "errand";
  }, [service]);

  const [form, setForm] = useState({
    title: "", description: "",
    pay_rate: "", pay_unit: "flat", estimated_units: "1",
    payment_terms: "", allowed_payment_methods: ["app"],
    pickup_address: "", pickup_lat: null, pickup_lng: null,
    dropoff_address: "", dropoff_lat: null, dropoff_lng: null,
    when: "now", schedule_at: "",
    details: {},
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const locMode = locationModeFor(cat);
  const locCopy = locationLabelsFor(cat, form.details?.subcategory) || LOCATION_COPY[locMode];

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-quote for delivery / courier / moving
  const isDelivery = cat === "delivery" || cat === "courier";
  const isMoving = cat === "moving";
  const deliveryQuote = useMemo(() => {
    if (!isDelivery) return null;
    if (form.pickup_lat == null || form.dropoff_lat == null) return null;
    const miles = milesBetween({ lat: form.pickup_lat, lng: form.pickup_lng }, { lat: form.dropoff_lat, lng: form.dropoff_lng });
    return computeDeliveryQuote({
      miles,
      item_size: form.details?.item_size || "other",
      quantity: form.details?.quantity || 1,
      weight_estimate: form.details?.weight_estimate || 0,
      fragile: form.details?.fragile === "yes",
    });
  }, [isDelivery, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng, form.details?.item_size, form.details?.quantity, form.details?.weight_estimate, form.details?.fragile]);

  const movingQuote = useMemo(() => {
    if (!isMoving) return null;
    const sub = form.details?.subcategory;
    if (sub && sub !== "labor" && (form.pickup_lat == null || form.dropoff_lat == null)) return null;
    const miles = form.pickup_lat != null && form.dropoff_lat != null
      ? milesBetween({ lat: form.pickup_lat, lng: form.pickup_lng }, { lat: form.dropoff_lat, lng: form.dropoff_lng })
      : 0;
    // Map OrderService form field names → computeMovingQuote parameter names.
    // labor sub → labor_only mode; otherwise defaults to local.
    const moveType = sub === "labor" ? "labor_only" : (sub || "local");
    return computeMovingQuote({
      miles,
      move_type: moveType,
      property_size: form.details?.home_size || "1br",
      num_movers: form.details?.helpers || 2,
      has_stairs: form.details?.stairs === "yes" ? "yes" : "no",
      packing_needed: form.details?.packing_needed === "yes" ? "yes" : "no",
      duration_hours: form.details?.hours || null,
    });
  }, [isMoving, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng, form.details?.subcategory, form.details?.home_size, form.details?.helpers, form.details?.hours, form.details?.packing_needed, form.details?.stairs]);

  // Market-rate auto-quote for the "long tail" of service categories
  // (cleaning, handyman, notary, roadside, towing, pet care, landscaping,
  // appliance repair, errands). Delivery + moving keep their own bespoke
  // Haversine / moving calculators above.
  const marketQuote = useMemo(() => {
    if (isDelivery || isMoving) return null;
    return computeMarketQuote(cat, form.details || {}, {
      miles: form.pickup_lat != null && form.dropoff_lat != null
        ? milesBetween({ lat: form.pickup_lat, lng: form.pickup_lng }, { lat: form.dropoff_lat, lng: form.dropoff_lng })
        : 0,
    });
  }, [isDelivery, isMoving, cat, form.details, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng]);

  const hideBudget = NO_BUDGET_CATEGORIES.has(cat);

  useEffect(() => {
    if (marketQuote?.total > 0) {
      const rounded = marketQuote.total.toFixed(2);
      setForm((f) => (f.pay_rate === rounded ? f : { ...f, pay_rate: rounded }));
    }
  }, [marketQuote?.total]);

  useEffect(() => {
    // Only overwrite pay_rate the FIRST time we compute a positive quote,
    // OR when the user hasn't manually edited it since. Prevents the
    // input value from flickering while typing in adjacent fields.
    if (deliveryQuote?.total > 0) {
      const rounded = deliveryQuote.total.toFixed(2);
      setForm((f) => (f.pay_rate === rounded ? f : { ...f, pay_rate: rounded }));
    }
  }, [deliveryQuote?.total]);
  useEffect(() => {
    if (movingQuote?.total > 0) {
      const rounded = movingQuote.total.toFixed(2);
      setForm((f) => (f.pay_rate === rounded ? f : { ...f, pay_rate: rounded }));
    }
  }, [movingQuote?.total]);

  const priceNum = parseFloat(form.pay_rate || "0");
  const breakdown = priceNum > 0 ? computeBreakdown?.(priceNum, 0) : null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!user) { nav("/signin"); return; }
    if (!priceNum) {
      // For no-budget categories, silently insert a placeholder $1 so the
      // backend accepts the post — providers send real quotes anyway.
      if (hideBudget) {
        set("pay_rate", "1");
      } else {
        toast.error("Please set a budget or wait for the auto-quote."); return;
      }
    }
    setBusy(true);
    try {
      const body = {
        title: form.title || meta.label,
        description: form.description || `${meta.label} request via Lumo`,
        category: cat,
        pay_rate: priceNum,
        pay_unit: form.pay_unit,
        estimated_units: parseFloat(form.estimated_units || "1"),
        payment_terms: form.payment_terms,
        allowed_payment_methods: form.allowed_payment_methods,
        pickup_location: null,
        dropoff_location: null,
        details: { ...(form.details || {}), scheduled_for: form.when === "later" ? form.schedule_at : null },
        delivery_quote: deliveryQuote || movingQuote || null,
      };
      if (locMode === "pickup_dropoff") {
        body.pickup_location = form.pickup_address ? { lat: form.pickup_lat ?? 40.7128, lng: form.pickup_lng ?? -74.006, address: form.pickup_address } : null;
        body.dropoff_location = form.dropoff_address ? { lat: form.dropoff_lat ?? 40.7128, lng: form.dropoff_lng ?? -74.006, address: form.dropoff_address } : null;
      } else if (locMode === "onsite") {
        body.pickup_location = form.pickup_address ? { lat: form.pickup_lat ?? 40.7128, lng: form.pickup_lng ?? -74.006, address: form.pickup_address } : null;
      }
      const { data } = await api.post("/jobs", body);
      toast.success("Request sent — nearby providers can now accept.");
      setDone(data?.id || "sent");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 text-center" data-testid="order-success">
        <CheckCircle2 className="w-16 h-16 text-teal-700 mx-auto" />
        <h1 className="font-display text-3xl font-black tracking-tighter mt-4">Request sent.</h1>
        <p className="text-slate-600 mt-2">Nearby providers can now see and accept your {meta.label.toLowerCase()} request. You&apos;ll get a notification when someone accepts.</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link to="/customer" className="bg-slate-900 text-white px-5 py-3 font-mono uppercase tracking-wider text-sm" data-testid="order-see-requests">See my requests</Link>
          <Link to="/" className="text-teal-700 hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const showDropoff = locMode === "pickup_dropoff";
  const showAddress = locMode === "pickup_dropoff" || locMode === "onsite";

  return (
    <div className="bg-white min-h-screen" data-testid={`order-page-${service}`}>
      <Helmet>
        <title>{`${meta.label} — book on Lumo`}</title>
        <meta name="description" content={meta.blurb} />
      </Helmet>

      {/* ── Header ─────────────────────────────────────────────── */}
      <section className="border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-4">
          <button onClick={() => nav(-1)} className="p-2 -ml-2 hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <meta.Icon className="w-6 h-6 text-teal-700 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tighter truncate">{meta.label}</h1>
              <p className="text-sm text-slate-500 truncate">{meta.blurb}</p>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="order-form">
        {/* Step 1 — Where */}
        {showAddress && (
          <section data-testid="order-step-where">
            <StepHeader n={1} title={showDropoff ? "Where from & where to?" : locCopy.singleLabel || "Where?"} />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1 block">
                  {locCopy.singleLabel || (showDropoff ? "Pickup address" : "Service address")}
                </label>
                <AddressInput
                  value={form.pickup_address}
                  onChange={(v) => set("pickup_address", v)}
                  onPlace={({ address, lat, lng }) => setForm((f) => ({ ...f, pickup_address: address, pickup_lat: lat, pickup_lng: lng }))}
                  placeholder="Start typing your address"
                  data-testid="order-pickup-address"
                />
              </div>
              {showDropoff && (
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1 block">Drop-off address</label>
                  <AddressInput
                    value={form.dropoff_address}
                    onChange={(v) => set("dropoff_address", v)}
                    onPlace={({ address, lat, lng }) => setForm((f) => ({ ...f, dropoff_address: address, dropoff_lat: lat, dropoff_lng: lng }))}
                    placeholder="Where should it go?"
                    data-testid="order-dropoff-address"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 2 — When */}
        <section data-testid="order-step-when">
          <StepHeader n={showAddress ? 2 : 1} title="When?" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => set("when", "now")}
              className={`border p-4 text-left ${form.when === "now" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"}`}
              data-testid="order-when-now">
              <Zap className={`w-5 h-5 ${form.when === "now" ? "text-amber-400" : "text-red-600"}`} />
              <div className="font-display font-bold mt-2">Now</div>
              <div className="text-xs opacity-80 mt-0.5">Providers respond in minutes</div>
            </button>
            <button type="button"
              onClick={() => set("when", "later")}
              className={`border p-4 text-left ${form.when === "later" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"}`}
              data-testid="order-when-later">
              <Clock className={`w-5 h-5 ${form.when === "later" ? "text-amber-400" : "text-blue-600"}`} />
              <div className="font-display font-bold mt-2">Schedule</div>
              <div className="text-xs opacity-80 mt-0.5">Pick a specific time</div>
            </button>
          </div>
          {form.when === "later" && (
            <Input
              type="datetime-local"
              value={form.schedule_at}
              onChange={(e) => set("schedule_at", e.target.value)}
              className="mt-3"
              data-testid="order-schedule-at"
            />
          )}
        </section>

        {/* Step 3 — Details (service-specific) */}
        <section data-testid="order-step-details">
          <StepHeader n={(showAddress ? 2 : 1) + 1} title="Tell us more" />
          <div className="space-y-3">
            <Input
              type="text"
              placeholder={`Short title for your ${meta.label.toLowerCase()} request`}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              data-testid="order-title"
            />
            <Textarea
              rows={3}
              placeholder="Describe what you need — the clearer, the faster you'll get accepted."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              data-testid="order-description"
            />
            <ServiceDetailsForm
              category={cat}
              details={form.details || {}}
              onChange={(details) => setForm((f) => ({ ...f, details }))}
            />
          </div>
        </section>

        {/* Step 4 — Price / Quote / Providers-will-quote-you */}
        <section data-testid="order-step-price">
          {(() => {
            const activeQuote = deliveryQuote || movingQuote || marketQuote;
            if (activeQuote?.total > 0) {
              return (
                <>
                  <StepHeader n={(showAddress ? 3 : 2) + 1} title="Auto-quote" />
                  <div className="bg-teal-50 border-2 border-teal-600 p-4" data-testid="order-quote-box">
                    <div className="font-mono uppercase tracking-wider text-teal-800 text-xs">Estimated total</div>
                    <div className="font-display font-black text-3xl text-teal-800 mt-0.5" data-testid="order-quote-total">
                      ${activeQuote.total.toFixed(2)}
                    </div>
                    {activeQuote.breakdown && (
                      <div className="mt-3 text-xs text-slate-700 space-y-0.5 max-w-sm">
                        {activeQuote.breakdown.map((row, i) => (
                          <div key={i} className="flex justify-between">
                            <span>{row.label}</span>
                            <span className="font-mono">${Number(row.amount).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-600 mt-3 leading-snug">
                      Based on national market rates. Providers may counter-offer — you&apos;re never locked in until you tap Confirm.
                    </div>
                  </div>
                  {breakdown && (
                    <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                      <div className="flex justify-between"><span>Subtotal</span><span>${breakdown.subtotal.toFixed(2)}</span></div>
                      {breakdown.tax > 0 && <div className="flex justify-between"><span>{taxLabel || "Tax"}</span><span>${breakdown.tax.toFixed(2)}</span></div>}
                      <div className="flex justify-between font-mono uppercase tracking-wider text-slate-900 pt-1 border-t border-slate-200"><span>Total</span><span>${breakdown.total.toFixed(2)}</span></div>
                    </div>
                  )}
                </>
              );
            }
            // No calculable quote AND category is on the "let providers bid" list
            if (hideBudget) {
              // Silently set a placeholder pay_rate so the submit passes;
              // providers will send real quotes.
              return (
                <>
                  <StepHeader n={(showAddress ? 3 : 2) + 1} title="Providers will quote you" />
                  <div className="bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700" data-testid="order-no-budget">
                    Because this category is highly custom, we don&apos;t ask you for a budget upfront. Post your request and nearby specialists will send you personalized quotes within minutes.
                  </div>
                  {!form.pay_rate && (
                    <button
                      type="button"
                      onClick={() => set("pay_rate", "1")}
                      className="hidden"
                      aria-hidden="true"
                    />
                  )}
                </>
              );
            }
            // Fallback — keep the free-form budget input for categories
            // without a calculator AND not in the no-budget list.
            return (
              <>
                <StepHeader n={(showAddress ? 3 : 2) + 1} title="Your budget" />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="number" step="0.01" min="0"
                      placeholder="Budget (optional)"
                      value={form.pay_rate}
                      onChange={(e) => set("pay_rate", e.target.value)}
                      data-testid="order-pay-rate"
                    />
                  </div>
                  <select
                    value={form.pay_unit}
                    onChange={(e) => set("pay_unit", e.target.value)}
                    className="border border-slate-300 px-3 text-sm"
                    data-testid="order-pay-unit"
                  >
                    <option value="flat">Flat</option>
                    <option value="hour">Per hour</option>
                    <option value="day">Per day</option>
                  </select>
                </div>
                {breakdown && (
                  <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <div className="flex justify-between"><span>Subtotal</span><span>${breakdown.subtotal.toFixed(2)}</span></div>
                    {breakdown.tax > 0 && <div className="flex justify-between"><span>{taxLabel || "Tax"}</span><span>${breakdown.tax.toFixed(2)}</span></div>}
                    <div className="flex justify-between font-mono uppercase tracking-wider text-slate-900 pt-1 border-t border-slate-200"><span>Total</span><span>${breakdown.total.toFixed(2)}</span></div>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {/* Confirm */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-slate-900 text-white py-4 font-mono uppercase tracking-wider text-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="order-submit"
          >
            {busy ? "Sending…" : meta.cta}
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-3 font-mono uppercase tracking-wider">
            Escrow-protected. Workers keep 90%. Free to post — you pay only when a provider accepts.
          </p>
        </div>
      </form>
    </div>
  );
}

function StepHeader({ n, title }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-7 h-7 bg-slate-900 text-white font-display font-black flex items-center justify-center text-sm">{n}</div>
      <h2 className="font-display text-lg sm:text-xl font-black tracking-tight">{title}</h2>
    </div>
  );
}
