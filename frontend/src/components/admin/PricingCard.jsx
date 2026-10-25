import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const FIELDS = [
  ["service_fee_pct", "Service fee on every order (%)"],
  ["delivery_base", "Delivery base fee ($)"],
  ["delivery_per_mile", "Delivery per mile ($)"],
  ["driver_share_pct", "Driver's share of delivery fee (%)"],
  ["str_commission_pct", "Short-term rental commission (%)"],
];
const SIZES = [["small", "Small (bag)"], ["medium", "Medium (car)"], ["large", "Large (SUV/van)"], ["xl", "Extra large (truck)"]];

export default function PricingCard() {
  const [p, setP] = useState(null);
  useEffect(() => { api.get("/app/pricing").then(({ data }) => setP(data)).catch(() => {}); }, []);
  if (!p) return null;
  const save = async () => {
    try {
      const body = Object.fromEntries(FIELDS.map(([k]) => [k, Number(p[k])]));
      body.size_multipliers = Object.fromEntries(SIZES.map(([k]) => [k, Number(p.size_multipliers[k])]));
      await api.put("/admin/pricing", body);
      toast.success("Pricing saved");
    } catch { toast.error("Couldn't save pricing"); }
  };
  const input = "mt-1 w-full h-10 px-3 border border-slate-200 rounded-md text-sm";
  return (
    <div className="border border-slate-200 p-6 space-y-4" data-testid="admin-pricing-card">
      <div className="overline">App order pricing</div>
      <div className="grid sm:grid-cols-2 gap-3">
        {FIELDS.map(([k, l]) => (
          <label key={k} className="text-sm">{l}
            <input type="number" step="0.01" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} className={input} data-testid={`pricing-${k}`} />
          </label>
        ))}
      </div>
      <div className="text-sm font-semibold">Delivery size multipliers</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SIZES.map(([k, l]) => (
          <label key={k} className="text-sm">{l}
            <input type="number" step="0.1" value={p.size_multipliers[k]} onChange={(e) => setP({ ...p, size_multipliers: { ...p.size_multipliers, [k]: e.target.value } })} className={input} data-testid={`pricing-size-${k}`} />
          </label>
        ))}
      </div>
      <button onClick={save} className="h-10 px-5 rounded-md bg-slate-900 text-white text-sm font-semibold" data-testid="pricing-save">Save pricing</button>
    </div>
  );
}
