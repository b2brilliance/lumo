import React, { useEffect, useMemo, useRef, useState } from "react";
import { signupExtras, clearRedeemedRef } from "@/components/RefCapture";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Phone, KeyRound, ArrowLeft, MessageSquare, Mail } from "lucide-react";

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
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p;
}

function GoogleIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" {...props}>
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function SignIn() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, loginWithSmsResult, refresh } = useAuth();

  const next = useMemo(() => new URLSearchParams(loc.search).get("next") || "", [loc.search]);
  const smartReturn = (u) => {
    if (next) { nav(next); return; }
    if (u?.role === "provider") nav("/provider");
    else if (u?.role === "retailer" || u?.role === "restaurant") nav("/seller");
    else if (u?.role === "real_estate") nav(u.re_mode === "listing" ? "/real-estate/mine" : "/real-estate");
    else if (u?.role === "admin") nav("/admin");
    else if (window.matchMedia("(max-width: 767px)").matches || window.Capacitor?.isNativePlatform?.()) nav("/for-you");
    // Customers land on the homepage — they can pick a service directly
    // from the tiled service grid, no separate "hub" page.
    else nav("/");
  };

  // ── Google OAuth callback handler ──────────────────────────────────────
  // Emergent OAuth returns the user to /signin#session_id=<uuid>.
  // We detect it synchronously on mount, swap it for a Lumo JWT, then redirect.
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
  const handledHash = useRef(false);
  const [exchanging, setExchanging] = useState(() => /[#&]session_id=/.test(window.location.hash));

  useEffect(() => {
    if (handledHash.current) return;
    const m = window.location.hash.match(/session_id=([^&]+)/);
    if (!m) return;
    handledHash.current = true;
    const sessionId = decodeURIComponent(m[1]);
    // Clean the hash from the URL immediately so it isn't replayable.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    (async () => {
      try {
        const { data } = await api.post("/auth/google/exchange", { session_id: sessionId, ...signupExtras(next) });
        const r = loginWithSmsResult(data); // same shape, reuses helper
        if (r.is_new) clearRedeemedRef();
        toast.success(r.is_new ? "Welcome to Lumo!" : "Welcome back!");
        smartReturn(r.user);
      } catch (err) {
        toast.error(formatApiError(err));
        setExchanging(false);
      }
    })();
  }, []); // eslint-disable-line

  // Skip if already signed in (after a refresh resolves)
  useEffect(() => {
    if (user && !exchanging) smartReturn(user);
  }, [user, exchanging]); // eslint-disable-line

  // ── Mode state: "choose" | "phone-input" | "phone-code"  ──────────────
  const [mode, setMode] = useState("choose");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const startGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
    const returnTo = next ? `/signin?next=${encodeURIComponent(next)}` : "/signin";
    const redirectUrl = window.location.origin + returnTo;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

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
      setMode("phone-code");
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
      const { data } = await api.post("/auth/sms/verify", { phone, code, ...signupExtras(next) });
      const r = loginWithSmsResult(data);
      if (r.is_new) clearRedeemedRef();
      toast.success(r.is_new ? "Welcome to Lumo!" : "Welcome back!");
      smartReturn(r.user);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (exchanging) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center" data-testid="signin-exchanging">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-xs font-mono tracking-widest text-slate-500 mt-4 uppercase">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-b from-white via-white to-slate-50 flex items-center justify-center px-4 py-10" data-testid="signin-page">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase" data-testid="signin-overline">
            {next.startsWith("/admin") ? "Lumo · Admin sign in" : "Lumo · Sign in"}
          </p>
          <h1 className="font-display text-4xl font-black tracking-tight mt-1">
            {mode === "choose" ? (next.startsWith("/admin") ? "Admin dashboard." : "Welcome to Lumo.") : "No password.\u00a0Just your phone."}
          </h1>
          <p className="text-slate-600 mt-2 text-sm">
            {mode === "choose" ? "Pick how you'd like to sign in. New here? An account is created automatically." :
             mode === "phone-code" ? "Enter the 6-digit code we just texted you." :
             "We'll text you a 6-digit code. Takes 10 seconds."}
          </p>
        </div>

        {mode === "choose" && (
          <div className="space-y-3 border border-slate-200 p-6 bg-white" data-testid="signin-choose">
            {/* Official Google-brand-guideline sign-in button — white surface,
                Roboto text, 40px height min, 4px radius. Matches what users
                see on other well-known sites. */}
            <button
              onClick={startGoogle}
              type="button"
              className="w-full h-12 flex items-center justify-center gap-3 bg-white border border-[#dadce0] hover:bg-[#f8f9fa] hover:border-[#d2e3fc] active:bg-[#e8f0fe] transition-colors shadow-sm text-[#3c4043] font-medium text-[15px] rounded"
              style={{ fontFamily: '"Google Sans", Roboto, arial, sans-serif' }}
              data-testid="signin-google-btn"
            >
              <GoogleIcon />
              <span>Sign in with Google</span>
            </button>
            <Button
              onClick={() => setMode("phone-input")}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-base"
              data-testid="signin-phone-btn"
            >
              <Phone className="w-4 h-4 mr-2" />Continue with phone
            </Button>
            <Link
              to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="block"
              data-testid="signin-email-btn"
            >
              <Button variant="outline" className="w-full h-12 text-base">
                <Mail className="w-4 h-4 mr-2" />Continue with email
              </Button>
            </Link>
            <p className="pt-3 text-center text-xs text-slate-500">
              First time? Tap any option to create your account in seconds.
            </p>
          </div>
        )}

        {mode === "phone-input" && (
          <form onSubmit={sendCode} className="space-y-4 border border-slate-200 p-6 bg-white" data-testid="signin-phone-form">
            <button type="button" onClick={() => setMode("choose")} className="text-xs font-mono text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-1" data-testid="signin-back-to-choose">
              <ArrowLeft className="w-3 h-3" />Other options
            </button>
            <div>
              <Label className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-slate-500">
                <Phone className="w-3 h-3" />Mobile number
              </Label>
              <Input
                data-testid="signin-phone-input"
                type="tel" inputMode="tel" autoComplete="tel" autoFocus
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
          </form>
        )}

        {mode === "phone-code" && (
          <form onSubmit={verify} className="space-y-4 border border-slate-200 p-6 bg-white" data-testid="signin-code-form">
            <button type="button" onClick={() => { setMode("phone-input"); setCode(""); }} className="text-xs font-mono text-slate-500 hover:text-slate-900 flex items-center gap-1 mb-1" data-testid="signin-edit-phone">
              <ArrowLeft className="w-3 h-3" />Edit number
            </button>
            <div>
              <Label className="flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-slate-500">
                <KeyRound className="w-3 h-3" />Verification code
              </Label>
              <Input
                ref={codeInputRef}
                data-testid="signin-code-input"
                type="text" inputMode="numeric" autoComplete="one-time-code"
                pattern="\d{4,8}" maxLength={8}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
                className="mt-1 text-2xl tracking-[0.5em] font-mono text-center h-14"
                required
              />
              <p className="text-xs text-slate-500 mt-2">Sent to <span className="font-mono">{prettyPhone(phone)}</span></p>
            </div>
            <Button type="submit" disabled={busy || code.length < 4} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-base" data-testid="signin-verify">
              {busy ? "Verifying…" : "Sign in"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" disabled={resendCooldown > 0 || busy} onClick={sendCode}
                className="text-slate-500 hover:text-slate-900 disabled:opacity-40 flex items-center gap-1" data-testid="signin-resend">
                <MessageSquare className="w-3 h-3" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400 font-mono tracking-wide">
          By signing in you agree to Lumo&apos;s Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
