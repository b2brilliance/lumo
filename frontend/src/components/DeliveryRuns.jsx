import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bike, MapPin, Package } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const RunCard = ({ r, action, label, busy, testid }) => (
  <div className="border border-slate-200 p-4 flex flex-col gap-2" data-testid={testid}>
    <div className="flex items-start justify-between gap-3">
      <div className="font-display font-bold">{r.store_name}</div>
      <div className="font-display font-bold text-emerald-700" data-testid={`${testid}-payout`}>${Number(r.payout || 0).toFixed(2)}</div>
    </div>
    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
      {r.distance_miles != null && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.distance_miles} mi from you</span>}
      <span className="flex items-center gap-1"><Bike className="w-3 h-3" />{r.delivery_miles ?? "?"} mi trip</span>
      <span className="flex items-center gap-1"><Package className="w-3 h-3" />{r.items} item(s){r.size_class && r.size_class !== "small" ? ` · ${r.size_class}` : ""}</span>
    </div>
    {r.dropoff_address && <div className="text-xs text-slate-600 truncate">To: {r.dropoff_address}</div>}
    <button onClick={action} disabled={busy} className="btn-lumo btn-lumo-primary btn-lumo-sm self-start disabled:opacity-50" data-testid={`${testid}-btn`}>{busy ? "…" : label}</button>
  </div>
);

export default function DeliveryRuns() {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(null);
  const load = async () => {
    const [a, b] = await Promise.all([api.get("/provider/delivery-runs"), api.get("/orders")]).catch(() => [{ data: [] }, { data: [] }]);
    setRuns(a.data || []);
    setMine((b.data || []).filter((o) => o.is_cart_order && o.status === "in_progress" && o.provider_id === user?.id)
      .map((o) => ({ id: o.id, store_name: o.store_name, payout: o.split?.driver, delivery_miles: o.delivery_miles, items: (o.lines || []).reduce((s, l) => s + (l.quantity || 1), 0), size_class: o.size_class, dropoff_address: o.delivery_address?.address })));
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []); // eslint-disable-line
  const act = async (id, path, msg) => {
    setBusy(id);
    try { await api.post(`/orders/${id}/${path}`); toast.success(msg); await load(); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(null); }
  };
  if (!runs.length && !mine.length) return null;
  return (
    <section id="delivery-runs" className="mt-6" data-testid="delivery-runs">
      {mine.length > 0 && (<>
        <div className="overline">Your active deliveries</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {mine.map((r) => <RunCard key={r.id} r={r} busy={busy === r.id} label="Mark delivered" testid={`my-run-${r.id}`} action={() => act(r.id, "delivered", "Delivered — payout added to your wallet")} />)}
        </div>
      </>)}
      {runs.length > 0 && (<>
        <div className="overline mt-4">Delivery runs near you</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {runs.map((r) => <RunCard key={r.id} r={r} busy={busy === r.id} label="Accept run" testid={`run-${r.id}`} action={() => act(r.id, "accept_delivery", "Run accepted — head to the store")} />)}
        </div>
      </>)}
    </section>
  );
}
