import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import MapView from "@/components/MapView";
import { Link } from "react-router-dom";
import CategoryBadge from "@/components/CategoryBadge";
import { ChevronRight } from "lucide-react";

// Display names + sort order for the 4 high-level groups returned by the API.
const GROUP_META = {
  delivery: { label: "Delivery & couriers",          order: 1, color: "#DC2626" },
  services: { label: "Local services",               order: 2, color: "#2563EB" },
  digital:  { label: "Digital, creative & remote",   order: 3, color: "#D97706" },
  remote:   { label: "Remote work",                  order: 4, color: "#0F766E" },
};

export default function MapPage() {
  const [pins, setPins] = useState([]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
  const [highlight, setHighlight] = useState(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (remoteOnly) params.set("remote_only", "true");
    if (groupFilter) params.set("category_group_filter", groupFilter);
    const { data } = await api.get(`/map/jobs?${params}`);
    setPins(data);
  };
  useEffect(() => { load(); }, [remoteOnly, groupFilter]);

  // Group jobs first by category_group, then sub-group by category inside.
  const grouped = useMemo(() => {
    const byGroup = {};
    for (const p of pins) {
      const g = p.category_group || "services";
      const cat = p.category || "other";
      byGroup[g] = byGroup[g] || {};
      byGroup[g][cat] = byGroup[g][cat] || [];
      byGroup[g][cat].push(p);
    }
    return Object.entries(byGroup)
      .sort(([a], [b]) => (GROUP_META[a]?.order || 99) - (GROUP_META[b]?.order || 99))
      .map(([groupKey, cats]) => ({
        key: groupKey,
        meta: GROUP_META[groupKey] || { label: groupKey, color: "#475569" },
        total: Object.values(cats).reduce((s, arr) => s + arr.length, 0),
        categories: Object.entries(cats)
          .sort(([a, ax], [b, bx]) => bx.length - ax.length || a.localeCompare(b))
          .map(([catName, jobs]) => ({ name: catName, jobs })),
      }));
  }, [pins]);

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="overline">Live map</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Every open job.</h1>
      <p className="text-slate-600 mt-2 max-w-xl">
        Pins coloured by category. Toggle <span className="text-teal-700 font-semibold">Remote-friendly</span> for remote-only opportunities.
      </p>

      <div className="mt-6">
        <MapView
          pins={pins}
          highlightId={highlight}
          onPinClick={(p) => setHighlight(p.id)}
          remoteOnly={remoteOnly}
          setRemoteOnly={setRemoteOnly}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          height={520}
        />
      </div>

      {/* Listings — grouped by type (delivery / services / digital / remote)
          then by category within each group. */}
      <div className="mt-10" data-testid="map-job-list">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display text-2xl font-black tracking-tighter">
            {pins.length} {pins.length === 1 ? "open job" : "open jobs"}
          </h2>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
            Grouped by type & category
          </div>
        </div>

        {grouped.length === 0 && (
          <div className="text-center py-16 border border-slate-200 text-sm text-slate-500" data-testid="map-empty">
            No jobs match your filters yet. Try switching off Remote-friendly or picking a different category group above.
          </div>
        )}

        <div className="space-y-10">
          {grouped.map((g) => (
            <section key={g.key} data-testid={`map-group-${g.key}`}>
              <div className="flex items-center gap-3 pb-2 border-b-2 border-slate-900 mb-4">
                <div className="w-2 h-6" style={{ background: g.meta.color }} />
                <h3 className="font-display text-xl font-black tracking-tighter">{g.meta.label}</h3>
                <div className="ml-auto text-xs font-mono uppercase tracking-wider text-slate-500">
                  {g.total} {g.total === 1 ? "job" : "jobs"}
                </div>
              </div>

              <div className="space-y-6">
                {g.categories.map((cat) => (
                  <div key={cat.name} data-testid={`map-category-${cat.name}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="overline text-slate-700">{cat.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">· {cat.jobs.length}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {cat.jobs.map((p) => (
                        <Link
                          key={p.id}
                          to={`/jobs/${p.id}`}
                          className={`group border bg-white p-4 transition-all flex gap-3 ${highlight === p.id ? "border-teal-700 ring-1 ring-teal-700" : "border-slate-200 hover:border-slate-400 hover:shadow-sm"}`}
                          data-testid={`map-card-${p.id}`}
                        >
                          <CategoryBadge group={p.category_group} isRemote={p.is_remote} />
                          <div className="flex-1 min-w-0">
                            <div className="font-display font-bold leading-tight line-clamp-2">{p.title}</div>
                            <div className="text-xs text-slate-500 font-mono mt-1.5">
                              ${Number(p.pay_rate || 0).toFixed(2)} / {p.pay_unit}
                            </div>
                            {p.address && (
                              <div className="text-[11px] text-slate-400 truncate mt-0.5">{p.address}</div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 self-center group-hover:text-slate-700 transition-colors flex-shrink-0" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
