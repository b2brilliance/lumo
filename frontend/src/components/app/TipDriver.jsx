import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const PCTS = [10, 15, 20];

// Customer tips the driver after delivery; drivers keep 100%.
export const TipDriver = ({ t, onPaid }) => {
  const [pct, setPct] = useState(15);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const total = Number(t.total || 0);
  const amountFor = (p) => Math.max(1, Math.round(total * p) / 100);

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("tip_session");
    if (!sid) return;
    let tries = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/checkout/status/${sid}`);
        if (data.payment_status === "paid") {
          toast.success("Thank you! 100% of your tip goes to your driver");
          window.history.replaceState({}, "", window.location.pathname);
          onPaid();
          return;
        }
      } catch (_) { /* retry */ }
      if (++tries < 10) setTimeout(poll, 2000);
    };
    poll();
  }, []); // eslint-disable-line

  if (t.tip_amount) {
    return <div className="mt-6 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" data-testid="tip-thanks">You tipped ${Number(t.tip_amount).toFixed(2)}. Thank you for supporting your driver!</div>;
  }
  if (!t.can_tip) return null;
  const send = async () => {
    const body = custom ? { amount: Number(custom) } : { percent: pct };
    if (custom && !(Number(custom) >= 1)) { toast.error("Enter at least $1"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/orders/${t.id}/tip`, { ...body, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) { toast.error(formatApiError(e)); setBusy(false); }
  };
  return (
    <section className="mt-6 border border-slate-200 p-5" data-testid="tip-driver">
      <div className="flex items-center gap-2 font-display font-bold text-lg"><HandCoins className="w-5 h-5 text-emerald-600" /> Tip {t.driver_name || "your driver"}</div>
      <p className="text-sm text-slate-500 mt-1">100% of your tip goes to your driver.</p>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {PCTS.map((p) => (
          <button key={p} onClick={() => { setPct(p); setCustom(""); }} className={`py-3 rounded-2xl border text-center transition-colors ${!custom && pct === p ? "bg-slate-950 text-white border-slate-950" : "border-slate-200 hover:border-slate-900"}`} data-testid={`tip-pct-${p}`}>
            <div className="font-display font-bold">{p}%</div>
            <div className="text-xs opacity-70">${amountFor(p).toFixed(2)}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-sm text-slate-500">or $</span>
        <input type="number" min="1" step="1" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom amount" className="flex-1 border border-slate-200 px-3 py-2 text-sm" data-testid="tip-custom" />
      </div>
      <button onClick={send} disabled={busy} className="mt-4 w-full h-12 rounded-full bg-emerald-600 text-white font-semibold disabled:opacity-60" data-testid="tip-send">
        {busy ? "Opening checkout…" : `Tip $${(custom ? Number(custom) || 0 : amountFor(pct)).toFixed(2)}`}
      </button>
    </section>
  );
};
