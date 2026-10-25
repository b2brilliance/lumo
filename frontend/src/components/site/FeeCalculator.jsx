import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Slider } from "@/components/ui/slider";

const SIZES = [["small", "Bag"], ["medium", "Car"], ["large", "SUV / van"], ["xl", "Truck"]];

export const FeeCalculator = () => {
  const [p, setP] = useState(null);
  const [miles, setMiles] = useState(3);
  const [size, setSize] = useState("small");
  useEffect(() => { api.get("/app/pricing").then(({ data }) => setP(data)).catch(() => {}); }, []);
  if (!p) return null;
  const fee = (p.delivery_base + p.delivery_per_mile * miles) * (p.size_multipliers[size] || 1);
  const driver = fee * p.driver_share_pct / 100;
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-8 sm:p-10 shadow-sm" data-testid="fee-calculator">
      <div className="flex justify-between text-sm"><span className="text-slate-500">Distance</span><span className="font-semibold" data-testid="fee-calc-miles">{miles} mi</span></div>
      <Slider value={[miles]} min={1} max={20} step={1} onValueChange={([v]) => setMiles(v)} className="mt-4" data-testid="fee-calc-slider" />
      <div className="text-sm text-slate-500 mt-8">Order size</div>
      <div className="grid grid-cols-4 gap-2 mt-3">
        {SIZES.map(([k, l]) => (
          <button key={k} onClick={() => setSize(k)} className={`h-11 rounded-full text-sm font-medium transition-colors ${size === k ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`} data-testid={`fee-calc-size-${k}`}>{l}</button>
        ))}
      </div>
      <div className="mt-10 flex items-end justify-between border-t border-slate-200 pt-6">
        <div><div className="text-sm text-slate-500">Delivery fee</div><div className="font-display font-bold text-4xl mt-1" data-testid="fee-calc-total">${fee.toFixed(2)}</div></div>
        <div className="text-right"><div className="text-sm text-slate-500">Driver keeps</div><div className="font-display font-semibold text-xl text-emerald-600 mt-1" data-testid="fee-calc-driver">${driver.toFixed(2)}</div></div>
      </div>
      <p className="text-xs text-slate-500 mt-4">${p.delivery_base.toFixed(2)} base + ${p.delivery_per_mile.toFixed(2)} per mile, scaled for bigger orders. Plus a {p.service_fee_pct}% service fee on items.</p>
    </div>
  );
};
