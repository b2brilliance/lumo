import React, { useEffect, useRef, useState } from "react";
import { api, ALL_CATEGORIES, CATEGORY_COLORS, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import MapView from "@/components/MapView";
import CategoryBadge from "@/components/CategoryBadge";
import { toast } from "sonner";
import { Wallet, MapPin, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";

export default function ProviderHub() {
  const { user, updateMe } = useAuth();
  const [pins, setPins] = useState([]);
  const [opps, setOpps] = useState([]);
  const [highlightId, setHighlightId] = useState(null);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
  const seenIdsRef = useRef(new Set());
  const lastPollRef = useRef(new Date().toISOString());
  const [profileBusy, setProfileBusy] = useState(false);
  const [profile, setProfile] = useState({
    address: user.location?.address || "",
    lat: user.location?.lat || 40.7128,
    lng: user.location?.lng || -74.006,
    radius: user.service_radius_miles || 25,
    categories: user.categories || [],
  });

  const loadPins = async () => {
    const params = new URLSearchParams();
    if (remoteOnly) params.set("remote_only", "true");
    if (groupFilter) params.set("category_group_filter", groupFilter);
    const { data } = await api.get(`/map/jobs?${params.toString()}`);
    setPins(data);
  };

  const loadOpps = async () => {
    const { data } = await api.get(`/provider/opportunities`);
    setOpps(data);
    // initial baseline = don't toast existing
    data.forEach((o) => seenIdsRef.current.add(o.id));
  };

  const pollNew = async () => {
    try {
      const since = lastPollRef.current;
      lastPollRef.current = new Date().toISOString();
      const { data } = await api.get(`/provider/opportunities?since=${encodeURIComponent(since)}`);
      const fresh = data.filter((d) => !seenIdsRef.current.has(d.id));
      fresh.forEach((j) => seenIdsRef.current.add(j.id));
      if (fresh.length > 0) {
        // refresh map + opps lists
        loadPins();
        setOpps((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...fresh.filter((f) => !ids.has(f.id)), ...prev];
        });
        fresh.forEach((j) => {
          const miles = j.distance_miles != null ? `${j.distance_miles} mi` : (j.is_remote ? "Remote" : "—");
          toast(j.title, {
            description: `${miles} · $${j.pay_rate.toFixed(2)}/${j.pay_unit}`,
            duration: 8000,
            action: {
              label: "Fly to pin",
              onClick: () => {
                setHighlightId(j.id);
                document.getElementById("provider-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            },
            id: `opp-${j.id}`,
          });
        });
      }
    } catch (e) {
      // silently fail
    }
  };

  useEffect(() => {
    loadOpps();
    loadPins();
    const t = setInterval(pollNew, 15000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadPins(); }, [remoteOnly, groupFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async (id) => {
    try {
      await api.post(`/jobs/${id}/accept`);
      toast.success("Job accepted");
      loadOpps(); loadPins();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault(); setProfileBusy(true);
    try {
      await updateMe({
        location: { lat: parseFloat(profile.lat), lng: parseFloat(profile.lng), address: profile.address },
        service_radius_miles: parseFloat(profile.radius),
        categories: profile.categories,
      });
      toast.success("Profile updated");
      loadOpps();
    } catch (e) {
      toast.error("Failed to update");
    } finally { setProfileBusy(false); }
  };

  const toggleCat = (v) => setProfile((p) => ({
    ...p,
    categories: p.categories.includes(v) ? p.categories.filter((x) => x !== v) : [...p.categories, v],
  }));

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Provider Hub</div>
          <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Live opportunities</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/wallet" className="border border-slate-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-50" data-testid="provider-wallet-link">
            <Wallet className="w-4 h-4 text-teal-700" />
            <span className="overline">Wallet</span>
            <span className="font-display font-bold">${Number(user.wallet_balance || 0).toFixed(2)}</span>
          </Link>
        </div>
      </div>

      <div id="provider-map" className="mt-6">
        <MapView
          pins={pins}
          highlightId={highlightId}
          onPinClick={(p) => setHighlightId(p.id)}
          remoteOnly={remoteOnly}
          setRemoteOnly={setRemoteOnly}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          height={400}
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-8 mt-8">
        <div className="lg:col-span-8">
          <div className="overline">Opportunities in your radius ({opps.length})</div>
          <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="opportunities-list">
            {opps.length === 0 && <div className="p-6 text-sm text-slate-500">No matches right now. Toast will fire when a new job lands.</div>}
            {opps.map((j) => (
              <div
                key={j.id}
                className={`p-4 grid grid-cols-12 gap-4 items-center cursor-pointer transition-colors ${highlightId === j.id ? "bg-teal-50" : "hover:bg-slate-50"}`}
                onClick={() => setHighlightId(j.id)}
                data-testid={`opportunity-${j.id}`}
              >
                <div className="col-span-2"><CategoryBadge group={j.category_group} isRemote={j.is_remote} /></div>
                <div className="col-span-5">
                  <div className="font-display font-bold">{j.title}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-1">{j.description}</div>
                </div>
                <div className="col-span-2 font-mono text-xs">
                  <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {j.distance_miles != null ? `${j.distance_miles} mi` : (j.is_remote ? "Remote" : "—")}</div>
                </div>
                <div className="col-span-2 font-mono text-xs">
                  <div className="font-display text-base font-bold text-slate-900">${j.pay_rate.toFixed(2)}</div>
                  <div className="text-slate-500 uppercase">per {j.pay_unit}</div>
                </div>
                <div className="col-span-1 text-right">
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); accept(j.id); }} className="bg-teal-700 hover:bg-teal-800" data-testid={`accept-job-${j.id}`}>
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={saveProfile} className="lg:col-span-4 border border-slate-200 p-6 space-y-4 h-fit" data-testid="provider-profile-form">
          <div className="overline flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" /> Match settings</div>
          <div>
            <Label className="overline">Your base location</Label>
            <Input value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} placeholder="City, address…" data-testid="provider-address" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="overline">Lat</Label>
              <Input type="number" step="0.0001" value={profile.lat} onChange={(e) => setProfile((p) => ({ ...p, lat: e.target.value }))} data-testid="provider-lat" className="mt-1" />
            </div>
            <div>
              <Label className="overline">Lng</Label>
              <Input type="number" step="0.0001" value={profile.lng} onChange={(e) => setProfile((p) => ({ ...p, lng: e.target.value }))} data-testid="provider-lng" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="overline">Service radius (miles)</Label>
            <Input type="number" value={profile.radius} onChange={(e) => setProfile((p) => ({ ...p, radius: e.target.value }))} data-testid="provider-radius" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Categories you serve</Label>
            <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
              {ALL_CATEGORIES.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`provider-cat-${c.value}`}>
                  <Checkbox checked={profile.categories.includes(c.value)} onCheckedChange={() => toggleCat(c.value)} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLORS[c.group].hex }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={profileBusy} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="provider-profile-save">
            {profileBusy ? "Saving…" : "Save match settings"}
          </Button>
        </form>
      </div>
    </div>
  );
}
