import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellPlus } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { savedFiltersFrom } from "./reUtils";

export default function SaveSearchButton({ params }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const start = () => {
    if (!user) { nav("/signin", { state: { from: "/real-estate" } }); return; }
    setName(params.get("place") || "My home search");
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/real-estate/saved-searches", { name: name.trim() || "My home search", filters: savedFiltersFrom(params), notify: true });
      toast.success("Search saved — we'll alert you when matching homes are listed.");
      setOpen(false);
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Button onClick={start} className="h-11 bg-slate-900 hover:bg-slate-800" data-testid="re-save-search-btn">
        <BellPlus className="w-4 h-4 mr-2" />Save search
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="re-save-search-dialog">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>You'll get an in-app and phone notification whenever a new listing matches these filters and this map area.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this search" data-testid="re-save-search-name" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-slate-900 hover:bg-slate-800" data-testid="re-save-search-confirm">{busy ? "Saving…" : "Save & alert me"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
