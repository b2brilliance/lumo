import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Star, Award } from "lucide-react";
import MediaUpload from "@/components/MediaUpload";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

/**
 * Compact star row — read-only display.
 */
export function Stars({ value, size = 4, className = "" }) {
  const v = Math.max(0, Math.min(5, Number(value || 0)));
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} data-testid="stars-display">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-${size} h-${size} ${i <= Math.round(v) ? "text-amber-500 fill-amber-500" : "text-slate-300"}`}
        />
      ))}
    </span>
  );
}

/**
 * Interactive star picker.
 */
export function StarPicker({ value, onChange, label, testId }) {
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <span className="text-xs font-mono uppercase tracking-wider text-slate-500 w-32">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className="text-slate-300 hover:text-amber-500 transition-colors"
            data-testid={`${testId}-${i}`}
          >
            <Star className={`w-6 h-6 ${i <= value ? "text-amber-500 fill-amber-500" : ""}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Inline summary badge — shows "4.8 ★ · 124" for a target.
 * Pass `summary` directly (from /reviews/summary) or omit and pass targetType+id to auto-fetch.
 */
export function ReviewSummaryBadge({ targetType, targetId, summary, className = "" }) {
  const [data, setData] = useState(summary || null);
  useEffect(() => {
    if (summary) { setData(summary); return; }
    if (!targetType || !targetId) return;
    api.get(`/reviews/summary/${targetType}/${targetId}`).then((r) => setData(r.data)).catch(() => {});
  }, [targetType, targetId, summary]);
  if (!data || data.count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${className}`} data-testid="review-summary-badge">
      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
      <span className="font-semibold">{data.avg_overall?.toFixed(1)}</span>
      <span className="text-slate-500">· {data.count}</span>
    </span>
  );
}

/**
 * Full reviews section — list + leave-a-review button.
 * targetType: "provider" | "store"
 * targetId: user_id of the provider/store
 */
export default function ReviewsSection({ targetType, targetId }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    transaction_id: "",
    overall: 5, quality: 5, communication: 5, ontime: 5,
    body: "", media_url: null, media_type: null,
  });
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/reviews/target/${targetType}/${targetId}`).then(({ data }) => {
    setReviews(data.reviews || []);
    setSummary(data.summary || null);
  }).catch(() => {});

  const loadEligible = () => {
    if (!user || user === false) { setEligible([]); return; }
    api.get(`/reviews/can-review/${targetType}/${targetId}`).then(({ data }) => {
      setEligible(data.eligible || []);
    }).catch(() => setEligible([]));
  };

  useEffect(() => { load(); }, [targetType, targetId]);
  useEffect(() => { loadEligible(); }, [user, targetType, targetId]);

  const submit = async () => {
    if (!form.transaction_id) {
      toast.error("Pick a completed transaction to review");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        target_type: targetType, target_id: targetId,
        overall_stars: form.overall,
        quality_stars: form.quality,
        communication_stars: form.communication,
        ontime_stars: form.ontime,
        body: form.body || null,
        media_url: form.media_url, media_type: form.media_type,
      };
      if (targetType === "provider") payload.job_id = form.transaction_id;
      else payload.order_id = form.transaction_id;
      await api.post("/reviews", payload);
      toast.success("Review submitted — thank you!");
      setOpen(false);
      setForm({ transaction_id: "", overall: 5, quality: 5, communication: 5, ontime: 5, body: "", media_url: null, media_type: null });
      load();
      loadEligible();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  return (
    <section data-testid="reviews-section">
      <div className="flex items-end justify-between">
        <div>
          <div className="overline">Reviews</div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-display text-2xl font-bold" data-testid="reviews-avg">
              {summary && summary.count > 0 ? summary.avg_overall?.toFixed(1) : "—"}
            </span>
            <Stars value={summary?.avg_overall || 0} size={4} />
            <span className="text-sm text-slate-500" data-testid="reviews-count">
              {summary?.count || 0} review{summary?.count === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {eligible.length > 0 && (
          <Button onClick={() => { setForm((f) => ({ ...f, transaction_id: eligible[0][targetType === "provider" ? "job_id" : "order_id"] })); setOpen(true); }} className="bg-slate-900 hover:bg-slate-800" data-testid="leave-review-btn">
            <Award className="w-4 h-4 mr-1.5" /> Leave a review
          </Button>
        )}
      </div>

      {summary && summary.count > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          {[
            { label: "Overall", val: summary.avg_overall },
            { label: "Quality", val: summary.avg_quality },
            { label: "Communication", val: summary.avg_communication },
            { label: "On-time", val: summary.avg_ontime },
          ].filter((s) => s.val != null).map((s) => (
            <div key={s.label} className="border border-slate-200 p-3">
              <div className="text-slate-500 uppercase">{s.label}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="font-bold text-slate-900">{s.val.toFixed(1)}</span>
                <Stars value={s.val} size={3} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 divide-y divide-slate-200 border-t border-b border-slate-200">
        {reviews.length === 0 && <div className="p-6 text-sm text-slate-500">No reviews yet. {eligible.length > 0 ? "You're eligible to leave the first." : ""}</div>}
        {reviews.map((r) => {
          const img = r.media_url ? (r.media_url.startsWith("http") ? r.media_url : `${BACKEND_URL}${r.media_url}`) : null;
          return (
            <div key={r.id} className="py-4" data-testid={`review-${r.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display font-bold text-slate-900">{r.reviewer_name}</span>
                  <Stars value={r.overall_stars} size={3.5} />
                </div>
                <span className="text-xs font-mono text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.body && <p className="text-sm text-slate-700 mt-2 leading-relaxed">{r.body}</p>}
              {img && (
                <div className="mt-2 w-32 aspect-square bg-slate-100">
                  {r.media_type?.startsWith("video") ? (
                    <video src={img} className="w-full h-full object-cover" controls />
                  ) : (
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="review-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Leave a review</DialogTitle>
            <DialogDescription>Verified — you can only review a {targetType} after a completed transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {eligible.length > 1 && (
              <div>
                <label className="overline">Which transaction?</label>
                <select
                  className="w-full mt-1 border border-slate-300 px-3 py-2"
                  value={form.transaction_id}
                  onChange={(e) => setForm({ ...form, transaction_id: e.target.value })}
                  data-testid="review-transaction-picker"
                >
                  {eligible.map((e) => (
                    <option key={e.job_id || e.order_id} value={e.job_id || e.order_id}>
                      {e.job_title || `Order ${(e.order_id || "").slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <StarPicker value={form.overall} onChange={(v) => setForm({ ...form, overall: v })} label="Overall" testId="stars-overall" />
            <StarPicker value={form.quality} onChange={(v) => setForm({ ...form, quality: v })} label="Quality" testId="stars-quality" />
            <StarPicker value={form.communication} onChange={(v) => setForm({ ...form, communication: v })} label="Communication" testId="stars-communication" />
            <StarPicker value={form.ontime} onChange={(v) => setForm({ ...form, ontime: v })} label="On-time" testId="stars-ontime" />
            <div>
              <label className="overline">Tell us more (optional)</label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder={`How was your experience with this ${targetType}?`}
                className="mt-1"
                rows={3}
                maxLength={1000}
                data-testid="review-body"
              />
            </div>
            <MediaUpload value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="bg-slate-900 hover:bg-slate-800" data-testid="review-submit">
              {busy ? "Posting…" : "Post review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
