import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ROLES = [
  { value: "customer", label: "Customer", desc: "Post requests, buy from stores, hire remotely." },
  { value: "provider", label: "Provider", desc: "Deliver, fix, work — local or remote." },
  { value: "retailer", label: "Retailer", desc: "Open a storefront and sell inventory." },
  { value: "restaurant", label: "Restaurant", desc: "List your menu and accept delivery orders." },
];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "customer" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await register(form);
    setBusy(false);
    if (r.ok) {
      toast.success("Account created");
      const dest = { customer: "/customer", provider: "/provider", retailer: "/retailer", restaurant: "/restaurant" }[r.user.role] || "/";
      nav(dest);
    } else setErr(r.error);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] max-w-5xl mx-auto px-6 py-12 grid lg:grid-cols-12 gap-12">
      <div className="lg:col-span-5">
        <div className="overline">Get started</div>
        <h1 className="font-display text-4xl font-black tracking-tight mt-2">Join Lumo.</h1>
        <p className="text-slate-600 mt-3">Pick your role. You can always add more later.</p>
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
        {err && <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2" data-testid="register-error">{err}</div>}
        <Button type="submit" disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="register-submit">
          {busy ? "Creating…" : "Create account"}
        </Button>
        <div className="text-xs text-slate-500">
          Already have an account? <Link to="/login" className="text-teal-700 underline">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
