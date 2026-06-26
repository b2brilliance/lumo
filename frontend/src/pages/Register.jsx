import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Briefcase, MapPin } from "lucide-react";
import AvatarUploader from "@/components/AvatarUploader";

const ROLES = [
  { value: "customer", label: "Customer", desc: "Post requests, buy from stores, hire remotely." },
  { value: "provider", label: "Provider", desc: "Deliver, fix, work — local or remote." },
  { value: "retailer", label: "Retailer", desc: "Open a storefront and sell inventory." },
  { value: "restaurant", label: "Restaurant", desc: "List your menu and accept delivery orders." },
];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const presetRole = searchParams.get("role");
  const jobCategory = searchParams.get("job_category");
  const cityParam = searchParams.get("city");

  const initialRole = useMemo(
    () => (ROLES.some((r) => r.value === presetRole) ? presetRole : "customer"),
    [presetRole]
  );
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: initialRole, avatar_url: null });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  // Re-sync role when the URL query param changes (e.g. deep-link from a
  // marketing CTA). Do NOT depend on form.role — that would snap the user
  // back to the initial role every time they clicked a different one.
  useEffect(() => {
    setForm((f) => (f.role !== initialRole ? { ...f, role: initialRole } : f));
  }, [initialRole]);

  const prettyCategory = jobCategory ? jobCategory.replace(/-/g, " ") : null;
  const prettyCity = cityParam ? cityParam.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  const isApplyFlow = !!(jobCategory && initialRole === "provider");
  const requiresAvatar = form.role === "provider";
  const missingAvatar = requiresAvatar && !form.avatar_url;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (missingAvatar) {
      setErr("Please upload a profile photo — required for service providers.");
      return;
    }
    setBusy(true); setErr("");
    const payload = { ...form };
    if (isApplyFlow) {
      payload.categories = [jobCategory];
      if (prettyCity) payload.location_text = prettyCity;
    }
    const r = await register(payload);
    setBusy(false);
    if (r.ok) {
      toast.success(isApplyFlow ? "Welcome to Lumo — let's get you earning." : "Account created");
      const dest = { customer: "/customer", provider: "/provider", retailer: "/retailer", restaurant: "/restaurant" }[r.user.role] || "/";
      nav(dest);
    } else setErr(r.error);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] max-w-5xl mx-auto px-6 py-12 grid lg:grid-cols-12 gap-12">
      <div className="lg:col-span-5">
        <div className="overline">{isApplyFlow ? "Apply on Lumo" : "Get started"}</div>
        <h1 className="font-display text-4xl font-black tracking-tight mt-2">{isApplyFlow ? "Start earning." : "Join Lumo."}</h1>
        {isApplyFlow ? (
          <div className="mt-4 border border-teal-200 bg-teal-50 p-4" data-testid="apply-context">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
              <Briefcase className="w-4 h-4" /> {prettyCategory && <span className="capitalize">{prettyCategory}</span>}
              {prettyCity && <><MapPin className="w-3.5 h-3.5 ml-2" /> <span>{prettyCity}</span></>}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-teal-900/80">
              <li>· Keep 90% of every job — Lumo only charges 10%.</li>
              <li>· Set your hours. Accept the jobs you want.</li>
              <li>· Fast payouts. No monthly fees.</li>
            </ul>
          </div>
        ) : (
          <p className="text-slate-600 mt-3">Pick your role. You can always add more later.</p>
        )}
        <div className="mt-6 space-y-3">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => set("role", r.value)}
              className={`w-full text-left border p-4 transition-colors ${form.role === r.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"}`}
              data-testid={`register-role-${r.value}`}
            >
              <div className="font-display font-bold">{r.label}</div>
              <div className={`text-xs mt-0.5 ${form.role === r.value ? "text-slate-300" : "text-slate-500"}`}>{r.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={submit} className="lg:col-span-7 lg:border-l lg:border-slate-200 lg:pl-12 space-y-5" data-testid="register-form">
        <div>
          <Label className="overline">Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required data-testid="register-name" className="mt-1" />
        </div>
        <div>
          <Label className="overline">Email</Label>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required data-testid="register-email" className="mt-1" />
        </div>
        <div>
          <Label className="overline">Phone (optional)</Label>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="register-phone" className="mt-1" />
        </div>
        <div>
          <Label className="overline">Password</Label>
          <Input type="password" minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} required data-testid="register-password" className="mt-1" />
        </div>
        {requiresAvatar && (
          <div className="border border-slate-200 bg-slate-50/40 p-4" data-testid="register-avatar-section">
            <AvatarUploader
              value={form.avatar_url}
              onChange={(url) => set("avatar_url", url)}
              anonymous
              required
              testid="register-avatar"
            />
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Customers see this photo when you respond to their job. A clear, well-lit face photo builds trust and gets you hired faster.
            </p>
          </div>
        )}
        {err && <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2" data-testid="register-error">{err}</div>}
        <Button type="submit" disabled={busy || missingAvatar} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="register-submit">
          {busy ? "Creating…" : missingAvatar ? "Upload photo to continue" : isApplyFlow ? "Apply & create account" : "Create account"}
        </Button>
        <div className="text-xs text-slate-500">
          Already have an account? <Link to="/login" className="text-teal-700 underline">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
