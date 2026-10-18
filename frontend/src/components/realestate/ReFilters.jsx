import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { KIND_TABS, PROPERTY_TYPES } from "./reUtils";

export function KindTabs({ value, onChange }) {
  return (
    <div className="relative">
    <div className="flex gap-1 overflow-x-auto no-scrollbar pr-8" data-testid="re-kind-tabs">
      {KIND_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`shrink-0 px-3 py-2 text-xs font-mono uppercase tracking-widest border transition-colors ${
            value === t.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-900"
          }`}
          data-testid={`re-kind-${t.key}`}
        >
          {t.label}
        </button>
      ))}
    </div>
    <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white to-transparent lg:hidden" />
    </div>
  );
}

export function FilterRow({ params, set }) {
  const kind = params.get("kind") || "all";
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Input className="w-24 h-9" type="number" placeholder="Min price" defaultValue={params.get("min_price") || ""} onBlur={(e) => set("min_price", e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} data-testid="re-filter-min-price" />
      <Input className="w-24 h-9" type="number" placeholder="Max price" defaultValue={params.get("max_price") || ""} onBlur={(e) => set("max_price", e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} data-testid="re-filter-max-price" />
      <Select value={params.get("min_beds") || "any"} onValueChange={(v) => set("min_beds", v === "any" ? "" : v)}>
        <SelectTrigger className="w-28 h-9" data-testid="re-filter-beds"><SelectValue placeholder="Beds" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any beds</SelectItem>
          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}+ beds</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("min_baths") || "any"} onValueChange={(v) => set("min_baths", v === "any" ? "" : v)}>
        <SelectTrigger className="w-28 h-9" data-testid="re-filter-baths"><SelectValue placeholder="Baths" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any baths</SelectItem>
          {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}+ baths</SelectItem>)}
        </SelectContent>
      </Select>
      {kind !== "commercial" && kind !== "land" && (
        <Select value={params.get("type") || "any"} onValueChange={(v) => set("type", v === "any" ? "" : v)}>
          <SelectTrigger className="w-36 h-9" data-testid="re-filter-type"><SelectValue placeholder="Home type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All home types</SelectItem>
            {PROPERTY_TYPES.map((p) => <SelectItem key={p} value={p}>{p.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={params.get("sort") || "newest"} onValueChange={(v) => set("sort", v === "newest" ? "" : v)}>
        <SelectTrigger className="w-48 h-9" data-testid="re-filter-sort"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="price_asc">Price: low → high</SelectItem>
          <SelectItem value="price_desc">Price: high → low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
