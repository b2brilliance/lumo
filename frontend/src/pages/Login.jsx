import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  User as UserIcon, Briefcase, Store, UtensilsCrossed,
  ArrowRight, ChevronLeft, CheckCircle2,
} from "lucide-react";

const ROLES = [
  { value: "customer",   label: "Customer",   icon: UserIcon,        desc: "Hire, order, and shop" },
  { value: "provider",   label: "Service provider", icon: Briefcase, desc: "On-demand · staffing · remote · salaried" },
  { value: "retailer",   label: "Retailer",   icon: Store,           desc: "Run a storefront" },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed, desc: "Take delivery orders" },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1); // 1 = role picker · 2 = credentials
  const [pickedRole, setPickedRole] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await login(email, password);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }

    // Friendly mismatch warning — the role they picked doesn't match the
    // account they signed into. We still route them to their real hub.
    if (pickedRole && r.user.role !== pickedRole) {
      toast.message(`This account is registered as ${r.user.role}. Sign up separately for a ${pickedRole} account.`);
    } else {
      toast.success("Welcome back");
    }
    const dest = { customer: "/customer", provider: "/provider", retailer: "/retailer", restaurant: "/restaurant" }[r.user.role] || "/";
    nav(dest);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex">
      <div className="hidden lg:block lg:w-1/2 bg-slate-900 text-white p-12 relative">
        <div className="font-display font-black text-6xl tracking-tight">Lumo</div>
        <div className="overline mt-3 text-teal-300">Local · Remote · Retail · Food</div>
        <p className="text-slate-300 mt-8 max-w-md text-lg leading-relaxed">
          One platform for every kind of work and every kind of order. Deliveries, handymen, remote contracts, your local boutique — all in one hub.
        </p>
        <div className="absolute bottom-12 left-12 right-12 grid grid-cols-4 gap-3 text-xs">
          <div className="border-l-2 border-red-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Delivery</div><div className="font-mono">Local + courier</div></div>
          <div className="border-l-2 border-blue-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Local</div><div className="font-mono">Handyman + more</div></div>
          <div className="border-l-2 border-amber-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Digital</div><div className="font-mono">Tech + creative</div></div>
          <div className="border-l-2 border-teal-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Remote</div><div className="font-mono">Anywhere work</div></div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        {step === 1 ? (
          <div className="w-full max-w-md space-y-4" data-testid="login-step-role">
            <div>
              <h1 className="font-display text-3xl font-black tracking-tight">Sign in.</h1>
              <p className="text-sm text-slate-500 mt-1">First — what are you signing in as?</p>
            </div>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const active = pickedRole === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { setPickedRole(r.value); setStep(2); }}
                    className={`w-full flex items-center gap-4 p-4 border text-left transition-colors ${active ? "border-teal-700 bg-teal-50/40" : "border-slate-200 hover:border-slate-400"}`}
                    data-testid={`login-role-${r.value}`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? "text-teal-700" : "text-slate-500"}`} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{r.label}</div>
                      <div className="text-xs text-slate-500">{r.desc}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-6 text-center">
              No account yet? <Link to="/register" className="underline hover:text-slate-900" data-testid="login-link-register">Create one</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center"
              data-testid="login-back-step"
            >
              <ChevronLeft className="w-3 h-3 mr-1" /> Change account type
            </button>
            <div>
              <h1 className="font-display text-3xl font-black tracking-tight">Sign in</h1>
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                As <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                <strong className="text-slate-700">{ROLES.find((r) => r.value === pickedRole)?.label}</strong>
              </p>
            </div>
            <div>
              <Label className="overline">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" className="mt-1" autoFocus />
            </div>
            <div>
              <Label className="overline">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" className="mt-1" />
            </div>
            {err && <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2" data-testid="login-error">{err}</div>}
            <Button type="submit" disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="login-submit">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <div className="text-center">
              <Link to="/signin" className="text-xs text-slate-500 underline hover:text-slate-900" data-testid="login-link-phone-google">
                Use phone or Google instead
              </Link>
            </div>
            <p className="text-xs text-slate-500 text-center">
              No account yet? <Link to={`/register?role=${pickedRole}`} className="underline hover:text-slate-900" data-testid="login-link-register">Sign up as {ROLES.find((r) => r.value === pickedRole)?.label}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
