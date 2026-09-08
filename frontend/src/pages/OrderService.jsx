import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, MapPin, Clock, Sparkles, CheckCircle2, Check,
  Truck, Wrench, PawPrint, Baby, Scissors, Laptop, HardHat,
  Car, GraduationCap, Camera, ShieldCheck,
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

/* ─────────────────────────────────────────────────────────────────
 * OrderService — Uber-styled 4-step request wizard.
 *
 *   Step 1 : Category   (skipped when /order/:service is deep-linked)
 *   Step 2 : Details    (schema-driven per category)
 *   Step 3 : Dispatch   (where + when)
 *   Step 4 : Summary    (review + deposit note + submit)
 *
 * Deposit language is intentionally low-key — it only appears on
 * Step 4 (the confirm screen). The homepage / marketing surfaces
 * no longer advertise "10% deposit" heavily.
 * ────────────────────────────────────────────────────────────── */

const SERVICE_META = {
  delivery:        { label: "Delivery",         Icon: Truck,            blurb: "Move a package across town, same day.",       cta: "Send request" },
  courier:         { label: "Same-day courier", Icon: Truck,            blurb: "Sensitive or urgent — hand-carried A → B.",   cta: "Send request" },
  moving:          { label: "Moving help",      Icon: HardHat,          blurb: "Load, drive, unload. Furniture-friendly.",    cta: "Send request" },
  ride_share:      { label: "Rides",            Icon: Car,              blurb: "Any distance, driver picks you up.",          cta: "Send request" },
  towing:          { label: "Towing",           Icon: Truck,            blurb: "Full tows, breakdowns, long-distance.",       cta: "Send request" },
  roadside:        { label: "Roadside",         Icon: Zap,              blurb: "Jump-starts, tires, lockouts, fuel.",         cta: "Send request" },
  handyman:        { label: "Handyman",         Icon: Wrench,           blurb: "Repairs, mounting, assembly.",                cta: "Send request" },
  cleaning:        { label: "Cleaning",         Icon: Sparkles,         blurb: "House, apartment, or deep clean.",            cta: "Send request" },
  landscaping:     { label: "Landscaping",      Icon: Sparkles,         blurb: "Lawn, hedges, seasonal cleanups.",            cta: "Send request" },
  auto:            { label: "Mobile mechanic",  Icon: Wrench,           blurb: "Mechanic comes to you.",                      cta: "Send request" },
  pet_care:        { label: "Pet care",         Icon: PawPrint,         blurb: "Walking, sitting, grooming, boarding.",       cta: "Send request" },
  personal_care:   { label: "Beauty",           Icon: Scissors,         blurb: "Hair, nails, makeup — to your door.",         cta: "Send request" },
  medical:         { label: "In-home care",     Icon: ShieldCheck,      blurb: "Elder care, nursing, PT visits.",             cta: "Send request" },
  events:          { label: "Events",           Icon: Camera,           blurb: "Photographers, catering, staff.",             cta: "Send request" },
  notary:          { label: "Notary",           Icon: Building2,        blurb: "Mobile notary anywhere.",                     cta: "Send request" },
  it_support:      { label: "IT & tech support",Icon: Laptop,           blurb: "Wi-Fi, printers, smart home.",                cta: "Send request" },
  errand:          { label: "Errands",          Icon: Truck,            blurb: "Pickup, drop-off, waiting in line.",          cta: "Send request" },
  appliance_repair:{ label: "Appliance repair", Icon: Wrench,           blurb: "Fridge, washer, dryer, HVAC.",                cta: "Send request" },
  locksmith:       { label: "Locksmith",        Icon: KeyRound,         blurb: "Locked out? Rekey? Emergency.",               cta: "Send request" },
  security:        { label: "Security",         Icon: ShieldCheck,      blurb: "Event / personal security.",                  cta: "Send request" },
  auto_detailing:  { label: "Auto detailing",   Icon: Car,              blurb: "Mobile interior + exterior detail.",          cta: "Send request" },
  digital_tech:    { label: "Tech freelance",   Icon: Laptop,           blurb: "Website, app, script — hire a builder.",      cta: "Send request" },
  legal:           { label: "Legal help",       Icon: ShieldCheck,      blurb: "Consult, notarize, or document help.",        cta: "Send request" },
  other:           { label: "Custom request",   Icon: Zap,              blurb: "Not on the list? Describe what you need.",    cta: "Send request" },
};

function metaFor(service) {
  return SERVICE_META[service] || { label: "Service request", Icon: Zap, blurb: "Tell us what you need — we'll dispatch.", cta: "Send request" };
}

const POPULAR_CATEGORIES = [
  "delivery", "moving", "cleaning", "handyman", "auto", "roadside",
  "pet_care", "landscaping", "personal_care", "it_support", "notary", "errand",
];

// Field-level validators per step.
function step2Valid(cat, form) {
  const schema = form.details?.subcategory;
  if (!schema) return false;
  if (form.details?.subcategory === "other" && !form.details?.other_description) return false;
  return true;
}
function step3Valid(cat, form) {
  const mode = locationModeFor(cat);
  if (mode === "remote") {
    if (form.when === "later" && !form.schedule_at) return false;
    return true;
  }
  if (!form.pickup_address) return false;
  if (mode === "pickup_dropoff" && !form.dropoff_address) return false;
  if (form.when === "later" && !form.schedule_at) return false;
  return true;
}

export default function OrderService() {
  const { service } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const { taxLabel, computeBreakdown } = useLocale() || {};

  // Resolve category from URL. If none provided → start on Step 1.
  const paramCat = useMemo(() => {
    const found = ALL_CATEGORIES.find((c) => c.value === service);
    return found?.value || null;
  }, [service]);

  const [step, setStep] = useState(paramCat ? 2 : 1);
  const [cat, setCat] = useState(paramCat || "");
  const meta = metaFor(cat);
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

  // Keep step + category in sync if URL changes.
  useEffect(() => {
    if (paramCat) {
      setCat(paramCat);
      setStep((s) => (s === 1 ? 2 : s));
    }
  }, [paramCat]);

  const locMode = locationModeFor(cat);
  const locCopy = locationLabelsFor(cat, form.details?.subcategory) || LOCATION_COPY[locMode];

  // ── Auto-quote (delivery / moving / market) ───────────────────
  const isDelivery = cat === "delivery" || cat === "courier";
  const isMoving = cat === "moving";
  const deliveryQuote = useMemo(() => {
    if (!isDelivery) return null;
    if (form.pickup_lat == null || form.dropoff_lat == null) return null;
    const miles = milesBetween(
      { lat: form.pickup_lat, lng: form.pickup_lng },
      { lat: form.dropoff_lat, lng: form.dropoff_lng },
    );
    return computeDeliveryQuote({
      miles,
      item_size: form.details?.item_size || "other",
      quantity: form.details?.quantity || 1,
      weight_estimate: form.details?.weight_estimate || 0,
      fragile: form.details?.fragile === "yes",
    });
  }, [isDelivery, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng, form.details]);

  const movingQuote = useMemo(() => {
    if (!isMoving) return null;
    const sub = form.details?.subcategory;
    if (sub && sub !== "labor" && (form.pickup_lat == null || form.dropoff_lat == null)) return null;
    const miles = form.pickup_lat != null && form.dropoff_lat != null
      ? milesBetween({ lat: form.pickup_lat, lng: form.pickup_lng }, { lat: form.dropoff_lat, lng: form.dropoff_lng })
      : 0;
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
  }, [isMoving, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng, form.details]);

  const marketQuote = useMemo(() => {
    if (!cat || isDelivery || isMoving) return null;
    return computeMarketQuote(cat, form.details || {}, {
      miles: form.pickup_lat != null && form.dropoff_lat != null
        ? milesBetween({ lat: form.pickup_lat, lng: form.pickup_lng }, { lat: form.dropoff_lat, lng: form.dropoff_lng })
        : 0,
    });
  }, [cat, isDelivery, isMoving, form.details, form.pickup_lat, form.pickup_lng, form.dropoff_lat, form.dropoff_lng]);

  const activeQuote = deliveryQuote || movingQuote || marketQuote;
  const priceNum = activeQuote?.total > 0 ? activeQuote.total : parseFloat(form.pay_rate || "0");
  const breakdown = priceNum > 0 ? computeBreakdown?.(priceNum, 0) : null;
  const depositAmount = priceNum > 0 ? Math.max(1, priceNum * 0.10) : 0;

  useEffect(() => {
    if (activeQuote?.total > 0) {
      const rounded = activeQuote.total.toFixed(2);
      setForm((f) => (f.pay_rate === rounded ? f : { ...f, pay_rate: rounded }));
    }
  }, [activeQuote?.total]);

  const pickCategory = (value) => {
    setCat(value);
    setForm((f) => ({ ...f, details: {} }));
    nav(`/order/${value}`, { replace: true });
    setStep(2);
  };

  const goBack = () => {
    if (step === 1) { nav(-1); return; }
    if (step === 2 && paramCat) { nav(-1); return; }
    setStep((s) => Math.max(1, s - 1));
  };

  const goNext = () => {
    if (step === 2 && !step2Valid(cat, form)) {
      toast.error("Pick a subcategory to continue.");
      return;
    }
    if (step === 3 && !step3Valid(cat, form)) {
      const mode = locMode;
      toast.error(mode === "pickup_dropoff" ? "Both pickup and drop-off addresses required." : "Add an address to continue.");
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const submit = async () => {
    if (!user) { nav("/signin", { state: { from: `/order/${cat}` } }); return; }
    setBusy(true);
    try {
      const body = {
        title: form.title || meta.label,
        description: form.description || `${meta.label} request via Lumo`,
        category: cat,
        pay_rate: priceNum || 1,
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
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-20 text-center" data-testid="order-success">
        <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-9 h-9" strokeWidth={2} />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-6">Request sent.</h1>
        <p className="text-neutral-600 mt-3 leading-relaxed">
          Nearby providers can now see your {meta.label.toLowerCase()} request. You'll get a notification the moment someone accepts — no charge until then.
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <Link to="/customer" className="btn-lumo btn-lumo-primary btn-lumo-lg" data-testid="order-see-requests">
            See my requests
          </Link>
          <Link to="/" className="text-neutral-500 hover:text-black text-sm underline underline-offset-4">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen" data-testid={`order-page-${cat || "root"}`}>
      <Helmet>
        <title>{`${meta.label} — book on Lumo`}</title>
        <meta name="description" content={meta.blurb} />
      </Helmet>

      {/* Header */}
      <section className="border-b border-neutral-200 sticky top-16 bg-white z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={goBack}
            className="p-2 -ml-2 hover:bg-neutral-100 rounded-full transition-colors"
            aria-label="Back"
            data-testid="order-back"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="overline text-[10px]" data-testid="order-step-indicator">
              Step {step} of 4 · {cat ? meta.label : "Choose a service"}
            </div>
            <StepDots current={step} />
          </div>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-32 pt-8" data-testid="order-form">
        {step === 1 && (
          <Step1Category onPick={pickCategory} />
        )}
        {step === 2 && cat && (
          <Step2Details
            cat={cat}
            meta={meta}
            form={form}
            setForm={setForm}
          />
        )}
        {step === 3 && cat && (
          <Step3Dispatch
            cat={cat}
            locMode={locMode}
            locCopy={locCopy}
            form={form}
            setForm={setForm}
          />
        )}
        {step === 4 && cat && (
          <Step4Summary
            meta={meta}
            cat={cat}
            form={form}
            activeQuote={activeQuote}
            breakdown={breakdown}
            depositAmount={depositAmount}
            taxLabel={taxLabel}
            locMode={locMode}
          />
        )}
      </div>

      {/* Sticky footer CTA */}
      {step > 1 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white z-30" data-testid="order-footer-cta">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            {step < 4 ? (
              <button
                onClick={goNext}
                className="btn-lumo btn-lumo-primary btn-lumo-lg flex-1"
                data-testid="order-next"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={busy}
                className="btn-lumo btn-lumo-primary btn-lumo-lg flex-1"
                data-testid="order-submit"
              >
                {busy ? "Sending…" : meta.cta}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 1: Category picker ────────────────────────────────── */
function Step1Category({ onPick }) {
  const items = POPULAR_CATEGORIES.map((v) => ({ ...metaFor(v), value: v }));
  return (
    <div data-testid="order-step-1">
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
        What do you need help with?
      </h1>
      <p className="text-neutral-500 mt-2">Pick a service. You can be specific on the next step.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8">
        {items.map((it) => {
          const Icon = it.Icon;
          return (
            <button
              key={it.value}
              onClick={() => onPick(it.value)}
              className="group text-left border border-neutral-200 rounded-xl p-4 hover:border-black hover:shadow-lg transition-all bg-white"
              data-testid={`order-category-${it.value}`}
            >
              <div className="w-10 h-10 rounded-full bg-neutral-100 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center">
                <Icon className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="font-display font-semibold text-base mt-3">{it.label}</div>
              <div className="text-xs text-neutral-500 mt-1 leading-snug line-clamp-2">{it.blurb}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-neutral-200">
        <div className="overline mb-2">Don't see it?</div>
        <button
          onClick={() => onPick("other")}
          className="btn-lumo btn-lumo-outline"
          data-testid="order-category-other"
        >
          Describe a custom request
        </button>
      </div>
    </div>
  );
}

/* ─── Step 2: Details ─────────────────────────────────────────── */
function Step2Details({ cat, meta, form, setForm }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div data-testid="order-step-2">
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Tell us the details</h1>
      <p className="text-neutral-500 mt-2">The clearer you are, the faster you'll get accepted.</p>

      <div className="mt-8 space-y-5">
        <div>
          <label className="overline mb-2 block">Short title</label>
          <Input
            type="text"
            placeholder={`e.g. ${meta.label} for tomorrow morning`}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="h-12 rounded-lg"
            data-testid="order-title"
          />
        </div>
        <div>
          <label className="overline mb-2 block">Describe what you need</label>
          <Textarea
            rows={4}
            placeholder="Add any specifics — timing, access, materials, preferences."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="rounded-lg"
            data-testid="order-description"
          />
        </div>
        <ServiceDetailsForm
          category={cat}
          details={form.details || {}}
          onChange={(details) => setForm((f) => ({ ...f, details }))}
        />
      </div>
    </div>
  );
}

/* ─── Step 3: Dispatch (where + when) ────────────────────────── */
function Step3Dispatch({ cat, locMode, locCopy, form, setForm }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const showDropoff = locMode === "pickup_dropoff";
  const showAddress = locMode === "pickup_dropoff" || locMode === "onsite";

  return (
    <div data-testid="order-step-3">
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
        {showAddress ? "Where and when?" : "When?"}
      </h1>
      <p className="text-neutral-500 mt-2">
        {showAddress
          ? "We'll match with providers near you first."
          : "Providers work remotely — just tell us the timing."}
      </p>

      <div className="mt-8 space-y-6">
        {showAddress && (
          <div className="space-y-4" data-testid="order-address-block">
            <div>
              <label className="overline mb-2 block">
                {locCopy?.pickup_label || (showDropoff ? "Pickup address" : "Service address")}
              </label>
              <AddressInput
                value={form.pickup_address}
                onChange={(v) => set("pickup_address", v)}
                onPlace={({ address, lat, lng }) => setForm((f) => ({ ...f, pickup_address: address, pickup_lat: lat, pickup_lng: lng }))}
                placeholder={locCopy?.pickup_placeholder || "Start typing your address"}
                data-testid="order-pickup-address"
              />
            </div>
            {showDropoff && (
              <div>
                <label className="overline mb-2 block">
                  {locCopy?.dropoff_label || "Drop-off address"}
                </label>
                <AddressInput
                  value={form.dropoff_address}
                  onChange={(v) => set("dropoff_address", v)}
                  onPlace={({ address, lat, lng }) => setForm((f) => ({ ...f, dropoff_address: address, dropoff_lat: lat, dropoff_lng: lng }))}
                  placeholder={locCopy?.dropoff_placeholder || "Where should it go?"}
                  data-testid="order-dropoff-address"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="overline mb-2 block">When?</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => set("when", "now")}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                form.when === "now"
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
              data-testid="order-when-now"
            >
              <Zap className={`w-5 h-5 ${form.when === "now" ? "text-white" : "text-black"}`} strokeWidth={2} />
              <div className="font-display font-semibold text-base mt-2">Now</div>
              <div className={`text-xs mt-0.5 ${form.when === "now" ? "text-white/70" : "text-neutral-500"}`}>
                Providers respond in minutes
              </div>
            </button>
            <button
              type="button"
              onClick={() => set("when", "later")}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                form.when === "later"
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
              data-testid="order-when-later"
            >
              <Clock className={`w-5 h-5 ${form.when === "later" ? "text-white" : "text-black"}`} strokeWidth={2} />
              <div className="font-display font-semibold text-base mt-2">Schedule</div>
              <div className={`text-xs mt-0.5 ${form.when === "later" ? "text-white/70" : "text-neutral-500"}`}>
                Pick a specific time
              </div>
            </button>
          </div>
          {form.when === "later" && (
            <Input
              type="datetime-local"
              value={form.schedule_at}
              onChange={(e) => set("schedule_at", e.target.value)}
              className="mt-3 h-12 rounded-lg"
              data-testid="order-schedule-at"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Step 4: Summary + submit ───────────────────────────────── */
function Step4Summary({ meta, cat, form, activeQuote, breakdown, depositAmount, taxLabel, locMode }) {
  const scheduled = form.when === "later" && form.schedule_at;
  return (
    <div data-testid="order-step-4">
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Review & confirm</h1>
      <p className="text-neutral-500 mt-2">Take a last look. You can go back to any step.</p>

      <div className="mt-8 space-y-3">
        <SummaryRow label="Service" value={meta.label} testId="summary-service" />
        {form.details?.subcategory && (
          <SummaryRow label="Subcategory" value={form.details.subcategory.replace(/_/g, " ")} testId="summary-subcategory" />
        )}
        {form.title && <SummaryRow label="Title" value={form.title} testId="summary-title" />}
        {form.description && <SummaryRow label="Description" value={form.description} testId="summary-description" />}
        {locMode !== "remote" && form.pickup_address && (
          <SummaryRow label={locMode === "pickup_dropoff" ? "Pickup" : "Address"} value={form.pickup_address} testId="summary-pickup" />
        )}
        {locMode === "pickup_dropoff" && form.dropoff_address && (
          <SummaryRow label="Drop-off" value={form.dropoff_address} testId="summary-dropoff" />
        )}
        <SummaryRow
          label="When"
          value={scheduled ? new Date(form.schedule_at).toLocaleString() : "As soon as possible"}
          testId="summary-when"
        />
      </div>

      {/* Price box */}
      <div className="mt-6 border border-neutral-200 rounded-xl p-5 bg-neutral-50" data-testid="summary-price-box">
        {activeQuote?.total > 0 ? (
          <>
            <div className="overline">Estimated total</div>
            <div className="font-display font-bold text-4xl tracking-tight mt-1" data-testid="summary-total">
              ${activeQuote.total.toFixed(2)}
            </div>
            {activeQuote.breakdown && (
              <div className="mt-4 space-y-1 text-sm text-neutral-700">
                {activeQuote.breakdown.map((row, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{row.label}</span>
                    <span className="font-mono">${Number(row.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {breakdown && (
              <div className="mt-4 pt-4 border-t border-neutral-200 space-y-1 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span><span className="font-mono">${breakdown.subtotal.toFixed(2)}</span>
                </div>
                {breakdown.tax > 0 && (
                  <div className="flex justify-between text-neutral-600">
                    <span>{taxLabel || "Tax"}</span><span className="font-mono">${breakdown.tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-black">
                  <span>Total</span><span className="font-mono">${breakdown.total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="overline">Pricing</div>
            <div className="text-base font-medium mt-2">Providers will quote you.</div>
            <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
              Because pricing depends on the specifics, nearby specialists will send you personalized quotes within minutes. You review and accept the one you like.
            </p>
          </>
        )}
      </div>

      {/* Low-key deposit note — only appears here on the confirm screen. */}
      <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-neutral-100 text-sm text-neutral-700" data-testid="summary-deposit-note">
        <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-black" strokeWidth={2} />
        <div>
          <span className="font-medium text-black">Nothing charged yet.</span>
          {" "}Once a provider accepts, you'll be asked to authorize a 10% escrow deposit
          {activeQuote?.total > 0 && depositAmount > 0 && (
            <> (about <span className="font-mono">${depositAmount.toFixed(2)}</span>)</>
          )}
          . The rest is paid when the job is complete.
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, testId }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-neutral-100 last:border-b-0" data-testid={testId}>
      <div className="overline min-w-[110px]">{label}</div>
      <div className="text-sm text-black break-words flex-1">{value}</div>
    </div>
  );
}

function StepDots({ current }) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className={`h-1 flex-1 rounded-full transition-all ${
            n <= current ? "bg-black" : "bg-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}
