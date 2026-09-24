import React, { useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Camera, CheckCircle2, AlertTriangle, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

const PHYSICAL = new Set(["delivery", "courier", "moving", "towing"]);
const MAX_PHOTOS = 3;
const MAX_BYTES = 900_000;

const fmtRelative = (iso) => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

/**
 * Drop-in UI for the escrow + proof-of-delivery flow on a job OR an order.
 *
 * Props:
 *   row              — the job/order document
 *   kind             — "job" | "order"
 *   viewerRole       — "provider" | "customer"
 *   onUpdated(row)   — called with the patched document after any action
 */
export default function DeliveryActions({ row, kind, viewerRole, onUpdated }) {
  const endpoint = kind === "order" ? "/orders" : "/jobs";
  const isPhysical = kind === "order" || PHYSICAL.has(row.category);
  const photosRequired = isPhysical;
  const status = row.delivery_status;

  const [provDlg, setProvDlg] = useState(false);
  const [disputeDlg, setDisputeDlg] = useState(false);
  const [photoFull, setPhotoFull] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);   // [{ name, dataUrl }]
  const [note, setNote] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const fileRef = useRef(null);

  const readFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const onPickFiles = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    const next = [...photos];
    for (const f of list) {
      if (next.length >= MAX_PHOTOS) { toast.error(`Max ${MAX_PHOTOS} photos.`); break; }
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is over 900 KB. Pick a smaller photo or shrink it.`);
        continue;
      }
      try { next.push({ name: f.name, dataUrl: await readFile(f) }); }
      catch { toast.error(`Couldn't read ${f.name}`); }
    }
    setPhotos(next);
    e.target.value = "";
  };

  const submitDelivered = async () => {
    if (photosRequired && photos.length === 0) {
      toast.error("Upload at least one photo as proof of delivery.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`${endpoint}/${row.id}/mark-delivered`, {
        photos: photos.map((p) => p.dataUrl),
        note: note.trim() || null,
      });
      toast.success("Marked delivered. Waiting on customer to confirm.");
      setProvDlg(false); setPhotos([]); setNote("");
      onUpdated?.(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const submitConfirm = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`${endpoint}/${row.id}/confirm-receipt`);
      toast.success("Delivery confirmed. Provider has been paid.");
      onUpdated?.(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const submitDispute = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`${endpoint}/${row.id}/dispute`, {
        reason: disputeReason.trim() || null,
      });
      toast.success("Dispute opened. Payment is on hold while Lumo reviews.");
      setDisputeDlg(false); setDisputeReason("");
      onUpdated?.(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  // ─── Render branches ──────────────────────────────────────────────────────
  // (1) Provider, in-progress and not yet delivered → "Mark delivered" CTA
  if (viewerRole === "provider" && (row.status === "accepted" || row.status === "assigned" || row.status === "in_progress") && !status) {
    return (
      <>
        <Button
          onClick={() => setProvDlg(true)}
          className="w-full bg-teal-700 hover:bg-teal-800 mt-3"
          data-testid="delivery-mark-btn"
        >
          <Camera className="w-4 h-4 mr-2" />
          {photosRequired ? "Mark delivered (upload photos)" : "Mark complete"}
        </Button>
        <Dialog open={provDlg} onOpenChange={setProvDlg}>
          <DialogContent data-testid="delivery-mark-dialog">
            <DialogHeader>
              <DialogTitle>{photosRequired ? "Proof of delivery" : "Mark complete"}</DialogTitle>
              <DialogDescription>
                {photosRequired
                  ? `Snap up to ${MAX_PHOTOS} photos showing the package delivered. Customer auto-confirms in 24 hours if they don't respond.`
                  : "Add an optional note describing what you completed."}
              </DialogDescription>
            </DialogHeader>
            {photosRequired && (
              <div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square border border-slate-200 overflow-hidden group">
                      <img src={p.dataUrl} alt={p.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5"
                        data-testid={`delivery-photo-remove-${i}`}
                      >×</button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-slate-900 hover:text-slate-900"
                      data-testid="delivery-photo-add"
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px] font-mono mt-1">add photo</span>
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple
                       onChange={onPickFiles} className="hidden" data-testid="delivery-photo-input" />
                <p className="text-[11px] font-mono text-slate-500">Up to {MAX_PHOTOS} photos · ≤ 900 KB each.</p>
              </div>
            )}
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={photosRequired ? "Optional note: left at front door, handed to customer, etc." : "Optional: what did you complete?"}
              data-testid="delivery-note-input"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setProvDlg(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submitDelivered} disabled={busy || (photosRequired && photos.length === 0)} className="bg-teal-700 hover:bg-teal-800" data-testid="delivery-mark-submit">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Mark delivered"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // (2) Awaiting confirmation → show proof + customer CTAs (or provider read-only)
  if (status === "awaiting_confirmation") {
    return (
      <div className="mt-3 border border-amber-300 bg-amber-50 p-4" data-testid="delivery-awaiting-panel">
        <div className="flex items-center gap-2 text-amber-800">
          <Clock className="w-4 h-4" />
          <span className="overline">
            {viewerRole === "customer" ? "Confirm to release payment" : "Awaiting customer confirmation"}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Marked delivered {fmtRelative(row.delivered_at)} · auto-releases in 24h
        </p>
        {row.delivery_photos?.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {row.delivery_photos.map((p, i) => (
              <button type="button" key={i} onClick={() => setPhotoFull(p)}
                className="aspect-square border border-amber-200 overflow-hidden">
                <img src={p} alt="proof of delivery" className="w-full h-full object-cover" data-testid={`delivery-proof-photo-${i}`} />
              </button>
            ))}
          </div>
        )}
        {row.delivery_note && (
          <p className="text-sm text-slate-700 mt-3 bg-white border border-amber-200 p-2 whitespace-pre-wrap" data-testid="delivery-proof-note">
            {row.delivery_note}
          </p>
        )}
        {viewerRole === "customer" && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button onClick={submitConfirm} disabled={busy} className="bg-teal-700 hover:bg-teal-800" data-testid="delivery-confirm-btn">
              <CheckCircle2 className="w-4 h-4 mr-1" />I received it
            </Button>
            <Button onClick={() => setDisputeDlg(true)} disabled={busy} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" data-testid="delivery-dispute-btn">
              <AlertTriangle className="w-4 h-4 mr-1" />Something&apos;s wrong
            </Button>
          </div>
        )}

        <Dialog open={!!photoFull} onOpenChange={(v) => !v && setPhotoFull(null)}>
          <DialogContent className="max-w-2xl">
            {photoFull && <img src={photoFull} alt="proof" className="w-full" />}
          </DialogContent>
        </Dialog>

        <Dialog open={disputeDlg} onOpenChange={setDisputeDlg}>
          <DialogContent data-testid="delivery-dispute-dialog">
            <DialogHeader>
              <DialogTitle>What went wrong?</DialogTitle>
              <DialogDescription>
                Payment will be held while Lumo reviews. You can also chat with our AI assistant on the side panel to see whether a refund applies.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              placeholder="Tell us what happened — damaged, wrong address, never received, etc."
              data-testid="delivery-dispute-reason"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDisputeDlg(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submitDispute} disabled={busy} className="bg-red-600 hover:bg-red-700" data-testid="delivery-dispute-submit">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Open dispute"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // (3) Final states — show a small status pill
  if (status === "confirmed" || status === "auto_confirmed") {
    return (
      <div className="mt-3 border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900 flex items-center gap-2" data-testid="delivery-confirmed-pill">
        <CheckCircle2 className="w-4 h-4" />
        <span>
          {status === "auto_confirmed" ? "Auto-confirmed after 24 hours" : "Confirmed by customer"}
          {row.payment_released_amount != null && (
            <> · paid out <span className="font-mono">${Number(row.payment_released_amount).toFixed(2)}</span></>
          )}
        </span>
      </div>
    );
  }
  if (status === "disputed") {
    return (
      <div className="mt-3 border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2" data-testid="delivery-disputed-pill">
        <AlertTriangle className="w-4 h-4" />
        <span>Dispute under review — payment is on hold</span>
      </div>
    );
  }
  return null;
}
