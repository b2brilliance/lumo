import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const KIND_TABS = [
  { key: "all", label: "All" },
  { key: "sale", label: "Buy" },
  { key: "rent", label: "Rent" },
  { key: "short_stay", label: "Short stays" },
  { key: "room", label: "Rooms" },
  { key: "commercial", label: "Commercial" },
  { key: "land", label: "Land" },
];

export const PROPERTY_TYPES = ["house", "condo", "townhouse", "apartment", "multi_family", "villa", "cabin", "studio", "land", "commercial"];

export const KIND_LABEL = { sale: "For sale", rent: "For rent", short_stay: "Short stay", room: "Room / shared" };
export const UNIT_LABEL = { month: "/mo", week: "/wk", night: "/night", total: "" };

// Turn the UI tab + URL params into API query params.
export function apiParamsFrom(params) {
  const out = new URLSearchParams();
  const kind = params.get("kind") || "all";
  if (["sale", "rent", "short_stay", "room"].includes(kind)) out.set("listing_kind", kind);
  if (kind === "commercial" || kind === "land") out.set("property_type", kind);
  else if (params.get("type")) out.set("property_type", params.get("type"));
  ["q", "min_price", "max_price", "min_beds", "min_baths", "sort", "north", "south", "east", "west"].forEach((k) => {
    if (params.get(k)) out.set(k, params.get(k));
  });
  return out;
}

// Saved-search filter object (matches backend listing_matches).
export function savedFiltersFrom(params) {
  const p = apiParamsFrom(params);
  const f = {};
  if (p.get("listing_kind")) f.kinds = [p.get("listing_kind")];
  if (p.get("property_type")) f.property_types = p.get("property_type").split(",");
  ["q", "min_price", "max_price", "min_beds", "min_baths"].forEach((k) => { if (p.get(k)) f[k] = p.get(k); });
  if (p.get("north")) f.bbox = { north: +p.get("north"), south: +p.get("south"), east: +p.get("east"), west: +p.get("west") };
  if (params.get("place")) f.place = params.get("place");
  return f;
}

export function fmtPrice(price, currency = "USD", compact = false) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: currency || "USD",
      notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0,
    }).format(price || 0);
  } catch {
    return `${currency} ${Math.round(price || 0).toLocaleString()}`;
  }
}

export function useReFavorites() {
  const { user } = useAuth();
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    if (!user) { setIds(new Set()); return; }
    api.get("/real-estate/favorites").then(({ data }) => setIds(new Set(data.ids || []))).catch(() => {});
  }, [user]);
  const toggle = useCallback(async (id) => {
    const { data } = await api.post(`/real-estate/favorites/${id}`);
    setIds((prev) => {
      const next = new Set(prev);
      if (data.favorited) next.add(id); else next.delete(id);
      return next;
    });
    return data.favorited;
  }, []);
  return { ids, toggle, signedIn: !!user };
}
