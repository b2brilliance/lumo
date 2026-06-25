import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Phone, KeyRound, ArrowLeft, MessageSquare } from "lucide-react";

// Best-effort E.164 normalizer (matches the backend logic).
function normalize(raw) {
  const s = (raw || "").trim();
  const digits = s.replace(/\D+/g, "");
  if (s.startsWith("+")) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return digits ? "+" + digits : "";
}

function prettyPhone(p) {
  const d = (p || "").replace(/\D+/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return p;
}

export default function SignIn() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, loginWithSmsResult } = useAuth();

  // ?next=/jobs/abc/apply preserved across the OTP step
  const next = useMemo(() => new URLSearchParams(loc.search).get("next") || "", [loc.search]);
  // Smart return for Google-Jobs traffic
  const smartReturn = (u) => {
    if (next) { nav(next); return; }
    if (u?.role === "provider") nav("/provider");
    else if (u?.role === "retailer") nav("/retailer");
    else if (u?.role === "restaurant") nav("/restaurant");
    else if (u?.role === "admin") nav("/admin");
    else nav("/customer");
  };

  useEffect(() => { if (user) smartReturn(user); /* already logged in */ }, [user]); // eslint-disable-line

  const [step, setStep] = useState("phone"); // phone | code
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef(null);

  // Cooldown timer for the resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async (e) => {
    e?.preventDefault?.();
    const e164 = normalize(phone);
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
      toast.error("Enter a valid phone number, including country code.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/sms/start", { phone: e164 });
      setPhone(e164);
      setStep("code");
      setResendCooldown(30);
      setTimeout(() => codeInputRef.current?.focus(), 50);
      toast.success("Code sent. Check your texts.");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault?.();
    if (!/^\d{4,8}$/.test(code)) {
      toast.error("Enter the code from your text message.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/sms/verify", { phone, code });
      const r = loginWithSmsResult(data);
      toast.success(r.is_new ? "Welcome to Lumo!" : "Welcome back!");
      smartReturn(r.user);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-white via-white to-slate-50 flex items-center justify-center px-4 py-10" data-testid="signin-page">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Lumo · Sign in</p>
          <h1 className="font-display text-4xl font-black tracking-tight mt-1">No password.<br className="sm:hidden" /> Just your phone.</h1>
          <p className="text-slate-600 mt-2 text-sm">We'll text you a 6-digit code. Takes 10 seconds.</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={sendCode} className="space-y-4 border border-slate-200 p-6 bg-white" data-testid="signin-phone-form">
            <div>
              <Label className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-slate-500">
                <Phone className="w-3 h-3" />Mobile number
              </Label>
              <Input
                data-testid="signin-phone-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                placeholder="+1 (415) 555-2671"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 text-lg h-12"
                required
              />
              <p className="text-xs text-slate-400 mt-2 font-mono">SMS rates may apply. Include country code if outside the US.</p>
            </div>
            <Button type="submit" disabled={busy} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-base" data-testid="signin-send-code">
              {busy ? "Sending…" : "Text me a code"}
            </Button>
            <div className="text-center text-xs text-slate-500 pt-2">
              Prefer a password? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="underline hover:text-slate-900" data-testid="signin-pw-link">Use email + password instead</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4 border border-slate-200 p-6 bg-white" data-testid="signin-code-form">
            <div>
              <button type="button" onClick={() => { setStep("phone"); setCode(""); }} className="text-xs font-mono text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-3" data-testid="signin-edit-phone">
                <ArrowLeft className="w-3 h-3" />Edit number
              </button>
              <Label className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-slate-500">
                <KeyRound className="w-3 h-3" />Verification code
              </Label>
              <Input
                ref={codeInputRef}
                data-testid="signin-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{4,8}"
                maxLength={8}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
                className="mt-1 text-2xl tracking-[0.5em] font-mono text-center h-14"
                required
              />
              <p className="text-xs text-slate-500 mt-2">
                Sent to <span className="font-mono">{prettyPhone(phone)}</span>
              </p>
            </div>
            <Button type="submit" disabled={busy || code.length < 4} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-base" data-testid="signin-verify">
              {busy ? "Verifying…" : "Sign in"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={resendCooldown > 0 || busy}
                onClick={sendCode}
                className="text-slate-500 hover:text-slate-900 disabled:opacity-40 flex items-center gap-1"
                data-testid="signin-resend"
              >
                <MessageSquare className="w-3 h-3" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
              <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-slate-500 hover:text-slate-900 underline" data-testid="signin-pw-fallback">Use password instead</Link>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400 font-mono tracking-wide">
          By signing in you agree to Lumo's Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
