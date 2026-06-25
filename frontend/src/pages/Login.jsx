import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("customer@lumo.test");
  const [password, setPassword] = useState("password123");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) {
      toast.success("Welcome back");
      const dest = { customer: "/customer", provider: "/provider", retailer: "/retailer", restaurant: "/restaurant" }[r.user.role] || "/";
      nav(dest);
    } else setErr(r.error);
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
          <div className="border-l-2 border-red-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Delivery</div><div className="font-mono">P2P + courier</div></div>
          <div className="border-l-2 border-blue-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Local</div><div className="font-mono">Handyman + more</div></div>
          <div className="border-l-2 border-amber-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Digital</div><div className="font-mono">Tech + creative</div></div>
          <div className="border-l-2 border-teal-500 pl-2"><div className="text-slate-400 uppercase tracking-widest">Remote</div><div className="font-mono">Anywhere work</div></div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight">Sign in</h1>
            <p className="text-sm text-slate-500 mt-1">Welcome back to Lumo.</p>
          </div>
          <div>
            <Label className="overline">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" className="mt-1" />
          </div>
          {err && <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2" data-testid="login-error">{err}</div>}
          <Button type="submit" disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="login-submit">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <div className="text-xs text-slate-500">
            No account? <Link to="/signin" className="text-teal-700 underline">Sign up with your phone</Link>
          </div>
          <div className="text-[11px] text-slate-400 font-mono pt-4 border-t border-slate-100">
            Demo seeds: customer@lumo.test · provider@lumo.test · retailer@lumo.test · restaurant@lumo.test · admin@lumo.test (password123)
          </div>
        </form>
      </div>
    </div>
  );
}
