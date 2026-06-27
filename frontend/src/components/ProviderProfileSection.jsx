import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Sparkles, Calendar, Globe as GlobeIcon, CheckCircle2, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SERVICE_SCHEMAS } from "@/lib/serviceSchemas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";

const EMP_TYPES = [
  { value: "on_demand", label: "On-demand",       icon: Sparkles },
  { value: "staffing",  label: "Staffing & temp", icon: Calendar },
  { value: "remote",    label: "Remote / contract", icon: GlobeIcon },
  { value: "w2",        label: "W-2 / salaried",  icon: Briefcase },
];

const PROVIDER_CATEGORIES = [
  { key: "delivery",       label: "Delivery" },
  { key: "courier",        label: "Courier" },
  { key: "ride_share",     label: "Ride-share" },
  { key: "towing",         label: "Roadside & towing" },
  { key: "moving",         label: "Moving & hauling" },
  { key: "handyman",       label: "Handyman" },
  { key: "cleaning",       label: "Cleaning" },
  { key: "landscaping",    label: "Landscaping" },
  { key: "auto",           label: "Auto repair" },
  { key: "pet_care",       label: "Pet care" },
  { key: "events",         label: "Events" },
  { key: "personal_care",  label: "Personal care" },
  { key: "medical",        label: "Medical / health" },
  { key: "digital_tech",   label: "Digital & tech" },
  { key: "marketing",      label: "Marketing" },
  { key: "business_admin", label: "Business & admin" },
  { key: "education",      label: "Education" },
  { key: "legal",          label: "Legal" },
  { key: "financial",      label: "Financial" },
  { key: "remote_work",    label: "Remote / digital work" },
];

/**
 * Provider profile editor — only rendered for role==="provider" users.
 * Mirrors the Register wizard step 3 so people can change everything later.
 */
export default function ProviderProfileSection() {
  const { user, updateMe } = useAuth();
  const initial = useMemo(() => ({
    employment_types: user?.employment_types || [],
    categories: user?.categories || [],
    subcategories: user?.subcategories || [],
    provider_profile: {
      bio: user?.provider_profile?.bio || "",
      certifications: user?.provider_profile?.certifications || "",
      work_history: user?.provider_profile?.work_history || "",
    },
  }), [user]);
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setState(initial); }, [initial]);

  const toggle = (k, v) =>
    setState((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const setBio = (k, v) => setState((s) => ({ ...s, provider_profile: { ...s.provider_profile, [k]: v } }));

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  const save = async () => {
    setBusy(true);
    try {
      await updateMe(state);
      toast.success("Provider profile saved");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  if (!user || user.role !== "provider") return null;

  return (
    <section className="mt-8 border border-slate-200 p-6 bg-white" data-testid="section-provider-profile">
      <div className="flex items-center gap-2">
        <Briefcase className="w-5 h-5 text-amber-700" />
        <div className="font-display text-xl font-bold">Provider profile</div>
      </div>
      <p className="text-slate-600 text-sm mt-3">
        Edit the same answers you gave at signup. Changes to employment types or sub-categories take effect on your job feed immediately.
      </p>

      {/* Employment types */}
      <div className="mt-6">
        <div className="overline mb-2">Open to which kinds of work?</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {EMP_TYPES.map((e) => {
            const Icon = e.icon;
            const active = state.employment_types.includes(e.value);
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => toggle("employment_types", e.value)}
                className={`flex items-center gap-3 p-3 border text-left text-sm transition-colors ${active ? "border-amber-700 bg-amber-50/40" : "border-slate-200 hover:border-slate-400"}`}
                data-testid={`pp-emp-${e.value}`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-amber-700" : "text-slate-500"}`} />
                <span className="flex-1 font-medium">{e.label}</span>
                {active && <CheckCircle2 className="w-4 h-4 text-amber-700" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Categories + sub-checkboxes */}
      <div className="mt-6">
        <div className="overline mb-2">Services you offer</div>
        <p className="text-xs text-slate-500 mb-3">Only jobs matching your picks appear in your feed.</p>
        <div className="border border-slate-200 divide-y divide-slate-100 max-h-96 overflow-y-auto" data-testid="pp-categories">
          {PROVIDER_CATEGORIES.map((cat) => {
            const active = state.categories.includes(cat.key);
            const schema = SERVICE_SCHEMAS[cat.key];
            const subs = schema?.subcategories || {};
            return (
              <div key={cat.key}>
                <button
                  type="button"
                  onClick={() => toggle("categories", cat.key)}
                  className={`w-full flex items-center justify-between p-3 text-left transition-colors ${active ? "bg-teal-50/30" : "hover:bg-slate-50"}`}
                  data-testid={`pp-cat-${cat.key}`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox checked={active} onCheckedChange={() => toggle("categories", cat.key)} />
                    <span className={`font-semibold text-sm ${active ? "text-teal-800" : "text-slate-800"}`}>{cat.label}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    {Object.keys(subs).length} sub-types
                  </span>
                </button>
                {active && Object.keys(subs).length > 0 && (
                  <div className="pl-12 pr-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {Object.entries(subs).map(([subKey, sub]) => {
                      const subActive = state.subcategories.includes(subKey);
                      return (
                        <label key={subKey} className="flex items-center gap-2 text-xs cursor-pointer hover:text-teal-800">
                          <Checkbox checked={subActive} onCheckedChange={() => toggle("subcategories", subKey)} data-testid={`pp-sub-${subKey}`} />
                          <span>{sub.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bio / credentials */}
      <div className="mt-6 space-y-3">
        <div className="overline">About you (optional)</div>
        <div>
          <Label className="text-xs">Short bio</Label>
          <Textarea value={state.provider_profile.bio} onChange={(e) => setBio("bio", e.target.value)} rows={2} placeholder="2 sentences max — what makes you a great hire?" data-testid="pp-bio" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Certifications / licenses</Label>
          <Textarea value={state.provider_profile.certifications} onChange={(e) => setBio("certifications", e.target.value)} rows={2} placeholder="EPA Universal · ASE Master Tech · OSHA 30 · …" data-testid="pp-certs" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Work history</Label>
          <Textarea value={state.provider_profile.work_history} onChange={(e) => setBio("work_history", e.target.value)} rows={3} placeholder="Companies you've worked at, years of experience, notable projects" data-testid="pp-history" className="mt-1" />
        </div>
      </div>

      {dirty && (
        <div className="mt-5 flex justify-end" data-testid="pp-save-row">
          <Button onClick={save} disabled={busy} className="bg-amber-700 hover:bg-amber-800" data-testid="pp-save">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {busy ? "Saving…" : "Save provider profile"}
          </Button>
        </div>
      )}
    </section>
  );
}
