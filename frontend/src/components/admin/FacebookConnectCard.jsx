import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Facebook, CheckCircle2, AlertTriangle, Instagram, Loader2 } from "lucide-react";

const clearParams = (params, setParams) => {
  const next = new URLSearchParams(params);
  ["facebook", "reason", "page", "instagram", "pick"].forEach((k) => next.delete(k));
  setParams(next, { replace: true });
};

export const FacebookConnectCard = ({ onChange }) => {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [picks, setPicks] = useState(null);
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);
  const loadStatus = () => api.get("/admin/social/facebook/status").then((r) => setStatus(r.data)).catch(() => {});

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const fb = params.get("facebook");
    if (fb === "connected") {
      toast.success(`Facebook connected${params.get("page") ? `: ${params.get("page")}` : ""}${params.get("instagram") === "1" ? " + Instagram" : ""}`);
      clearParams(params, setParams); onChange?.();
    } else if (fb === "error") {
      toast.error(params.get("reason") || "Facebook connection failed");
      clearParams(params, setParams);
    } else if (fb === "pick") {
      api.get(`/admin/social/facebook/picks/${params.get("pick")}`).then((r) => setPicks(r.data)).catch((e) => toast.error(formatApiError(e)));
    }
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    try { const { data } = await api.get("/admin/social/facebook/authorize"); window.location.assign(data.url); }
    catch (e) { toast.error(formatApiError(e)); setBusy(false); }
  };
  const choose = async (page) => {
    try {
      await api.post("/admin/social/facebook/select", { pick_id: params.get("pick"), page_id: page.id });
      toast.success(`Connected ${page.name}`);
      setPicks(null); clearParams(params, setParams); loadStatus(); onChange?.();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const ok = status?.connected && status?.token_valid;
  return (
    <div className="border border-slate-900 bg-white p-5" data-testid="fb-connect-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center"><Facebook className="w-5 h-5 text-white" /></div>
          <div>
            <div className="font-display font-bold text-lg">Facebook &amp; Instagram</div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5" data-testid="fb-connect-status">
              {!status ? "Checking…" : ok ? (
                <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Posting to {status.page_name || status.page_id}
                  {status.instagram && <><Instagram className="w-3.5 h-3.5 ml-2" /> Instagram linked</>}</>
              ) : status.connected ? (
                <><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Connection expired. Reconnect.</>
              ) : "Not connected"}
            </div>
          </div>
        </div>
        <button onClick={connect} disabled={busy || !status?.configured}
          className="rounded-full bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold px-5 py-2.5 flex items-center gap-2 disabled:opacity-50 transition-colors"
          data-testid="fb-connect-btn">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
          {ok ? "Reconnect" : "Connect Facebook"}
        </button>
      </div>
      {picks && (
        <div className="mt-4 border-t border-slate-200 pt-4" data-testid="fb-page-picker">
          <div className="text-sm font-semibold mb-2">Which Page should Lumo post to?</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {picks.map((p) => (
              <button key={p.id} onClick={() => choose(p)} className="text-left border border-slate-200 hover:border-slate-900 p-3 transition-colors" data-testid={`fb-page-option-${p.id}`}>
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-slate-500">{p.instagram ? "Instagram linked" : "No Instagram linked"}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">Connect from golumo.app (the live site). Facebook sends you back there after you log in.</p>
    </div>
  );
};
