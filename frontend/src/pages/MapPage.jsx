import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import MapView from "@/components/MapView";
import { Link } from "react-router-dom";
import CategoryBadge from "@/components/CategoryBadge";

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
  useEffect(() => { load(); }, [remoteOnly, groupFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="overline">Live map</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Every open job.</h1>
      <p className="text-slate-600 mt-2 max-w-xl">Pins coloured by category. Toggle <span className="text-teal-700 font-semibold">Remote-friendly</span> for remote-only opportunities.</p>
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
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 mt-8 border border-slate-200" data-testid="map-job-list">
        {pins.map((p) => (
          <Link key={p.id} to={`/jobs/${p.id}`} className={`bg-white p-4 flex gap-3 hover:bg-slate-50 ${highlight === p.id ? "ring-2 ring-teal-700" : ""}`} data-testid={`map-card-${p.id}`}>
            <CategoryBadge group={p.category_group} isRemote={p.is_remote} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold truncate">{p.title}</div>
              <div className="text-xs text-slate-500 font-mono mt-1">${p.pay_rate.toFixed(2)} / {p.pay_unit}{p.address ? ` · ${p.address}` : ""}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
