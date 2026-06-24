import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RENTAL_CATEGORIES, RENTAL_PRICING_LABEL } from "@/lib/rentalCategories";
import { useLocale } from "@/lib/locale";
import { useAuth } from "@/lib/auth";
import { MapPin, ShieldCheck, Sparkles, ChevronLeft, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function RentalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { country, taxLabel, computeBreakdown } = useLocale();
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [form, setForm] = useState({ start_date: "", end_date: "", pricing_unit: "daily", notes: "" });

  useEffect(() => {
    api.get(`/rentals/${id}`).then(({ data }) => { setR(data); setLoading(false); }).catch(() => setLoading(false));
    api.get(`/rentals/${id}/blocked-dates`).then(({ data }) => setBlocked(data || [])).catch(() => {});
  }, [id]);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const isDateBlocked = (iso) => {
    if (!iso) return false;
    return blocked.some((b) => iso >= b.start_date && iso < b.end_date);
  };

  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;
  if (!r) return <div className="p-12 text-red-600">Rental not found.</div>;

  const photos = r.media && r.media.length > 0 ? r.media : (r.media_url ? [{ media_url: r.media_url, media_type: r.media_type }] : []);

  const cat = RENTAL_CATEGORIES[r.category] || {};
  const Icon = cat.icon;
  const pricingUnits = Object.entries(r.pricing || {}).filter(([k, v]) => k !== "security_deposit" && typeof v === "number");
  const securityDeposit = r.pricing?.security_deposit || 0;
  const unitPrice = form.pricing_unit && r.pricing?.[form.pricing_unit];
  const days = (form.start_date && form.end_date) ? Math.max(1, Math.floor((new Date(form.end_date) - new Date(form.start_date)) / 86400000)) : 1;
  const qty = form.pricing_unit === "hourly" ? days * 24 : form.pricing_unit === "weekly" ? Math.max(1, Math.floor(days / 7)) : form.pricing_unit === "monthly" ? Math.max(1, Math.floor(days / 30)) : days;
  const subtotal = unitPrice ? +(unitPrice * qty).toFixed(2) : 0;
  const breakdown = computeBreakdown(subtotal, 0);
  const totalDueNow = +(breakdown.itemDeposit + breakdown.tax + securityDeposit).toFixed(2);
  const remaining = +(subtotal - breakdown.itemDeposit).toFixed(2);

  const submit = async () => {
    if (!user || user === false) { window.location.href = "/login"; return; }
    if (!form.start_date || !form.end_date) { toast.error("Pick dates first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/rentals/${r.id}/book`, {
        rental_id: r.id,
        start_date: form.start_date,
        end_date: form.end_date,
        pricing_unit: form.pricing_unit,
        notes: form.notes,
        origin_url: window.location.origin,
        country,
      });
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.success("Request sent — the owner will get back to you.");
        setOpen(false);
      }
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-10">
      <Link to={`/rentals?category=${r.category}`} className="inline-flex items-center gap-1 text-sm font-mono text-slate-500 hover:text-slate-900" data-testid="rental-back">
        <ChevronLeft className="w-3.5 h-3.5" /> {cat.label || "Back"}
      </Link>

      <div className="grid lg:grid-cols-12 gap-10 mt-4">
        <div className="lg:col-span-7">
          {photos.length > 0 ? (
            <>
              <div className="aspect-[16/10] bg-slate-100 overflow-hidden relative" data-testid="rental-gallery-main">
                {(() => {
                  const p = photos[activePhoto] || photos[0];
                  const url = p.media_url?.startsWith("http") ? p.media_url : `${BACKEND_URL}${p.media_url}`;
                  return p.media_type?.startsWith("video")
                    ? <video src={url} className="w-full h-full object-cover" controls />
                    : <img src={url} alt="" className="w-full h-full object-cover" />;
                })()}
                {photos.length > 1 && (
                  <div className="absolute bottom-3 right-3 text-[10px] font-mono uppercase tracking-widest bg-slate-900/80 text-white px-2 py-1">
                    {activePhoto + 1} / {photos.length}
                  </div>
                )}
              </div>
              {photos.length > 1 && (
                <div className="grid grid-cols-6 gap-2 mt-2" data-testid="rental-gallery-thumbs">
                  {photos.map((p, i) => {
                    const u = p.media_url?.startsWith("http") ? p.media_url : `${BACKEND_URL}${p.media_url}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePhoto(i)}
                        className={`aspect-square overflow-hidden border-2 ${i === activePhoto ? "border-slate-900" : "border-transparent hover:border-slate-300"}`}
                        data-testid={`rental-thumb-${i}`}
                      >
                        <img src={u} alt="" className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className={`aspect-[16/10] flex items-center justify-center ${cat.color || "bg-slate-100"}`}>
              {Icon && <Icon className="w-24 h-24 opacity-40" />}
            </div>
          )}
          <div className="mt-6">
            <div className="overline">{cat.label}</div>
            <h1 className="font-display text-4xl font-black tracking-tighter mt-2">{r.title}</h1>
            {r.location?.address && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600 mt-3">
                <MapPin className="w-4 h-4" />{r.location.address}
              </div>
            )}
            {r.description && (
              <p className="text-slate-700 mt-5 text-base leading-relaxed max-w-2xl">{r.description}</p>
            )}
            {r.attributes && Object.keys(r.attributes).length > 0 && (
              <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(r.attributes).map(([k, v]) => (
                  <div key={k} className="border border-slate-200 p-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{k.replace(/_/g, " ")}</div>
                    <div className="text-sm font-display font-bold mt-1">
                      {Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-8 text-xs font-mono text-slate-500">
              Host: <span className="text-slate-900">{r.owner_name}</span>
              {r.host_verification_required && <span className="ml-3 inline-flex items-center gap-1 text-teal-700"><ShieldCheck className="w-3 h-3" />ID-verified host required</span>}
            </div>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="border border-slate-200 p-6 sticky top-24" data-testid="rental-book-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-display text-3xl font-black tracking-tighter">
                  ${pricingUnits[0]?.[1]}<span className="text-xs font-mono text-slate-500 ml-1">{RENTAL_PRICING_LABEL[pricingUnits[0]?.[0]] || ""}</span>
                </div>
                <div className="text-xs font-mono text-slate-500 mt-1">
                  {r.booking_mode === "instant" ? "⚡ Instant book" : "Request to book"}
                </div>
              </div>
              {securityDeposit > 0 && (
                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase text-slate-500">refundable</div>
                  <div className="font-mono text-sm">${securityDeposit} deposit</div>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div>
                <Label className="overline">Start</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isDateBlocked(v)) { toast.error("That date is already booked. Pick another."); return; }
                    setForm({ ...form, start_date: v });
                  }}
                  className="mt-1"
                  data-testid="rental-start-date"
                />
              </div>
              <div>
                <Label className="overline">End</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isDateBlocked(v)) { toast.error("That date is already booked. Pick another."); return; }
                    setForm({ ...form, end_date: v });
                  }}
                  className="mt-1"
                  data-testid="rental-end-date"
                />
              </div>
            </div>
            {blocked.length > 0 && (
              <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-amber-700 border border-amber-200 bg-amber-50 px-2 py-1.5" data-testid="rental-blocked-dates">
                {blocked.length} booked range{blocked.length === 1 ? "" : "s"} ·{" "}
                {blocked.slice(0, 3).map((b) => `${b.start_date}→${b.end_date}`).join(", ")}
                {blocked.length > 3 ? ` +${blocked.length - 3} more` : ""}
              </div>
            )}
            <div className="mt-3">
              <Label className="overline">Pricing</Label>
              <Select value={form.pricing_unit} onValueChange={(v) => setForm({ ...form, pricing_unit: v })}>
                <SelectTrigger className="mt-1" data-testid="rental-pricing-unit"><SelectValue placeholder="Pick unit" /></SelectTrigger>
                <SelectContent>
                  {pricingUnits.map(([u, p]) => (
                    <SelectItem key={u} value={u}>${p} {RENTAL_PRICING_LABEL[u] || `/${u}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.start_date && form.end_date && unitPrice && (
              <div className="mt-5 border-t border-slate-200 pt-4 font-mono text-sm space-y-1" data-testid="rental-breakdown">
                <div className="flex justify-between"><span>${unitPrice} × {qty} {form.pricing_unit}</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-teal-700"><span>10% Lumo deposit</span><span>${breakdown.itemDeposit.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>{taxLabel}</span><span>${breakdown.tax.toFixed(2)}</span></div>
                {securityDeposit > 0 && (
                  <div className="flex justify-between"><span>Security deposit (refundable)</span><span>${securityDeposit.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-2 text-base">
                  <span>Pay now</span><span data-testid="rental-pay-now">${totalDueNow.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500"><span>Remaining due at pickup</span><span>${remaining.toFixed(2)}</span></div>
              </div>
            )}

            <Button
              onClick={() => setOpen(true)}
              disabled={!form.start_date || !form.end_date || !unitPrice}
              className="w-full mt-5 bg-slate-900 hover:bg-slate-800 text-white"
              data-testid="rental-book-btn"
            >
              <Calendar className="w-4 h-4 mr-1.5" /> {r.booking_mode === "instant" ? "Reserve" : "Request to book"}
            </Button>
            {r.booking_mode === "request" && (
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-3 text-center">Owner approves before you pay</p>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="rental-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Confirm your booking</DialogTitle>
            <DialogDescription>{r.title} · {form.start_date} → {form.end_date}</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="overline">Note to host (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="When you'll pick up, who's coming, etc." className="mt-1" />
          </div>
          <div className="mt-3 bg-slate-50 border border-slate-200 p-3 font-mono text-xs space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>{taxLabel}</span><span>${breakdown.tax.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>10% Lumo deposit</span><span>${breakdown.itemDeposit.toFixed(2)}</span></div>
            {securityDeposit > 0 && <div className="flex justify-between"><span>Security deposit</span><span>${securityDeposit.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold border-t border-slate-300 pt-1 mt-1 text-sm"><span>Pay now</span><span>${totalDueNow.toFixed(2)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="rental-confirm-submit">
              {busy ? "Redirecting…" : (r.booking_mode === "instant" ? "Pay & reserve" : "Send request")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
