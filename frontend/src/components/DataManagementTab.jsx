import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Eye, Lock, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};
const fmtNum = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);

export default function DataManagementTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [peek, setPeek] = useState(null); // {collection, items, total}
  const [confirmWipe, setConfirmWipe] = useState(null); // {collection, label, count}
  const [typedConfirm, setTypedConfirm] = useState("");
  const [olderThan, setOlderThan] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/data/collections");
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openPeek = async (key, label) => {
    try {
      const { data } = await api.get(`/admin/data/${key}?limit=100`);
      setPeek({ ...data, label });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const handleWipe = async () => {
    if (!confirmWipe) return;
    if (typedConfirm.trim().toLowerCase() !== confirmWipe.key.toLowerCase()) {
      toast.error(`Type "${confirmWipe.key}" to confirm.`);
      return;
    }
    try {
      const { data } = await api.post("/admin/data/bulk-delete", {
        collection: confirmWipe.key,
        older_than_iso: olderThan || null,
        confirm: true,
      });
      toast.success(`Deleted ${data.deleted} record${data.deleted === 1 ? "" : "s"} from ${confirmWipe.label}.`);
      setConfirmWipe(null);
      setTypedConfirm("");
      setOlderThan("");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const deleteOne = async (collection, docId) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await api.delete(`/admin/data/${collection}/${docId}`);
      toast.success("Deleted.");
      setPeek((p) => p ? { ...p, items: p.items.filter((x) => x.id !== docId), total: p.total - 1 } : p);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500 flex items-center gap-2" data-testid="data-mgmt-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading data inventory…
      </div>
    );
  }

  return (
    <div data-testid="data-mgmt-page">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-black tracking-tighter">Data management</h2>
        <p className="text-sm text-slate-500 mt-1">
          Inspect and purge historical data. Orders, revenue, payouts, and platform settings are{" "}
          <Lock className="inline w-3 h-3 text-teal-700" /> <strong>locked</strong> and cannot be deleted here.
        </p>
      </div>

      {/* Protected list */}
      <div className="mb-6 border border-teal-200 bg-teal-50 p-3 text-xs">
        <div className="flex items-center gap-2 font-display font-bold text-teal-800">
          <ShieldCheck className="w-4 h-4" /> Protected (cannot be deleted)
        </div>
        <div className="mt-1 font-mono text-teal-700">
          {(data?.protected || []).join(" · ")}
        </div>
      </div>

      {/* Collections grid */}
      <div className="border border-slate-200 divide-y divide-slate-200" data-testid="data-mgmt-list">
        {(data?.collections || []).map((c) => (
          <div key={c.key} className="grid grid-cols-12 gap-3 p-3 items-center" data-testid={`data-row-${c.key}`}>
            <div className="col-span-12 md:col-span-4">
              <div className="font-display font-bold text-slate-900">{c.label}</div>
              <div className="text-[10px] font-mono uppercase text-slate-400 mt-0.5">{c.key}</div>
              {c.warn && (
                <div className="text-[11px] text-amber-700 mt-1 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{c.warn}</span>
                </div>
              )}
            </div>
            <div className="col-span-4 md:col-span-2 text-right md:text-left">
              <div className="overline text-slate-500">Records</div>
              <div className="font-display text-2xl font-black tabular-nums">{fmtNum(c.count)}</div>
            </div>
            <div className="col-span-8 md:col-span-3">
              <div className="overline text-slate-500">Latest record</div>
              <div className="text-xs font-mono text-slate-600">{fmtDate(c.latest_ts)}</div>
            </div>
            <div className="col-span-12 md:col-span-3 flex gap-2 justify-end">
              <Button
                size="sm" variant="outline" disabled={c.count === 0}
                onClick={() => openPeek(c.key, c.label)}
                className="rounded-none text-xs h-8"
                data-testid={`data-peek-${c.key}`}
              >
                <Eye className="w-3 h-3 mr-1" /> Inspect
              </Button>
              <Button
                size="sm" variant="outline" disabled={c.count === 0}
                onClick={() => { setConfirmWipe({ key: c.key, label: c.label, count: c.count, warn: c.warn }); }}
                className="rounded-none text-xs h-8 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                data-testid={`data-wipe-${c.key}`}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Wipe
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Peek dialog */}
      <Dialog open={!!peek} onOpenChange={(o) => !o && setPeek(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col rounded-none" data-testid="data-peek-dialog">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tighter text-2xl">
              {peek?.label} <span className="text-xs font-mono text-slate-400">({peek?.total} total · showing latest {peek?.items?.length || 0})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 text-xs font-mono">
            {(peek?.items || []).map((row, i) => (
              <div key={row.id || i} className="border-b border-slate-200 py-2 px-1 flex items-start gap-2" data-testid={`peek-row-${i}`}>
                <pre className="flex-1 whitespace-pre-wrap break-all text-slate-700">{JSON.stringify(row, null, 1).slice(0, 600)}{JSON.stringify(row).length > 600 ? "…" : ""}</pre>
                {row.id && (
                  <button
                    onClick={() => deleteOne(peek.collection, row.id)}
                    className="text-slate-400 hover:text-red-600 p-1"
                    title="Delete this record"
                    data-testid={`peek-delete-${row.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {(peek?.items || []).length === 0 && <div className="text-slate-400 text-center py-8">Empty.</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wipe confirmation */}
      <AlertDialog open={!!confirmWipe} onOpenChange={(o) => { if (!o) { setConfirmWipe(null); setTypedConfirm(""); setOlderThan(""); } }}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-tighter flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Wipe {confirmWipe?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{fmtNum(confirmWipe?.count || 0)}</strong> records from <code className="font-mono text-xs bg-slate-100 px-1">{confirmWipe?.key}</code>.
              {confirmWipe?.warn && <><br /><br /><span className="text-amber-700">⚠ {confirmWipe.warn}</span></>}
              <br /><br />
              <strong>Type <code className="font-mono bg-slate-100 px-1">{confirmWipe?.key}</code> to confirm:</strong>
              <Input
                value={typedConfirm}
                onChange={(e) => setTypedConfirm(e.target.value)}
                className="mt-2 rounded-none"
                placeholder={confirmWipe?.key}
                data-testid="wipe-type-confirm"
              />
              <div className="mt-3 text-xs text-slate-500">
                <strong>Optional</strong> — only delete records older than this ISO timestamp (leave blank to wipe all):
              </div>
              <Input
                value={olderThan}
                onChange={(e) => setOlderThan(e.target.value)}
                className="mt-1 rounded-none text-xs font-mono"
                placeholder="2026-01-01T00:00:00Z"
                data-testid="wipe-older-than"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="wipe-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleWipe(); }}
              className="bg-red-600 hover:bg-red-700"
              data-testid="wipe-confirm"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
