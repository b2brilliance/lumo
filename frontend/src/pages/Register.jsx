import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { SERVICE_SCHEMAS } from "@/lib/serviceSchemas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import AvatarUploader from "@/components/AvatarUploader";
import { toast } from "sonner";
import {
  User as UserIcon, Briefcase, Store, UtensilsCrossed, ChevronRight, ChevronLeft,
  ArrowRight, CheckCircle2, Sparkles, Calendar, Globe,
} from "lucide-react";

// ── Role catalog ──────────────────────────────────────────────────────────
const ROLES = [
  { value: "customer",   label: "Customer",   icon: UserIcon,        desc: "Post requests, book services, shop & order. Also for recruiters and staffing-agency contacts." },
  { value: "provider",   label: "Service provider", icon: Briefcase, desc: "On-demand gigs · staffing & temp shifts · remote contracts · W-2 openings." },
  { value: "retailer",   label: "Retailer",   icon: Store,           desc: "Open a storefront with inventory and delivery." },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed, desc: "List your menu and accept delivery orders." },
];

// Employment-type catalog (providers only).
const EMP_TYPES = [
  { value: "on_demand", label: "On-demand",       icon: Sparkles,  desc: "Same-day, ad-hoc gigs near you." },
  { value: "staffing",  label: "Staffing & temp", icon: Calendar,  desc: "Short shifts, fill-in roles, weekly schedules." },
  { value: "remote",    label: "Remote / contract", icon: Globe,   desc: "1099 / contract work done from anywhere." },
  { value: "w2",        label: "W-2 / salaried",  icon: Briefcase, desc: "Full-time benefit-eligible positions." },
];

// Top-level provider category catalogue. Each maps to SERVICE_SCHEMAS for sub.
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

// ── Component ─────────────────────────────────────────────────────────────
export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  // Allow deep-links like /register?role=provider to skip step 1.
  const presetRole = useMemo(() => {
    const r = searchParams.get("role");
    return ROLES.some((x) => x.value === r) ? r : null;
  }, [searchParams]);

  const [step, setStep] = useState(presetRole ? 2 : 1); // 1 role, 2 basics, 3 details
  const [form, setForm] = useState({
    role: presetRole || "customer",
    name: "", email: "", password: "", phone: "",
    avatar_url: null,
    employment_types: [],
    categories: [],
    subcategories: [],
    provider_profile: { bio: "", certifications: "", work_history: "" },
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, v) =>
    setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const isProvider = form.role === "provider";
  const needsDetailsStep = isProvider; // customers/retailers/restaurants skip step 3

  const submit = async () => {
    setBusy(true); setErr("");
    const payload = {
      role: form.role,
      name: form.name,
      email: form.email,
      password: form.password,
      phone: form.phone || null,
      avatar_url: form.avatar_url,
    };
    if (isProvider) {
      payload.employment_types = form.employment_types;
      payload.categories = form.categories;
      payload.subcategories = form.subcategories;
      payload.provider_profile = form.provider_profile;
    }
    const r = await register(payload);
    setBusy(false);
    if (r.ok) {
      toast.success("Welcome to Lumo");
      const dest = { customer: "/customer", provider: "/provider", retailer: "/retailer", restaurant: "/restaurant" }[r.user.role] || "/";
      nav(dest);
    } else setErr(r.error);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12" data-testid="register-wizard">
      {/* Progress bar */}
      <ol className="flex items-center gap-3 mb-8 text-[10px] font-mono uppercase tracking-widest">
        <StepDot active={step >= 1} done={step > 1} label="Role" testid="step-1" />
        <ChevronRight className="w-3 h-3 text-slate-400" />
        <StepDot active={step >= 2} done={step > 2} label="Account" testid="step-2" />
        {needsDetailsStep && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <StepDot active={step >= 3} done={false} label="Details" testid="step-3" />
          </>
        )}
      </ol>

      <h1 className="font-display text-4xl font-black tracking-tighter">Create your account.</h1>
      <p className="text-slate-600 mt-2">Takes about a minute. You can edit anything later from Settings.</p>

      {/* ── STEP 1 — Role picker ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="mt-10 space-y-3" data-testid="register-step-role">
          <div className="overline">Choose how you&apos;ll use Lumo</div>
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = form.role === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => set("role", r.value)}
                className={`w-full flex items-start gap-4 p-5 border text-left transition-colors ${active ? "border-teal-700 bg-teal-50/40" : "border-slate-200 hover:border-slate-400"}`}
                data-testid={`register-role-${r.value}`}
              >
                <Icon className={`w-6 h-6 mt-0.5 ${active ? "text-teal-700" : "text-slate-500"}`} />
                <div className="flex-1">
                  <div className="font-display font-bold text-lg">{r.label}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{r.desc}</div>
                </div>
                {active && <CheckCircle2 className="w-5 h-5 text-teal-700" />}
              </button>
            );
          })}
          <div className="flex justify-between items-center pt-4">
            <Link to="/signin" className="text-sm text-slate-500 underline hover:text-slate-900">Already have an account? Sign in</Link>
            <Button onClick={() => setStep(2)} className="bg-slate-900 hover:bg-slate-800" data-testid="register-next-step-1">
              Continue <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2 — Basic account details ──────────────────────────────── */}
      {step === 2 && (
        <div className="mt-10 space-y-4" data-testid="register-step-basics">
          <div className="overline">Account details</div>
          <div>
            <Label className="text-xs">Full name</Label>
            <Input name="name" value={form.name} onChange={(e) => set("name", e.target.value)} required data-testid="register-name" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input name="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required data-testid="register-email" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Phone (optional)</Label>
              <Input name="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="register-phone" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input name="password" type="password" minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} required data-testid="register-password" className="mt-1" />
            <p className="text-[11px] text-slate-400 mt-1">At least 6 characters.</p>
          </div>
          {isProvider && (
            <div className="border border-slate-200 bg-slate-50/40 p-4">
              <AvatarUploader
                value={form.avatar_url}
                onChange={(url) => set("avatar_url", url)}
                anonymous
                required
                testid="register-avatar"
              />
              <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                Customers see this photo when you respond to their job. A clear face photo builds trust and gets you hired faster.
              </p>
            </div>
          )}
          <div className="flex justify-between items-center pt-4">
            <Button variant="ghost" onClick={() => setStep(1)} data-testid="register-back-step-2">
              <ChevronLeft className="mr-1 w-4 h-4" /> Back
            </Button>
            {needsDetailsStep ? (
              <Button
                onClick={() => setStep(3)}
                disabled={!form.name || !form.email || !form.password || (isProvider && !form.avatar_url)}
                className="bg-slate-900 hover:bg-slate-800"
                data-testid="register-next-step-2"
              >
                {isProvider && !form.avatar_url ? "Upload photo to continue" : "Continue"} <ArrowRight className="ml-1 w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={submit}
                disabled={busy || !form.name || !form.email || !form.password}
                className="bg-slate-900 hover:bg-slate-800"
                data-testid="register-submit"
              >
                {busy ? "Creating…" : "Create account"} <ArrowRight className="ml-1 w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3 — Provider details (employment + categories + sub) ─── */}
      {step === 3 && isProvider && (
        <div className="mt-10 space-y-6" data-testid="register-step-details">
          {/* Employment types */}
          <div>
            <div className="overline mb-3">What kind of work are you open to? <span className="text-red-600">*</span></div>
            <div className="grid sm:grid-cols-2 gap-2">
              {EMP_TYPES.map((e) => {
                const Icon = e.icon;
                const active = form.employment_types.includes(e.value);
                return (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => toggle("employment_types", e.value)}
                    className={`flex items-start gap-3 p-3 border text-left transition-colors ${active ? "border-amber-700 bg-amber-50/40" : "border-slate-200 hover:border-slate-400"}`}
                    data-testid={`register-emp-${e.value}`}
                  >
                    <Icon className={`w-5 h-5 mt-0.5 ${active ? "text-amber-700" : "text-slate-500"}`} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{e.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{e.desc}</div>
                    </div>
                    {active && <CheckCircle2 className="w-4 h-4 text-amber-700" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service categories with conditional sub-category checkboxes */}
          <div>
            <div className="overline mb-3">Which services will you offer?</div>
            <p className="text-xs text-slate-500 mb-3">Pick the categories you&apos;ll work in. Within each, tick the specific sub-services you&apos;ll accept. <strong>Only jobs matching your picks will appear in your feed.</strong></p>
            <div className="border border-slate-200 divide-y divide-slate-100">
              {PROVIDER_CATEGORIES.map((cat) => {
                const active = form.categories.includes(cat.key);
                const schema = SERVICE_SCHEMAS[cat.key];
                const subs = schema?.subcategories || {};
                return (
                  <div key={cat.key} data-testid={`register-cat-${cat.key}`}>
                    <button
                      type="button"
                      onClick={() => toggle("categories", cat.key)}
                      className={`w-full flex items-center justify-between p-3 text-left transition-colors ${active ? "bg-teal-50/30" : "hover:bg-slate-50"}`}
                      data-testid={`register-cat-toggle-${cat.key}`}
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
                      <div className="pl-12 pr-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5" data-testid={`register-cat-subs-${cat.key}`}>
                        {Object.entries(subs).map(([subKey, sub]) => {
                          const subActive = form.subcategories.includes(subKey);
                          return (
                            <label key={subKey} className="flex items-center gap-2 text-xs cursor-pointer hover:text-teal-800">
                              <Checkbox checked={subActive} onCheckedChange={() => toggle("subcategories", subKey)} data-testid={`register-sub-${subKey}`} />
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
          <div>
            <div className="overline mb-3">Tell customers about you (optional)</div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Short bio</Label>
                <Textarea value={form.provider_profile.bio} onChange={(e) => set("provider_profile", { ...form.provider_profile, bio: e.target.value })} rows={2} placeholder="2 sentences max — what makes you a great hire?" data-testid="register-bio" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Certifications / licenses</Label>
                <Textarea value={form.provider_profile.certifications} onChange={(e) => set("provider_profile", { ...form.provider_profile, certifications: e.target.value })} rows={2} placeholder="EPA Universal · ASE Master Tech · OSHA 30 · …" data-testid="register-certs" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Work history</Label>
                <Textarea value={form.provider_profile.work_history} onChange={(e) => set("provider_profile", { ...form.provider_profile, work_history: e.target.value })} rows={3} placeholder="Companies you've worked at, years of experience, notable projects" data-testid="register-history" className="mt-1" />
              </div>
            </div>
          </div>

          {err && <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2" data-testid="register-error">{err}</div>}

          <div className="flex justify-between items-center pt-4">
            <Button variant="ghost" onClick={() => setStep(2)} data-testid="register-back-step-3">
              <ChevronLeft className="mr-1 w-4 h-4" /> Back
            </Button>
            <Button
              onClick={submit}
              disabled={busy || form.employment_types.length === 0}
              className="bg-slate-900 hover:bg-slate-800"
              data-testid="register-submit"
            >
              {busy ? "Creating…" : form.employment_types.length === 0 ? "Pick at least one employment type" : "Create account"} <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDot({ active, done, label, testid }) {
  return (
    <li className={`flex items-center gap-1.5 ${active ? "text-slate-900" : "text-slate-400"}`} data-testid={testid}>
      <span className={`w-2 h-2 rounded-full ${done ? "bg-teal-700" : active ? "bg-slate-900" : "bg-slate-300"}`} />
      {label}
    </li>
  );
}
