import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function QuoteDialog({ open, onOpenChange, job, onSubmitted }) {
  const [form, setForm] = useState({
    quoted_pay_rate: job?.pay_rate?.toString() || "",
    quoted_pay_unit: job?.pay_unit || "flat",
    quoted_estimated_units: job?.estimated_units?.toString() || "1",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (job) setForm({
      quoted_pay_rate: job.pay_rate?.toString() || "",
      quoted_pay_unit: job.pay_unit || "flat",
      quoted_estimated_units: job.estimated_units?.toString() || "1",
      notes: "",
    });
  }, [job]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/jobs/${job.id}/quotes`, {
        quoted_pay_rate: parseFloat(form.quoted_pay_rate),
        quoted_pay_unit: form.quoted_pay_unit,
        quoted_estimated_units: parseFloat(form.quoted_estimated_units || "1"),
        notes: form.notes,
      });
      toast.success("Quote submitted");
      onSubmitted && onSubmitted(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  if (!job) return null;
  const asking = (job.pay_rate || 0).toFixed(2);
  const proposed = parseFloat(form.quoted_pay_rate || "0").toFixed(2);
  const diff = parseFloat(proposed) - parseFloat(asking);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="quote-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Quote: {job.title}</DialogTitle>
          <DialogDescription>Propose your own rate, unit, and estimated units. The customer can accept, decline, or wait for more quotes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="border-l-2 border-slate-300 pl-3">
            <div className="overline text-slate-500">Customer is asking</div>
            <div className="font-display text-lg font-bold mt-1">${asking} / {job.pay_unit}{job.pay_unit !== "flat" && ` · est. ${job.estimated_units} ${job.pay_unit}s`}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="overline">Your rate ($)</Label>
              <Input type="number" step="0.01" value={form.quoted_pay_rate} onChange={(e) => setForm({ ...form, quoted_pay_rate: e.target.value })} required data-testid="quote-rate" className="mt-1" />
            </div>
            <div>
              <Label className="overline">Unit</Label>
              <Select value={form.quoted_pay_unit} onValueChange={(v) => setForm({ ...form, quoted_pay_unit: v })}>
                <SelectTrigger className="mt-1" data-testid="quote-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour">Per hour</SelectItem>
                  <SelectItem value="day">Per day</SelectItem>
                  <SelectItem value="week">Per week</SelectItem>
                  <SelectItem value="flat">Flat (one-time)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.quoted_pay_unit !== "flat" && (
            <div>
              <Label className="overline">Estimated units</Label>
              <Input type="number" step="0.5" value={form.quoted_estimated_units} onChange={(e) => setForm({ ...form, quoted_estimated_units: e.target.value })} data-testid="quote-units" className="mt-1" />
            </div>
          )}
          <div>
            <Label className="overline">Notes (visible to customer)</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Why this rate — experience, materials, scope..." data-testid="quote-notes" className="mt-1" />
          </div>
          {Number.isFinite(diff) && diff !== 0 && (
            <div className={`text-sm font-mono ${diff > 0 ? "text-amber-700" : "text-teal-700"}`} data-testid="quote-delta">
              {diff > 0 ? "+" : ""}${diff.toFixed(2)} vs asking rate
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-teal-700 hover:bg-teal-800" data-testid="quote-submit">
              {busy ? "Sending…" : "Send quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
