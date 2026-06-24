import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import AddressInput from "@/components/AddressInput";
import MediaUpload from "@/components/MediaUpload";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import { RENTAL_CATEGORIES } from "@/lib/rentalCategories";
import { Sparkles, ChevronLeft, ChevronRight, KeyRound, Inbox, Check, X } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Category", "Photo & details", "Pricing & booking", "Location"];
const HIGH_VALUE = new Set(["property", "vehicles", "venues"]);

function StepDots({ step, count }) {
  return (
    <div className="flex items-center gap-1.5" data-testid="step-dots">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`h-1 w-10 ${i <= step ? "bg-slate-900" : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

function Wizard({ onDone }) {
  const nav = useNavigate();
  const { country } = useLocale();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    category: "",
    subcategory: "",
    title: "",
    description: "",
    media: [],                                    // array of { id, media_url, media_type }
    pricing: { hourly: "", daily: "", weekly: "", monthly: "", weekend: "", security_deposit: "" },
    booking_mode: "instant",
    attributes: {},
    address: "",
    lat: null, lng: null,
  });

  const cat = form.category && RENTAL_CATEGORIES[form.category];
  const requiresVerification = form.category && HIGH_VALUE.has(form.category);

  const canNext = () => {
    if (step === 0) return !!form.category;
    if (step === 1) return form.title.trim().length >= 4 && form.description.trim().length >= 10;
    if (step === 2) {
      const p = form.pricing;
      return ["hourly", "daily", "weekly", "monthly", "weekend"].some((k) => p[k] && parseFloat(p[k]) > 0);
    }
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const pricing = {};
      for (const k of ["hourly", "daily", "weekly", "monthly", "weekend", "security_deposit"]) {
        if (form.pricing[k] && parseFloat(form.pricing[k]) > 0) pricing[k] = parseFloat(form.pricing[k]);
      }
      const body = {
        category: form.category,
        subcategory: form.subcategory || null,
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.address ? { address: form.address, lat: form.lat, lng: form.lng } : null,
        media_url: form.media?.[0]?.media_url || null,
        media_type: form.media?.[0]?.media_type || null,
        media: (form.media || []).map((m) => ({ media_url: m.media_url, media_type: m.media_type, id: m.id })),
        pricing,
        attributes: form.attributes,
        booking_mode: form.booking_mode,
      };
      const { data } = await api.post("/rentals", body);
      if (data.status === "pending_host_verification") {
        toast.warning("Listing saved — needs an ID-verified host credential before going live.");
      } else {
        toast.success("Listing published!");
      }
      onDone?.();
      nav(`/rentals/${data.id}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-200 p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="overline">Step {step + 1} of {STEPS.length}</div>
          <h2 className="font-display text-2xl font-bold mt-1">{STEPS[step]}</h2>
        </div>
        <StepDots step={step} count={STEPS.length} />
      </div>

      <div className="mt-6 space-y-4">
        {step === 0 && (
          <div>
            <Label className="overline">Pick a category</Label>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(RENTAL_CATEGORIES).map(([k, c]) => {
                const Icon = c.icon;
                const active = form.category === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setForm({ ...form, category: k, subcategory: "" })}
                    className={`p-3 border text-left ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-900"}`}
                    data-testid={`host-cat-${k}`}
                  >
                    <Icon className="w-5 h-5 mb-2" />
                    <div className="font-display font-bold text-sm">{c.label}</div>
                    <div className={`text-[10px] mt-1 ${active ? "opacity-80" : "text-slate-500"}`}>{c.blurb}</div>
                  </button>
                );
              })}
            </div>
            {requiresVerification && (
              <div className="mt-4 text-xs font-mono uppercase tracking-widest text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2">
                ⚠ This category requires an ID/business credential verified on /credentials before your listing goes live.
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <>
            <div>
              <Label className="overline">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={`e.g. "${cat?.label === "Vehicles" ? "2023 Tesla Model 3 — Bay Area" : cat?.label === "Venues" ? "Riverside Wedding Venue" : "Sun-drenched Loft, Echo Park"}"`}
                className="mt-1"
                data-testid="host-title"
              />
            </div>
            <div>
              <Label className="overline">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What makes it great? Who is it for? What's included?"
                rows={5}
                className="mt-1"
                data-testid="host-description"
              />
            </div>
            <div>
              <Label className="overline">Subcategory (optional)</Label>
              <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                <SelectTrigger className="mt-1" data-testid="host-subcategory"><SelectValue placeholder="Pick a subcategory" /></SelectTrigger>
                <SelectContent>
                  {((cat?.label && (cat?.label || "").toLowerCase()) || "") &&
                    ["vacation_rental", "wedding_venue", "car", "construction", "camera_body", "camping", "sofa", "wheelchair", "tent", "self_storage", "portable_toilet"]
                      .map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="overline">Photos (up to 6 — first one is the cover)</Label>
              <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="host-media-grid">
                {form.media.map((m, i) => (
                  <div key={i} className="relative">
                    <MediaUpload
                      value={m}
                      onChange={(v) => {
                        const next = [...form.media];
                        if (!v.media_url) next.splice(i, 1);
                        else next[i] = v;
                        setForm({ ...form, media: next });
                      }}
                      label=""
                      aiCheck
                    />
                    {i === 0 && <span className="absolute top-2 left-2 text-[10px] font-mono uppercase tracking-widest bg-slate-900 text-white px-2 py-0.5">Cover</span>}
                  </div>
                ))}
                {form.media.length < 6 && (
                  <MediaUpload
                    value={null}
                    onChange={(v) => v.media_url && setForm({ ...form, media: [...form.media, v] })}
                    label=""
                    aiCheck={false}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <Label className="overline">Pricing — fill any that apply (USD)</Label>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                {["hourly", "daily", "weekly", "monthly", "weekend"].map((u) => (
                  <div key={u}>
                    <Label className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{u}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.pricing[u]}
                      onChange={(e) => setForm({ ...form, pricing: { ...form.pricing, [u]: e.target.value } })}
                      placeholder="$"
                      className="mt-1"
                      data-testid={`host-price-${u}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="overline">Security deposit (refundable, optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.pricing.security_deposit}
                onChange={(e) => setForm({ ...form, pricing: { ...form.pricing, security_deposit: e.target.value } })}
                placeholder="$"
                className="mt-1"
                data-testid="host-security-deposit"
              />
            </div>
            <div className="flex items-center justify-between border border-slate-200 p-3">
              <div>
                <div className="font-display font-bold text-sm">Instant book</div>
                <div className="text-xs text-slate-500">Renters can book without your approval. Recommended for repeat hosts.</div>
              </div>
              <Switch
                checked={form.booking_mode === "instant"}
                onCheckedChange={(v) => setForm({ ...form, booking_mode: v ? "instant" : "request" })}
                data-testid="host-booking-mode"
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <Label className="overline">Location / Address</Label>
              <div className="mt-1">
                <AddressInput
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                  onPlace={({ address, lat, lng }) => setForm((f) => ({ ...f, address, lat, lng }))}
                  placeholder="Where is this rental located?"
                />
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-4 text-sm">
              <div className="font-display font-bold mb-2">Ready to publish</div>
              <div className="font-mono text-xs space-y-1">
                <div>Category: <span className="text-slate-900">{cat?.label}</span></div>
                <div>Title: <span className="text-slate-900">{form.title}</span></div>
                <div>Pricing: <span className="text-slate-900">{Object.entries(form.pricing).filter(([k, v]) => k !== "security_deposit" && v).map(([k, v]) => `$${v}/${k}`).join(", ") || "—"}</span></div>
                <div>Booking: <span className="text-slate-900">{form.booking_mode === "instant" ? "⚡ Instant" : "Request to book"}</span></div>
                <div>Location: <span className="text-slate-900">{form.address || "(none)"}</span></div>
              </div>
              {requiresVerification && (
                <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-amber-700">⚠ Will be saved as pending until you have a verified credential</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)} data-testid="host-back">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="host-next">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy} className="bg-teal-700 hover:bg-teal-800 text-white" data-testid="host-publish">
            <Sparkles className="w-4 h-4 mr-1" /> {busy ? "Publishing…" : "Publish listing"}
          </Button>
        )}
      </div>
    </div>
  );
}

function BookingsInbox() {
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("pending_approval");

  const load = () => api.get("/rental-bookings/mine?role=owner").then(({ data }) => setBookings(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const filtered = bookings.filter((b) => filter === "all" || b.status === filter);

  const approve = async (id) => {
    try {
      await api.post(`/rental-bookings/${id}/approve`);
      toast.success("Approved — renter has been notified to pay.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const decline = async (id) => {
    try {
      await api.post(`/rental-bookings/${id}/decline`);
      toast.success("Declined");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div data-testid="bookings-inbox">
      <div className="flex items-center gap-2">
        <Inbox className="w-5 h-5 text-teal-700" />
        <h2 className="font-display text-2xl font-bold">Booking requests</h2>
      </div>
      <div className="flex gap-2 mt-4">
        {["pending_approval", "deposit_pending", "declined", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-mono uppercase tracking-wider px-3 py-1.5 border ${filter === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-700 hover:border-slate-900"}`}
            data-testid={`inbox-filter-${s}`}
          >
            {s.replace(/_/g, " ")} ({bookings.filter((b) => s === "all" || b.status === s).length})
          </button>
        ))}
      </div>
      <div className="mt-5 divide-y divide-slate-200 border-t border-b border-slate-200">
        {filtered.length === 0 && <div className="p-6 text-sm text-slate-500">No bookings in this state.</div>}
        {filtered.map((b) => (
          <div key={b.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`inbox-booking-${b.id}`}>
            <div className="col-span-12 md:col-span-4">
              <div className="font-display font-bold">{b.renter_name}</div>
              <div className="text-xs font-mono text-slate-500 mt-0.5">{b.start_date} → {b.end_date}</div>
              <Link to={`/rentals/${b.rental_id}`} className="text-xs text-teal-700 underline mt-0.5 inline-block">View listing</Link>
            </div>
            <div className="col-span-6 md:col-span-3 font-mono text-xs">
              <div>{b.quantity} {b.pricing_unit}</div>
              <div className="text-slate-500">subtotal ${Number(b.subtotal).toFixed(2)}</div>
            </div>
            <div className="col-span-6 md:col-span-3 font-mono text-xs">
              <div>{b.tax_label} ${Number(b.tax_amount).toFixed(2)}</div>
              <div className="text-slate-500">deposit ${Number(b.deposit_total).toFixed(2)}</div>
            </div>
            <div className="col-span-12 md:col-span-2 text-right flex flex-wrap justify-end gap-2">
              {b.status === "pending_approval" && (
                <>
                  <Button size="sm" onClick={() => approve(b.id)} className="bg-teal-700 hover:bg-teal-800 text-white h-7 px-3" data-testid={`inbox-approve-${b.id}`}>
                    <Check className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decline(b.id)} className="h-7 px-3" data-testid={`inbox-decline-${b.id}`}>
                    <X className="w-3 h-3 mr-1" /> Decline
                  </Button>
                </>
              )}
              {b.status !== "pending_approval" && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 border border-slate-200 px-2 py-1">{b.status.replace(/_/g, " ")}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyListings() {
  const [listings, setListings] = useState([]);
  const { user } = useAuth();
  useEffect(() => {
    if (!user || user === false) return;
    api.get(`/rentals?limit=200`).then(({ data }) => {
      setListings((data || []).filter((r) => r.owner_id === user.id));
    });
  }, [user]);
  if (listings.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl font-bold">Your listings ({listings.length})</h2>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map((r) => {
          const cat = RENTAL_CATEGORIES[r.category] || {};
          return (
            <Link to={`/rentals/${r.id}`} key={r.id} className="border border-slate-200 p-4 hover:border-slate-900 transition-colors" data-testid={`mylisting-${r.id}`}>
              <div className="overline">{cat.label}</div>
              <div className="font-display font-bold mt-1">{r.title}</div>
              {r.status !== "active" && (
                <div className="text-[10px] font-mono uppercase tracking-widest text-amber-700 mt-2 border border-amber-200 px-2 py-0.5 inline-block">
                  {r.status.replace(/_/g, " ")}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function RentalHost() {
  const { user } = useAuth();
  const [showWizard, setShowWizard] = useState(false);

  if (!user || user === false) {
    return (
      <div className="max-w-screen-md mx-auto px-6 py-16 text-center">
        <KeyRound className="w-16 h-16 mx-auto text-slate-300" />
        <h1 className="font-display text-3xl font-black tracking-tighter mt-4">List your rental</h1>
        <p className="text-slate-600 mt-3">Sign in to host a rental on Lumo.</p>
        <Link to="/login"><Button className="mt-5 bg-slate-900 hover:bg-slate-800 text-white">Sign in</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="overline">Host</div>
      <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
        <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Earn from what you own.</h1>
        {!showWizard && (
          <Button onClick={() => setShowWizard(true)} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="open-host-wizard">
            <Sparkles className="w-4 h-4 mr-1.5" /> List a rental
          </Button>
        )}
      </div>
      <p className="text-slate-600 mt-3 max-w-2xl">Turn your home, car, gear, or venue into income. Lumo handles payments, taxes, and a 10% bundled deposit. Set your own rates per hour, day, week, or month — accept instantly or review each request.</p>

      {showWizard && (
        <div className="mt-10">
          <Wizard onDone={() => setShowWizard(false)} />
        </div>
      )}

      <div className="mt-12">
        <BookingsInbox />
      </div>

      <MyListings />
    </div>
  );
}
