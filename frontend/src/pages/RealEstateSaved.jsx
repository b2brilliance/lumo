import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Bell, BellOff, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import ReCard from "@/components/realestate/ReCard";
import { useReFavorites } from "@/components/realestate/reUtils";

function searchUrl(f) {
  const p = new URLSearchParams();
  const kind = f.kinds?.[0] || (f.property_types?.[0] === "commercial" || f.property_types?.[0] === "land" ? f.property_types[0] : "");
  if (kind) p.set("kind", kind);
  ["q", "min_price", "max_price", "min_beds", "min_baths"].forEach((k) => f[k] && p.set(k, f[k]));
  if (f.bbox) Object.entries(f.bbox).forEach(([k, v]) => p.set(k, v));
  if (f.place) p.set("place", f.place);
  return `/real-estate?${p}`;
}

function SavedSearchRow({ s, onChange }) {
  const toggle = async () => {
    try { await api.patch(`/real-estate/saved-searches/${s.id}`, { notify: !s.notify }); onChange(); } catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async () => {
    try { await api.delete(`/real-estate/saved-searches/${s.id}`); toast.success("Saved search removed"); onChange(); } catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="flex items-center gap-3 border border-slate-200 p-4" data-testid={`re-saved-search-${s.id}`}>
      <Search className="w-4 h-4 text-slate-400" />
      <div className="flex-1 min-w-0">
        <Link to={searchUrl(s.filters || {})} className="font-display font-bold hover:underline truncate block">{s.name}</Link>
        <div className="text-xs font-mono text-slate-500">{s.match_count || 0} alerts sent · {s.notify ? "alerts on" : "alerts paused"}</div>
      </div>
      <Button size="sm" variant="outline" onClick={toggle} data-testid={`re-saved-toggle-${s.id}`}>{s.notify ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}</Button>
      <Button size="sm" variant="ghost" className="text-red-600" onClick={del} data-testid={`re-saved-del-${s.id}`}><Trash2 className="w-4 h-4" /></Button>
    </div>
  );
}

export default function RealEstateSaved() {
  const { user, loading } = useAuth();
  const [searches, setSearches] = useState([]);
  const [homes, setHomes] = useState([]);
  const fav = useReFavorites();

  const load = () => {
    api.get("/real-estate/saved-searches").then(({ data }) => setSearches(data)).catch(() => {});
    api.get("/real-estate/favorites").then(({ data }) => setHomes(data.items || [])).catch(() => {});
  };
  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/signin" state={{ from: "/real-estate/saved" }} replace />;

  const unfav = async (id) => { await fav.toggle(id); setHomes((h) => h.filter((x) => x.id !== id)); };

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8" data-testid="re-saved-page">
      <Link to="/real-estate" className="text-xs font-mono text-slate-500 hover:underline">← Back to search</Link>
      <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">Saved</h1>

      <h2 className="font-display text-lg font-bold mt-8 mb-3">Saved searches & alerts</h2>
      {searches.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="re-saved-searches-empty">No saved searches yet. Run a search and tap "Save search" to get alerts on new matches.</p>
      ) : (
        <div className="space-y-2">{searches.map((s) => <SavedSearchRow key={s.id} s={s} onChange={load} />)}</div>
      )}

      <h2 className="font-display text-lg font-bold mt-10 mb-3">Saved homes</h2>
      {homes.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="re-saved-homes-empty">Tap the heart on any listing to save it here.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {homes.map((r) => <ReCard key={r.id} r={r} favorited onFavorite={unfav} />)}
        </div>
      )}
    </div>
  );
}
