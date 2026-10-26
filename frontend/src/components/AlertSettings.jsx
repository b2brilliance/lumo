import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff } from "lucide-react";
import { api, formatApiError, ALL_CATEGORIES } from "@/lib/api";
import { Switch } from "@/components/ui/switch";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const label = (v) => ALL_CATEGORIES.find((c) => c.value === v)?.label || v;

export default function AlertSettings() {
  const [p, setP] = useState(null);
  const timer = useRef(null);
  useEffect(() => { api.get("/provider/alert-settings").then((r) => setP(r.data)).catch(() => {}); }, []);
  if (!p) return null;
  const save = async (patch, okMsg) => {
    const next = { ...p, ...patch, hours: { ...p.hours, ...(patch.hours || {}), tz: TZ } };
    setP(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { const { skills, ...body } = next; await api.put("/provider/alert-settings", body); if (okMsg) toast.success(okMsg); }
      catch (e) { toast.error(formatApiError(e)); }
    }, patch.hours?.start || patch.hours?.end ? 600 : 0);
  };
  const skills = p.skills || [];
  const picked = p.categories?.length ? p.categories : skills;
  const toggleSkill = (s) => {
    const next = picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s];
    if (!next.length) { toast.error("Keep at least one job type, or switch to off duty"); return; }
    save({ categories: next });
  };
  return (
    <section className={`mt-6 border p-4 ${p.off_duty ? "border-slate-300 bg-slate-50" : "border-emerald-200 bg-emerald-50/40"}`} data-testid="alert-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {p.off_duty ? <BellOff className="w-5 h-5 text-slate-500" /> : <BellRing className="w-5 h-5 text-emerald-600" />}
          <div>
            <div className="font-display font-bold" data-testid="alert-settings-status">{p.off_duty ? "Off duty — no job alerts" : "On duty — getting job alerts"}</div>
            <div className="text-xs text-slate-500">Alerts for work within your travel distance</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">Off duty
          <Switch checked={p.off_duty} onCheckedChange={(v) => save({ off_duty: v }, v ? "Alerts paused" : "Alerts back on")} data-testid="alert-off-duty" />
        </label>
      </div>
      <div className={`mt-4 grid md:grid-cols-3 gap-4 text-sm ${p.off_duty ? "opacity-50 pointer-events-none" : ""}`}>
        <label className="flex items-center justify-between gap-2 border border-slate-200 bg-white p-3">Delivery runs
          <Switch checked={p.delivery_runs} onCheckedChange={(v) => save({ delivery_runs: v })} data-testid="alert-delivery-runs" />
        </label>
        <div className="border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">Working hours only
            <Switch checked={p.hours.enabled} onCheckedChange={(v) => save({ hours: { enabled: v } })} data-testid="alert-hours-enabled" />
          </div>
          {p.hours.enabled && (
            <div className="flex items-center gap-2 mt-2 text-xs">
              <input type="time" value={p.hours.start} onChange={(e) => save({ hours: { start: e.target.value } })} className="border border-slate-200 px-2 py-1" data-testid="alert-hours-start" />
              to
              <input type="time" value={p.hours.end} onChange={(e) => save({ hours: { end: e.target.value } })} className="border border-slate-200 px-2 py-1" data-testid="alert-hours-end" />
            </div>
          )}
        </div>
        <div className="border border-slate-200 bg-white p-3">
          <div>Job types</div>
          {skills.length === 0 ? <div className="text-xs text-slate-500 mt-1">Add skills to your profile to choose job types.</div> : (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {skills.map((s) => (
                <button key={s} onClick={() => toggleSkill(s)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${picked.includes(s) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`} data-testid={`alert-skill-${s}`}>{label(s)}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
