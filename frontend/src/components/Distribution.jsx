import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Send, Trash2, Power, TestTube, Eye, EyeOff, Clock, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

const CADENCE_OPTIONS = [
  { hours: 1, label: "Every hour" },
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Daily" },
  { hours: 72, label: "Every 3 days" },
  { hours: 168, label: "Weekly" },
];

export default function Distribution() {
  const [types, setTypes] = useState({});
  const [connectors, setConnectors] = useState([]);
  const [ads, setAds] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newPlatform, setNewPlatform] = useState("");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState({});
  const [reveal, setReveal] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [bcastModal, setBcastModal] = useState(null);
  const [bcastResult, setBcastResult] = useState(null);
  const [schedModal, setSchedModal] = useState(false);
  const [schedForm, setSchedForm] = useState({ name: "Lumo daily drip", ad_ids: [], cadence_hours: 24, mode: "interval", daily_times: ["09:00", "21:00"], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });

  useEffect(() => {
    api.get("/admin/distribution/types").then(({ data }) => setTypes(data.types || {})).catch(() => {});
    refreshConnectors();
    refreshSchedules();
    api.get("/admin/ads").then(({ data }) => setAds(data || [])).catch(() => {});
  }, []);

  const refreshConnectors = () => api.get("/admin/distribution/connectors").then(({ data }) => setConnectors(data || [])).catch(() => {});
  const refreshSchedules = () => api.get("/admin/distribution/schedules").then(({ data }) => setSchedules(data || [])).catch(() => {});

  const startAdd = (platform) => {
    setNewPlatform(platform);
    setNewName(types[platform]?.label || platform);
    setNewConfig({});
    setShowAdd(true);
  };

  const saveConnector = async () => {
    try {
      await api.post("/admin/distribution/connectors", { platform: newPlatform, name: newName, config: newConfig, enabled: true });
      toast.success("Connector added");
      setShowAdd(false);
      refreshConnectors();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleEnabled = async (c) => {
    try { await api.patch(`/admin/distribution/connectors/${c.id}`, { enabled: !c.enabled }); refreshConnectors(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const removeConnector = async (id) => {
    if (!window.confirm("Remove this connector? This will not delete the channel itself.")) return;
    try { await api.delete(`/admin/distribution/connectors/${id}`); toast.success("Removed"); refreshConnectors(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const testConnector = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.post(`/admin/distribution/connectors/${id}/test`);
      if (data.status === "ok") toast.success("✓ Test post sent");
      else toast.message(data.reason || "Skipped (token UI ready, integration pending)");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusyId(null); }
  };

  const broadcast = async (adId, connectorIds) => {
    setBusyId("broadcast");
    try {
      const { data } = await api.post("/admin/distribution/broadcast", { ad_id: adId, connector_ids: connectorIds });
      setBcastResult(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusyId(null); }
  };

  const toggleAdInSchedForm = (adId) => {
    setSchedForm((f) => {
      const has = f.ad_ids.includes(adId);
      return { ...f, ad_ids: has ? f.ad_ids.filter((x) => x !== adId) : [...f.ad_ids, adId] };
    });
  };

  const saveSchedule = async () => {
    if (schedForm.ad_ids.length === 0) { toast.error("Pick at least one ad"); return; }
    const payload = {
      name: schedForm.name,
      ad_ids: schedForm.ad_ids,
      cadence_hours: schedForm.cadence_hours,
    };
    if (schedForm.mode === "times" && schedForm.daily_times.length > 0) {
      payload.daily_times = [...schedForm.daily_times].sort();
      payload.timezone = schedForm.timezone;
    }
    try {
      await api.post("/admin/distribution/schedules", payload);
      toast.success("Schedule created — first post will fire at the next slot");
      setSchedModal(false);
      setSchedForm({ name: "Lumo daily drip", ad_ids: [], cadence_hours: 24, mode: "interval", daily_times: ["09:00", "21:00"], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
      refreshSchedules();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleSchedule = async (s) => {
    try { await api.patch(`/admin/distribution/schedules/${s.id}`, { enabled: !s.enabled }); refreshSchedules(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const deleteSchedule = async (id) => {
    if (!window.confirm("Stop this schedule?")) return;
    try { await api.delete(`/admin/distribution/schedules/${id}`); toast.success("Stopped"); refreshSchedules(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const instantConnectors = useMemo(() => Object.entries(types).filter(([k, v]) => v.instant).map(([k, v]) => [k, v]), [types]);
  const tokenConnectors = useMemo(() => Object.entries(types).filter(([k, v]) => !v.instant).map(([k, v]) => [k, v]), [types]);

  // ── Auto-pilot panel state ──
  const [ap, setAp] = useState(null);          // settings doc
  const [apLog, setApLog] = useState([]);
  const [apBusy, setApBusy] = useState(false);
  const loadAp = () => {
    api.get("/admin/autopilot/settings").then(({ data }) => setAp(data)).catch(() => {});
    api.get("/admin/autopilot/log?limit=10").then(({ data }) => setApLog(data.items || [])).catch(() => {});
  };
  useEffect(() => { loadAp(); }, []);
  const patchAp = async (patch) => {
    try { const { data } = await api.patch("/admin/autopilot/settings", patch); setAp(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const runAutopilotNow = async () => {
    setApBusy(true);
    try {
      const { data } = await api.post("/admin/autopilot/run-now");
      toast.success(`Posted "${(data.headline || '').slice(0, 60)}" to ${data.summary.ok} channel${data.summary.ok === 1 ? "" : "s"}`);
      loadAp();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setApBusy(false); }
  };

  return (
    <div data-testid="distribution-tab">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Social Distribution</div>
          <h3 className="font-display text-2xl font-black tracking-tighter mt-1">Broadcast Lumo to every channel.</h3>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl">
            Add a channel (Discord webhook + Telegram bot work instantly with no developer signup), then 1-click broadcast any Ad Studio creative to all enabled channels at once.
          </p>
        </div>
      </div>

      {/* AUTO-PILOT */}
      <div className="mt-6 border border-teal-700/40 bg-teal-50/30 p-5" data-testid="autopilot-panel">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="overline text-teal-800">Daily Auto-pilot</div>
            <h3 className="font-display text-xl font-black tracking-tight mt-1">Post one ad per day, automatically.</h3>
            <p className="text-xs text-slate-600 mt-1 max-w-xl">
              When enabled, Lumo picks one ad from your library and broadcasts it to every enabled channel once a day at the time you choose. Hashtags fly with each post — drop the webhook URLs of <em>public Discord servers, Telegram channels, Slack workspaces, Zapier/Make catch hooks</em> above to maximize reach in open communities.
            </p>
          </div>
          <Button onClick={runAutopilotNow} disabled={apBusy} variant="outline" data-testid="autopilot-run-now">
            {apBusy ? "Sending…" : "Run a cycle now"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
          <label className="flex items-center gap-2 border border-slate-200 px-3 py-2 cursor-pointer bg-white">
            <input
              type="checkbox"
              checked={!!ap?.enabled}
              onChange={(e) => patchAp({ enabled: e.target.checked })}
              data-testid="autopilot-enabled"
            />
            <span><span className="font-bold">{ap?.enabled ? "Enabled" : "Off"}</span> — daily broadcast</span>
          </label>
          <div className="border border-slate-200 px-3 py-2 bg-white">
            <Label className="overline">Run time (UTC)</Label>
            <Input
              type="time"
              value={ap?.daily_time_utc || "14:00"}
              onChange={(e) => patchAp({ daily_time_utc: e.target.value })}
              className="mt-1"
              data-testid="autopilot-time"
            />
          </div>
          <label className="flex items-center gap-2 border border-slate-200 px-3 py-2 cursor-pointer bg-white">
            <input
              type="checkbox"
              checked={ap?.shuffle !== false}
              onChange={(e) => patchAp({ shuffle: e.target.checked })}
              data-testid="autopilot-shuffle"
            />
            <span>{ap?.shuffle !== false ? "Random ad each day" : "Round-robin through library"}</span>
          </label>
        </div>
        {apLog.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs font-mono uppercase tracking-widest text-slate-500 cursor-pointer">Recent activity ({apLog.length})</summary>
            <div className="mt-2 space-y-1 text-xs font-mono">
              {apLog.map((l, i) => (
                <div key={i} className="flex justify-between border-b border-slate-100 py-1" data-testid={`autopilot-log-${i}`}>
                  <span className="truncate pr-2">{l.headline}{l.manual ? " · manual" : ""}</span>
                  <span className="text-slate-500">{l.summary?.ok || 0} ok · {l.summary?.failed || 0} failed · {new Date(l.ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ADD-CONNECTOR SHELF */}
      <div className="mt-6 border border-slate-200 bg-slate-50/50 p-5">
        <div className="overline text-teal-700">Add a channel</div>
        <div className="mt-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">Works instantly</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {instantConnectors.map(([k, v]) => (
              <button key={k} onClick={() => startAdd(k)} className="border border-slate-200 bg-white px-3 py-3 text-left hover:border-slate-900 transition-colors group" data-testid={`add-connector-${k}`}>
                <div className="font-bold text-sm">{v.label}</div>
                <div className="text-[10px] font-mono text-teal-700 mt-1">✓ no signup needed</div>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">Requires dev token (paste when ready)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {tokenConnectors.map(([k, v]) => (
              <button key={k} onClick={() => startAdd(k)} className="border border-slate-200 bg-white px-3 py-3 text-left hover:border-slate-900 transition-colors" data-testid={`add-connector-${k}`}>
                <div className="font-bold text-sm">{v.label}</div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">⏳ paste token</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONNECTOR LIST */}
      <div className="mt-8">
        <div className="overline">Your channels ({connectors.length})</div>
        {connectors.length === 0 ? (
          <div className="mt-3 p-12 border-2 border-dashed border-slate-200 text-center text-sm text-slate-500" data-testid="connectors-empty">
            No channels yet. Click any tile above to add one.
          </div>
        ) : (
          <div className="mt-3 grid gap-2" data-testid="connectors-list">
            {connectors.map((c) => (
              <div key={c.id} className="border border-slate-200 p-4 grid grid-cols-12 gap-4 items-center" data-testid={`connector-${c.id}`}>
                <div className="col-span-12 md:col-span-5">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${c.enabled ? "bg-teal-500" : "bg-slate-300"}`} />
                    <span className="font-display font-bold">{c.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.platform_label}</div>
                </div>
                <div className="col-span-6 md:col-span-3 text-xs font-mono">
                  <div>{c.post_count || 0} posts</div>
                  {c.last_broadcast_at && <div className="text-slate-500 mt-0.5">last: {new Date(c.last_broadcast_at).toLocaleString()}</div>}
                </div>
                <div className="col-span-6 md:col-span-4 flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => testConnector(c.id)} disabled={busyId === c.id} title="Send a test post" data-testid={`connector-test-${c.id}`}>
                    {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><TestTube className="w-3.5 h-3.5 mr-1" />Test</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleEnabled(c)} title={c.enabled ? "Disable" : "Enable"} data-testid={`connector-toggle-${c.id}`}>
                    <Power className={`w-3.5 h-3.5 ${c.enabled ? "text-teal-700" : "text-slate-400"}`} />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => removeConnector(c.id)} className="text-red-600 hover:bg-red-50" data-testid={`connector-delete-${c.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BROADCAST CTA */}
      {ads.length > 0 && connectors.some((c) => c.enabled) && (
        <div className="mt-8 border border-teal-200 bg-teal-50/30 p-5">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <div className="overline text-teal-700">Broadcast</div>
              <h4 className="font-display text-xl font-bold tracking-tight mt-1">Send an Ad Studio creative to all enabled channels.</h4>
              <p className="text-xs text-slate-600 mt-1">{connectors.filter((c) => c.enabled).length} channels enabled · {ads.length} ads in library</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setSchedModal(true)} variant="outline" className="border-teal-700 text-teal-700 hover:bg-teal-50" data-testid="schedule-open">
                <Clock className="w-4 h-4 mr-2" /> Auto-distribute
              </Button>
              <Button onClick={() => setBcastModal({ ads })} className="bg-teal-700 hover:bg-teal-800 text-white" data-testid="broadcast-open">
                <Send className="w-4 h-4 mr-2" /> Broadcast now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULES LIST */}
      {schedules.length > 0 && (
        <div className="mt-8" data-testid="schedules-list">
          <div className="overline">Auto-distribute schedules ({schedules.length})</div>
          <div className="mt-3 grid gap-2">
            {schedules.map((s) => {
              const nextRunDate = s.next_run_at ? new Date(s.next_run_at) : null;
              return (
                <div key={s.id} className="border border-slate-200 p-4 grid grid-cols-12 gap-4 items-center" data-testid={`schedule-${s.id}`}>
                  <div className="col-span-12 md:col-span-5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${s.enabled ? "bg-teal-500" : "bg-slate-300"}`} />
                      <span className="font-display font-bold">{s.name}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      {s.ad_ids?.length || 0} ads · {(s.daily_times && s.daily_times.length > 0) ? `${s.daily_times.length}×/day at ${[...s.daily_times].sort().join(", ")} (${s.timezone || "UTC"})` : `every ${s.cadence_hours}h`}
                    </div>
                  </div>
                  <div className="col-span-6 md:col-span-4 text-xs font-mono">
                    <div className="text-slate-700">{s.posts_sent || 0} posts sent</div>
                    {nextRunDate && s.enabled && <div className="text-teal-700 mt-0.5">next: {nextRunDate.toLocaleString()}</div>}
                  </div>
                  <div className="col-span-6 md:col-span-3 flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => toggleSchedule(s)} title={s.enabled ? "Pause" : "Resume"} data-testid={`schedule-toggle-${s.id}`}>
                      <Power className={`w-3.5 h-3.5 ${s.enabled ? "text-teal-700" : "text-slate-400"}`} />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteSchedule(s.id)} className="text-red-600 hover:bg-red-50" data-testid={`schedule-delete-${s.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CREATE SCHEDULE MODAL */}
      {schedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSchedModal(false)} data-testid="schedule-modal">
          <div className="bg-white w-full max-w-2xl border border-slate-200 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="overline text-teal-700">Auto-distribute</div>
              <h3 className="font-display text-2xl font-black tracking-tight mt-1">Set & forget growth engine.</h3>
              <p className="text-xs text-slate-500 mt-1">Pick ads → choose cadence → Lumo rotates through them across every enabled channel, forever.</p>
            </div>
            <div className="px-5 py-4 space-y-5 overflow-y-auto">
              <div>
                <label className="overline text-slate-500">Schedule name</label>
                <Input value={schedForm.name} onChange={(e) => setSchedForm({ ...schedForm, name: e.target.value })} className="mt-1" data-testid="schedule-name" />
              </div>
              <div>
                <label className="overline text-slate-500">When to post</label>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => setSchedForm({ ...schedForm, mode: "interval" })}
                    className={`text-[10px] font-mono uppercase tracking-widest border px-2 py-2 ${schedForm.mode === "interval" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    data-testid="schedule-mode-interval">Every N hours</button>
                  <button type="button" onClick={() => setSchedForm({ ...schedForm, mode: "times" })}
                    className={`text-[10px] font-mono uppercase tracking-widest border px-2 py-2 ${schedForm.mode === "times" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    data-testid="schedule-mode-times">Specific times of day</button>
                </div>
                {schedForm.mode === "interval" ? (
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-1">
                    {CADENCE_OPTIONS.map((o) => (
                      <button key={o.hours} type="button" onClick={() => setSchedForm({ ...schedForm, cadence_hours: o.hours })}
                        className={`text-[10px] font-mono uppercase tracking-widest border px-1 py-2 ${schedForm.cadence_hours === o.hours ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                        data-testid={`schedule-cadence-${o.hours}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2" data-testid="schedule-times-list">
                      {schedForm.daily_times.map((t, i) => (
                        <div key={i} className="flex items-center gap-1 border border-slate-300 bg-white px-2 py-1">
                          <input
                            type="time"
                            value={t}
                            onChange={(e) => {
                              const arr = [...schedForm.daily_times];
                              arr[i] = e.target.value;
                              setSchedForm({ ...schedForm, daily_times: arr });
                            }}
                            className="text-sm font-mono outline-none"
                            data-testid={`schedule-time-${i}`}
                          />
                          <button type="button" onClick={() => setSchedForm({ ...schedForm, daily_times: schedForm.daily_times.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600" aria-label="Remove">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setSchedForm({ ...schedForm, daily_times: [...schedForm.daily_times, "12:00"] })}
                        className="border border-dashed border-slate-300 px-3 py-1 text-xs font-mono uppercase tracking-widest text-slate-600 hover:border-slate-900" data-testid="schedule-time-add">
                        + Add time
                      </button>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Posts {schedForm.daily_times.length}× / day at: {[...schedForm.daily_times].sort().join(" · ")} <span className="opacity-60">({schedForm.timezone})</span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="overline text-slate-500">Ads in rotation ({schedForm.ad_ids.length} selected)</label>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5 mb-2">Each scheduled run picks the next ad in order, looping forever.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {ads.map((a) => {
                    const sel = schedForm.ad_ids.includes(a.id);
                    return (
                      <button key={a.id} type="button" onClick={() => toggleAdInSchedForm(a.id)}
                        className={`border p-2 text-left transition-colors ${sel ? "border-teal-700 bg-teal-50" : "border-slate-200 hover:border-slate-400"}`}
                        data-testid={`schedule-pick-${a.id}`}>
                        {a.image_url && <img src={a.image_url.startsWith("http") ? a.image_url : `${process.env.REACT_APP_BACKEND_URL}${a.image_url}`} alt="" className="w-full aspect-square object-cover" />}
                        <div className="text-[10px] font-bold mt-1 line-clamp-2">{a.headline}</div>
                        <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mt-0.5">{a.audience_label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3 text-[11px] font-mono text-slate-500">
                <CalendarIcon className="w-3 h-3 inline mr-1" /> Posts to all {connectors.filter((c) => c.enabled).length} enabled channels. First post fires within 60 seconds.
              </div>
            </div>
            <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
              <Button onClick={saveSchedule} className="flex-1 bg-slate-900 text-white hover:bg-slate-800" data-testid="schedule-save"><Clock className="w-4 h-4 mr-1" /> Start auto-distribute</Button>
              <Button variant="outline" onClick={() => setSchedModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CONFIG MODAL */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white w-full max-w-lg border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="overline">Add channel</div>
              <h3 className="font-display text-2xl font-black tracking-tight mt-1">{types[newPlatform]?.label}</h3>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="overline text-slate-500">Display name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" data-testid="connector-name" />
              </div>
              {(types[newPlatform]?.fields || []).map((f) => (
                <div key={f.key}>
                  <label className="overline text-slate-500">{f.label}</label>
                  <div className="relative mt-1">
                    <Input
                      type={f.type === "password" && !reveal[f.key] ? "password" : "text"}
                      value={newConfig[f.key] || ""}
                      onChange={(e) => setNewConfig({ ...newConfig, [f.key]: e.target.value })}
                      placeholder={f.hint || ""}
                      className="font-mono text-xs"
                      data-testid={`connector-field-${f.key}`}
                    />
                    {f.type === "password" && (
                      <button type="button" onClick={() => setReveal({ ...reveal, [f.key]: !reveal[f.key] })} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900" aria-label="Toggle reveal">
                        {reveal[f.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  {f.hint && <p className="text-[10px] font-mono text-slate-500 mt-1">{f.hint}</p>}
                </div>
              ))}
              {types[newPlatform]?.todo && (
                <div className="text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 p-2">⏳ {types[newPlatform].todo}</div>
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
              <Button onClick={saveConnector} className="flex-1 bg-slate-900 text-white hover:bg-slate-800" data-testid="connector-save"><Plus className="w-4 h-4 mr-1" /> Add channel</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* BROADCAST MODAL */}
      {bcastModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setBcastModal(null); setBcastResult(null); }}>
          <div className="bg-white w-full max-w-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="overline">Broadcast</div>
              <h3 className="font-display text-2xl font-black tracking-tight mt-1">Pick an ad to send.</h3>
            </div>
            {!bcastResult ? (
              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-2" data-testid="broadcast-ad-picker">
                {ads.map((a) => (
                  <button key={a.id} onClick={() => broadcast(a.id, null)} disabled={busyId === "broadcast"} className="w-full flex gap-3 items-center p-3 border border-slate-200 hover:border-slate-900 transition-colors text-left" data-testid={`broadcast-ad-${a.id}`}>
                    {a.image_url && <img src={a.image_url.startsWith("http") ? a.image_url : `${process.env.REACT_APP_BACKEND_URL}${a.image_url}`} alt="" className="w-16 h-16 object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{a.headline}</div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-0.5">{a.audience_label} · {a.category_label}</div>
                    </div>
                    {busyId === "broadcast" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-teal-700" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-5 py-4" data-testid="broadcast-result">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <ResultStat label="Sent" value={bcastResult.summary.ok} accent="teal" />
                  <ResultStat label="Skipped" value={bcastResult.summary.skipped} />
                  <ResultStat label="Failed" value={bcastResult.summary.failed} accent={bcastResult.summary.failed > 0 ? "red" : undefined} />
                </div>
                <div className="mt-4 space-y-2 max-h-[40vh] overflow-y-auto">
                  {bcastResult.broadcasts.map((b, i) => (
                    <div key={i} className="text-xs border border-slate-200 p-2 flex justify-between gap-2">
                      <span><strong>{b.name}</strong> <span className="font-mono text-slate-500">({b.platform})</span></span>
                      <span className={b.status === "ok" ? "text-teal-700" : b.status === "skipped" ? "text-amber-700" : "text-red-600"}>
                        {b.status === "ok" ? "✓ posted" : `${b.status}: ${b.reason || ""}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
              {bcastResult && <Button onClick={() => setBcastResult(null)} variant="outline">Pick another</Button>}
              <Button onClick={() => { setBcastModal(null); setBcastResult(null); }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultStat({ label, value, accent }) {
  const c = accent === "teal" ? "text-teal-700 border-teal-200 bg-teal-50" : accent === "red" ? "text-red-600 border-red-200 bg-red-50" : "text-slate-600 border-slate-200 bg-slate-50";
  return (
    <div className={`border p-3 ${c}`}>
      <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{label}</div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value}</div>
    </div>
  );
}
