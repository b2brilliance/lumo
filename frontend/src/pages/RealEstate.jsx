import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Home, Map as MapIcon, List, Bookmark, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import ReMap from "@/components/realestate/ReMap";
import ReCard from "@/components/realestate/ReCard";
import PlaceSearch from "@/components/realestate/PlaceSearch";
import SaveSearchButton from "@/components/realestate/SaveSearchButton";
import { KindTabs, FilterRow } from "@/components/realestate/ReFilters";
import { apiParamsFrom, useReFavorites } from "@/components/realestate/reUtils";

const BOUND_KEYS = ["north", "south", "east", "west"];

export default function RealEstate() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [fitTo, setFitTo] = useState(null);
  const [mobileView, setMobileView] = useState("list");
  const [followMap, setFollowMap] = useState(true);
  const firstFit = useRef(false);
  const fav = useReFavorites();

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => { if (v === "" || v == null) next.delete(k); else next.set(k, String(v)); });
    setParams(next, { replace: true });
  };
  const set = (k, v) => update({ [k]: v });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      const q = apiParamsFrom(params);
      q.set("limit", "300");
      api.get(`/real-estate?${q}`).then(({ data }) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
        if (!firstFit.current) {
          firstFit.current = true;
          if (params.get("north")) {
            setFitTo({ bbox: Object.fromEntries(BOUND_KEYS.map((k) => [k, +params.get(k)])) });
          } else {
            const pts = data.filter((r) => r.lat != null).map((r) => [r.lat, r.lng]);
            if (pts.length) setFitTo({ points: pts });
          }
        }
      }).catch(() => { if (!cancelled) { setItems([]); setLoading(false); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [params]);

  const onBounds = (b) => {
    if (!followMap) return;
    update(Object.fromEntries(BOUND_KEYS.map((k) => [k, b[k].toFixed(4)])));
  };

  const onPlace = (p) => {
    const bbox = p.bbox || { north: p.lat + 0.1, south: p.lat - 0.1, east: p.lng + 0.1, west: p.lng - 0.1 };
    update({ place: p.label.split(",").slice(0, 2).join(","), ...Object.fromEntries(BOUND_KEYS.map((k) => [k, bbox[k].toFixed(4)])) });
    setFitTo({ bbox });
    setMobileView("map");
  };

  const toggleFav = async (id) => {
    if (!fav.signedIn) { nav("/signin", { state: { from: "/real-estate" } }); return; }
    try {
      const on = await fav.toggle(id);
      toast.success(on ? "Saved to your homes" : "Removed from saved homes");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const clearArea = () => { update({ north: "", south: "", east: "", west: "", place: "" }); setFitTo({ bbox: { north: 70, south: -50, east: 170, west: -170 } }); };
  const hasFilters = [...params.keys()].length > 0;

  return (
    <div className="bg-white" data-testid="real-estate-page">
      <Helmet><title>Homes for sale, rent & short stays worldwide · Lumo Real Estate</title></Helmet>

      <div className="border-b border-slate-200 px-4 sm:px-6 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PlaceSearch initial={params.get("place") || ""} onPick={onPlace} />
          <SaveSearchButton params={params} />
          <Link to="/real-estate/saved"><Button variant="outline" className="h-11" data-testid="re-saved-link"><Bookmark className="w-4 h-4 mr-2" />Saved</Button></Link>
          <Link to="/real-estate/list"><Button variant="outline" className="h-11" data-testid="re-list-btn"><Plus className="w-4 h-4 mr-2" />List a property</Button></Link>
        </div>
        <KindTabs value={params.get("kind") || "all"} onChange={(k) => set("kind", k === "all" ? "" : k)} />
        <FilterRow key={params.get("kind") || "all"} params={params} set={set} />
      </div>

      <div className="lg:grid lg:grid-cols-[1.15fr_1fr] lg:h-[calc(100vh-220px)] lg:min-h-[560px]">
        <div className={`${mobileView === "map" ? "block" : "hidden"} lg:block relative h-[70vh] lg:h-full border-r border-slate-200`}>
          <ReMap items={items} activeId={activeId} onHover={setActiveId} onSelect={(r) => nav(`/real-estate/${r.id}`)} onBounds={onBounds} fitTo={fitTo} />
          <label className="absolute top-3 left-14 z-[500] bg-white border border-slate-900 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-2 cursor-pointer shadow">
            <input type="checkbox" checked={followMap} onChange={(e) => setFollowMap(e.target.checked)} data-testid="re-follow-map" />
            Search as I move the map
          </label>
        </div>

        <div className={`${mobileView === "list" ? "block" : "hidden"} lg:block lg:h-full lg:overflow-y-auto px-4 sm:px-6 py-4`} data-testid="re-results">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm"><span className="font-display font-bold text-lg" data-testid="re-count">{loading ? "…" : items.length}</span> <span className="text-slate-500">homes{params.get("place") ? ` in ${params.get("place")}` : params.get("north") ? " in this map area" : " worldwide"}</span></div>
            {params.get("north") && <button onClick={clearArea} className="text-xs font-mono underline text-slate-600" data-testid="re-clear-area">Search worldwide</button>}
          </div>
          {loading && items.length === 0 ? (
            <div className="py-24 text-center text-slate-500 font-mono text-sm">Loading…</div>
          ) : items.length === 0 ? (
            hasFilters ? (
              <div className="py-20 text-center border border-dashed border-slate-300" data-testid="re-empty-filtered">
                <div className="font-display text-xl font-bold">No homes match here.</div>
                <p className="text-sm text-slate-500 mt-2">Zoom out, move the map or loosen your filters.</p>
                <Button variant="outline" className="mt-5" onClick={() => { setParams(new URLSearchParams()); clearArea(); }} data-testid="re-reset-filters">Reset all filters</Button>
              </div>
            ) : (
              <div className="py-20 text-center border border-dashed border-slate-300" data-testid="re-empty">
                <Home className="w-10 h-10 mx-auto opacity-40" />
                <div className="font-display text-2xl font-bold mt-4">No listings yet — be the first.</div>
                <p className="text-sm text-slate-500 mt-2">List a home, condo, land, room or short stay and reach people worldwide.</p>
                <Link to="/real-estate/list"><Button className="mt-6" data-testid="re-empty-list-btn">List a property</Button></Link>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="re-grid">
              {items.map((r) => (
                <ReCard key={r.id} r={r} active={r.id === activeId} onHover={setActiveId} favorited={fav.ids.has(r.id)} onFavorite={toggleFav} />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMobileView(mobileView === "map" ? "list" : "map")}
        className="lg:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-[600] bg-slate-900 text-white px-5 py-3 text-xs font-mono uppercase tracking-widest flex items-center gap-2 shadow-xl"
        data-testid="re-mobile-toggle"
      >
        {mobileView === "map" ? <><List className="w-4 h-4" />List</> : <><MapIcon className="w-4 h-4" />Map</>}
      </button>
    </div>
  );
}
