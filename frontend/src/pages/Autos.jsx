import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Car, Gauge, Fuel, MapPin } from "lucide-react";

function PriceTag({ price }) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return <div className="font-display text-2xl font-bold">{fmt.format(price)}</div>;
}

function ListingCard({ r }) {
  const photo = (r.photos && r.photos[0]) || null;
  return (
    <Link to={`/autos/${r.id}`} className="block border border-slate-200 hover:border-slate-900 transition-colors group" data-testid={`auto-card-${r.id}`}>
      <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
        {photo ? (
          <img src={photo} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Car className="w-10 h-10 opacity-30" /></div>
        )}
        <div className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-widest bg-white/90 px-2 py-1 border border-slate-200">
          {r.year} {r.condition || ""}
        </div>
      </div>
      <div className="p-4">
        <div className="font-display font-bold text-base truncate group-hover:underline">{r.title}</div>
        {r.city && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
            <MapPin className="w-3 h-3" />{r.city}{r.state ? `, ${r.state}` : ""}
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <PriceTag price={r.price} />
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            {r.mileage != null && <span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" />{Math.round(r.mileage).toLocaleString()}</span>}
            {r.fuel && <span className="inline-flex items-center gap-1"><Fuel className="w-3 h-3" />{r.fuel === "Electric" ? "EV" : r.fuel.slice(0, 3)}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Autos() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [constants, setConstants] = useState({ auto_makes: [], auto_body_styles: [], auto_transmissions: [], auto_fuels: [], auto_conditions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/classifieds/constants").then(({ data }) => setConstants(data)); }, []);

  const f = {
    q: params.get("q") || "",
    make: params.get("make") || "",
    model: params.get("model") || "",
    body_style: params.get("body_style") || "",
    transmission: params.get("transmission") || "",
    fuel: params.get("fuel") || "",
    condition: params.get("condition") || "",
    min_year: params.get("min_year") || "",
    max_year: params.get("max_year") || "",
    min_price: params.get("min_price") || "",
    max_price: params.get("max_price") || "",
    max_mileage: params.get("max_mileage") || "",
    city: params.get("city") || "",
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) url.set(k, v); });
    url.set("limit", "60");
    api.get(`/autos?${url}`).then(({ data }) => {
      if (!cancelled) { setItems(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [params]);

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8" data-testid="autos-page">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Lumo · Marketplace</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight">Auto Sales</h1>
          <p className="text-slate-600 mt-1 text-sm max-w-xl">Cars, trucks, SUVs and EVs — buy direct from sellers. Message owners privately through Lumo.</p>
        </div>
        <Link to="/autos/list">
          <Button className="bg-slate-900 hover:bg-slate-800" data-testid="auto-list-btn">Sell my car</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-3 text-xs">
        <Input data-testid="auto-filter-q" placeholder="Search…" defaultValue={f.q} onBlur={(e) => set("q", e.target.value)} />
        <Select value={f.make || "any"} onValueChange={(v) => set("make", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="auto-filter-make"><SelectValue placeholder="Make" /></SelectTrigger>
          <SelectContent className="max-h-72"><SelectItem value="any">Any make</SelectItem>{constants.auto_makes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Input data-testid="auto-filter-model" placeholder="Model" defaultValue={f.model} onBlur={(e) => set("model", e.target.value)} />
        <Select value={f.body_style || "any"} onValueChange={(v) => set("body_style", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="auto-filter-body"><SelectValue placeholder="Body" /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any body</SelectItem>{constants.auto_body_styles.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.fuel || "any"} onValueChange={(v) => set("fuel", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="auto-filter-fuel"><SelectValue placeholder="Fuel" /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any fuel</SelectItem>{constants.auto_fuels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.transmission || "any"} onValueChange={(v) => set("transmission", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="auto-filter-trans"><SelectValue placeholder="Trans" /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any</SelectItem>{constants.auto_transmissions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Input data-testid="auto-filter-min-year" placeholder="Year min" type="number" defaultValue={f.min_year} onBlur={(e) => set("min_year", e.target.value)} />
        <Input data-testid="auto-filter-max-year" placeholder="Year max" type="number" defaultValue={f.max_year} onBlur={(e) => set("max_year", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-6 text-xs">
        <Input data-testid="auto-filter-min-price" placeholder="Min $" type="number" defaultValue={f.min_price} onBlur={(e) => set("min_price", e.target.value)} />
        <Input data-testid="auto-filter-max-price" placeholder="Max $" type="number" defaultValue={f.max_price} onBlur={(e) => set("max_price", e.target.value)} />
        <Input data-testid="auto-filter-max-mileage" placeholder="Max miles" type="number" defaultValue={f.max_mileage} onBlur={(e) => set("max_mileage", e.target.value)} />
        <Input data-testid="auto-filter-city" placeholder="City" defaultValue={f.city} onBlur={(e) => set("city", e.target.value)} />
        <Select value={f.condition || "any"} onValueChange={(v) => set("condition", v === "any" ? "" : v)}>
          <SelectTrigger data-testid="auto-filter-cond"><SelectValue placeholder="Condition" /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any</SelectItem>{constants.auto_conditions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-500 font-mono text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-24 text-center text-slate-500 font-mono text-sm">No cars match those filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="auto-grid">
          {items.map((r) => <ListingCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
