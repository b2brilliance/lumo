import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Edit3, Trash2, Copy, ExternalLink, MapPin, Eye, EyeOff, Users, TrendingUp, Share2,
} from "lucide-react";

/* RecruitTab — per-city hiring dashboard.
 *
 * Shows every recruit city with a live signup / goal progress bar,
 * per-city shareable /join link, and CRUD on the city record so the
 * admin can add new markets or tweak headlines without a developer. */

const EMPTY_DRAFT = {
  slug: "", city: "", state: "", state_full: "",
  goal_workers: 300, bonus_amount: 500, bonus_first_n: 100,
  hero_headline: "", hero_subhead: "", hero_image: "", is_active: true,
};

export default function RecruitTab() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [autopost, setAutopost] = useState({ enabled: false });

  const loadAutopost = async () => {
    try {
      const { data } = await api.get("/admin/recruit/autopost");
      setAutopost(data);
    } catch { /* ignore */ }
  };

  const toggleAutopost = async (v) => {
    try {
      await api.put("/admin/recruit/autopost", { enabled: v });
      setAutopost({ ...autopost, enabled: v });
      toast.success(v ? "Daily recruit broadcasts enabled" : "Auto-posting paused");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const broadcastNow = async () => {
    if (!window.confirm("Send a recruit post to every enabled social channel for every active city — right now?")) return;
    try {
      const { data } = await api.post("/admin/recruit/broadcast-now");
      toast.success(`Fired ${data.fired} city broadcasts`);
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/recruit/stats");
      setCities(data.items || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); loadAutopost(); }, []);

  const openNew = () => setEditing({ ...EMPTY_DRAFT, _isNew: true });
  const openEdit = (c) => setEditing({ ...c, _isNew: false });
  const close = () => setEditing(null);

  const save = async () => {
    if (!editing.slug || !editing.city || !editing.state) {
      toast.error("Slug, city and state are required");
      return;
    }
    const payload = { ...editing };
    delete payload._isNew;
    delete payload.id;
    delete payload.signups_total;
    delete payload.signups_last_7d;
    delete payload.milestone_10_reached;
    delete payload.spots_remaining;
    delete payload.progress_pct;
    delete payload.click_count;
    delete payload.view_count;
    delete payload.created_at;
    try {
      if (editing._isNew) {
        await api.post("/admin/recruit/cities", payload);
        toast.success("City added");
      } else {
        const { slug, ...updates } = payload;
        await api.patch(`/admin/recruit/cities/${slug}`, updates);
        toast.success("City updated");
      }
      close();
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const del = async (c) => {
    if (!window.confirm(`Delete ${c.city}? Providers already signed up will be preserved.`)) return;
    try {
      await api.delete(`/admin/recruit/cities/${c.slug}`);
      toast.success("Deleted");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const toggleActive = async (c) => {
    try {
      await api.patch(`/admin/recruit/cities/${c.slug}`, { is_active: !c.is_active });
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const copyLink = (slug) => {
    const url = `${window.location.origin}/join/${slug}`;
    navigator.clipboard?.writeText(url);
    toast.success(`Copied ${url}`);
  };

  const totals = cities.reduce(
    (acc, c) => {
      acc.signups += c.signups_total || 0;
      acc.goal += c.goal_workers || 0;
      acc.this_week += c.signups_last_7d || 0;
      return acc;
    },
    { signups: 0, goal: 0, this_week: 0 },
  );

  return (
    <div className="space-y-6" data-testid="admin-recruit-tab">
      {/* Header + KPI */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="overline">Recruit</div>
          <h2 className="font-display text-2xl font-black tracking-tight">City hiring dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">Track sign-ups against your per-city goal and share direct /join links.</p>
        </div>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-recruit-new">
          <Plus className="w-4 h-4 mr-1" /> Add city
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="admin-recruit-kpis">
        <Kpi label="Cities" value={cities.length} />
        <Kpi label="Total signups" value={totals.signups} icon={Users} />
        <Kpi label="Goal" value={totals.goal} />
        <Kpi label="This week" value={`+${totals.this_week}`} icon={TrendingUp} />
      </div>

      {/* Cities list */}
      {loading ? (
        <div className="p-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="border border-slate-200 divide-y divide-slate-100" data-testid="admin-recruit-list">
          {cities.map((c) => {
            const pct = Number(c.progress_pct || 0);
            return (
              <div key={c.slug} className={`p-4 grid grid-cols-12 gap-3 items-center ${!c.is_active ? "opacity-50" : ""}`} data-testid={`admin-recruit-row-${c.slug}`}>
                <div className="col-span-12 md:col-span-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-slate-900">{c.city}, {c.state}</span>
                    {!c.is_active && <span className="text-[9px] font-mono uppercase tracking-widest bg-slate-100 text-slate-500 px-1.5 py-0.5">Paused</span>}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">/join/{c.slug}</div>
                </div>
                <div className="col-span-12 md:col-span-4">
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="font-display font-bold text-lg">{c.signups_total || 0}</span>
                    <span className="text-xs text-slate-400 font-mono">/ {c.goal_workers}</span>
                    <span className="text-xs text-slate-500 ml-auto">{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-slate-900" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="col-span-6 md:col-span-2 text-xs font-mono">
                  <div>+{c.signups_last_7d || 0} this wk</div>
                  <div className="text-slate-500">${Number(c.bonus_amount).toFixed(0)} bonus · first {c.bonus_first_n}</div>
                </div>
                <div className="col-span-6 md:col-span-3 text-right flex justify-end gap-1 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => copyLink(c.slug)} title="Copy /join link" data-testid={`admin-recruit-copy-${c.slug}`}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <a href={`/join/${c.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-7 px-2 border border-slate-200 hover:bg-slate-50" title="View live landing" data-testid={`admin-recruit-open-${c.slug}`}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => toggleActive(c)} data-testid={`admin-recruit-toggle-${c.slug}`}>
                    {c.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(c)} data-testid={`admin-recruit-edit-${c.slug}`}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-800 hover:bg-red-50" onClick={() => del(c)} data-testid={`admin-recruit-del-${c.slug}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {cities.length === 0 && <div className="p-6 text-sm text-slate-500">No target cities yet. Add one to start.</div>}
        </div>
      )}

      {/* Recruiter playbook link + autopost controls */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-slate-50 border border-slate-200 p-5 flex items-start gap-3" data-testid="admin-recruit-autopost">
          <Share2 className="w-5 h-5 text-slate-900 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-display font-bold text-slate-900">Automate recruiting</div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Fire one recruit post per active city to every enabled social channel — daily.
              Configure channels in <b>Admin → Auto-post</b>.
            </p>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autopost.enabled}
                  onChange={(e) => toggleAutopost(e.target.checked)}
                  className="w-4 h-4 accent-slate-900"
                  data-testid="admin-recruit-autopost-toggle"
                />
                Daily auto-broadcast
              </label>
              <Button size="sm" variant="outline" onClick={broadcastNow} className="h-8" data-testid="admin-recruit-broadcast-now">
                Broadcast now
              </Button>
            </div>
            {autopost.last_run_at && (
              <div className="mt-2 text-[10px] font-mono text-slate-500">Last run: {new Date(autopost.last_run_at).toLocaleString()}</div>
            )}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 flex items-start gap-3" data-testid="admin-recruit-playbook">
          <Share2 className="w-5 h-5 text-slate-900 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-slate-700 leading-relaxed">
            <b className="text-slate-900">Recruiter playbook.</b> Step-by-step channel-by-channel guide at{" "}
            <a href="/RECRUITING_PLAYBOOK.md" className="underline hover:text-slate-900" target="_blank" rel="noreferrer">/app/RECRUITING_PLAYBOOK.md</a>.
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="admin-recruit-dialog">
          <DialogHeader>
            <DialogTitle>{editing?._isNew ? "New target city" : `Edit ${editing?.city}`}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Slug *">
                  <Input
                    value={editing.slug}
                    disabled={!editing._isNew}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                    placeholder="los-angeles-ca"
                    data-testid="admin-recruit-field-slug"
                  />
                </Field>
                <Field label="City *"><Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} placeholder="Los Angeles" data-testid="admin-recruit-field-city" /></Field>
                <Field label="State (2-letter) *"><Input value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="CA" data-testid="admin-recruit-field-state" /></Field>
              </div>
              <Field label="State full name"><Input value={editing.state_full || ""} onChange={(e) => setEditing({ ...editing, state_full: e.target.value })} placeholder="California" /></Field>
              <Field label="Hero headline"><Input value={editing.hero_headline || ""} onChange={(e) => setEditing({ ...editing, hero_headline: e.target.value })} placeholder="Drive with Lumo in Los Angeles." /></Field>
              <Field label="Hero subhead"><Textarea rows={2} value={editing.hero_subhead || ""} onChange={(e) => setEditing({ ...editing, hero_subhead: e.target.value })} placeholder="300 spots. $500 sign-on for the first 100. Keep 90%." /></Field>
              <Field label="Hero image URL"><Input value={editing.hero_image || ""} onChange={(e) => setEditing({ ...editing, hero_image: e.target.value })} placeholder="https://images.unsplash.com/…" /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Goal workers"><Input type="number" value={editing.goal_workers} onChange={(e) => setEditing({ ...editing, goal_workers: parseInt(e.target.value || "0", 10) })} data-testid="admin-recruit-field-goal" /></Field>
                <Field label="Bonus $"><Input type="number" step="0.01" value={editing.bonus_amount} onChange={(e) => setEditing({ ...editing, bonus_amount: parseFloat(e.target.value || "0") })} /></Field>
                <Field label="First N (for bonus)"><Input type="number" value={editing.bonus_first_n} onChange={(e) => setEditing({ ...editing, bonus_first_n: parseInt(e.target.value || "0", 10) })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} data-testid="admin-recruit-field-active" />
                Active (visible on /join/{editing.slug || "..."})
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={save} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-recruit-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, icon: Icon }) {
  return (
    <div className="border border-slate-200 p-4 bg-white">
      <div className="overline flex items-center gap-1.5">{Icon && <Icon className="w-3 h-3" />} {label}</div>
      <div className="font-display font-black text-2xl mt-1">{value}</div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs overline">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
