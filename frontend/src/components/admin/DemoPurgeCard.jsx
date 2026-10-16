import React, { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function DemoPurgeCard({ onPurged }) {
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/admin/demo/purge-preview");
      setPreview(data); setConfirm("");
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  const purge = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/demo/purge", { confirm });
      const total = Object.values(data.deleted || {}).reduce((a, b) => a + b, 0);
      toast.success(`Purged ${total} demo records and test accounts`);
      setPreview(null);
      onPurged?.();
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="border border-red-200 bg-red-50/40 p-4 flex flex-wrap items-center gap-3" data-testid="admin-demo-purge-card">
      <AlertTriangle className="w-5 h-5 text-red-600" />
      <div className="flex-1 min-w-[220px]">
        <div className="font-display font-bold">Purge demo data</div>
        <div className="text-xs text-slate-600">Permanently deletes every seeded demo listing, job and rental plus all test accounts (.test emails) and their content. Your admin account is kept.</div>
      </div>
      <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={open} disabled={busy} data-testid="admin-demo-purge-open">
        <Trash2 className="w-4 h-4 mr-1" />{busy && !preview ? "Counting…" : "Purge demo data"}
      </Button>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent data-testid="admin-demo-purge-dialog">
          <DialogHeader>
            <DialogTitle>Delete {preview?.total ?? 0} records?</DialogTitle>
            <DialogDescription>This cannot be undone. Test login accounts will stop working and will not be re-created.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="max-h-60 overflow-y-auto border border-slate-200 divide-y divide-slate-100 text-sm" data-testid="admin-demo-purge-counts">
              <div className="flex justify-between px-3 py-1.5 font-bold"><span>Test accounts</span><span className="font-mono">{preview.test_users}</span></div>
              {Object.entries(preview.collections).map(([k, v]) => (
                <div key={k} className="flex justify-between px-3 py-1.5"><span>{k.replace(/_/g, " ")}</span><span className="font-mono">{v}</span></div>
              ))}
            </div>
          )}
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type PURGE to confirm" data-testid="admin-demo-purge-confirm-input" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
            <Button variant="destructive" className="bg-red-600 hover:bg-red-700" disabled={confirm !== "PURGE" || busy} onClick={purge} data-testid="admin-demo-purge-confirm">
              {busy ? "Purging…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
