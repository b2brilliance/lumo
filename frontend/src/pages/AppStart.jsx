import React, { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, UtensilsCrossed, Truck, Store, Package, KeyRound, Home, Phone, Mail } from "lucide-react";
import { PERSONAS, setChosenPersona } from "@/lib/persona";

const CHOICES = {
  seller: { q: "What do you sell?", opts: [
    { v: "restaurant", label: "Restaurant", Icon: UtensilsCrossed },
    { v: "food_truck", label: "Food truck or mobile kitchen", Icon: Truck },
    { v: "storefront", label: "Store or shop", Icon: Store },
    { v: "personal_shop", label: "My own items (personal shop)", Icon: Package },
  ] },
  real_estate: { q: "What do you want to do?", opts: [
    { v: "seeking", label: "Buy or rent a place", Icon: KeyRound },
    { v: "listing", label: "Sell or rent out a place", Icon: Home },
  ] },
};

const roleFor = (persona, choice) => {
  if (persona === "seller") return ["restaurant", "food_truck"].includes(choice) ? "restaurant" : "retailer";
  return persona;
};

const GoogleG = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" /></svg>
);
const AppleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M16.4 12.7c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" /></svg>
);

// Google blocks sign-in inside in-app web views and Apple keys are pending, so the store apps use phone/email.
const NATIVE = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

export default function AppStart() {
  const { persona } = useParams();
  const nav = useNavigate();
  const p = PERSONAS[persona];
  const ask = CHOICES[persona];
  const [choice, setChoice] = useState(ask ? ask.opts[0].v : null);
  if (!p || persona === "admin") return <Navigate to="/" replace />;

  const remember = () => {
    const role = roleFor(persona, choice);
    setChosenPersona(persona, persona === "seller" ? role : null);
    try {
      if (persona === "real_estate") localStorage.setItem("lumo_re_mode", choice);
      if (persona === "seller") localStorage.setItem("lumo_store_type", choice);
    } catch { /* noop */ }
    return role;
  };
  const google = () => {
    remember();
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
    const redirectUrl = window.location.origin + "/signin";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  const signupUrl = () => {
    const role = remember();
    return `/register?role=${role}${persona === "real_estate" ? `&re_mode=${choice}` : ""}`;
  };

  const btn = "w-full h-13 py-3.5 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform";
  return (
    <div className={`min-h-[100dvh] bg-gradient-to-br ${p.tint} text-white px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col`} data-testid={`app-start-${persona}`}>
      <Link to="/" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full active:bg-white/10" aria-label="Back" data-testid="app-start-back">
        <ChevronLeft className="w-6 h-6" />
      </Link>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
        <h1 className="font-display font-black text-4xl tracking-tight leading-[1.05]" data-testid="app-start-title">{p.label}</h1>
        <p className="mt-2 text-white/85 text-base">{p.tagline}</p>
      </motion.div>
      {ask && (
        <div className="mt-8" data-testid="app-start-choice">
          <div className="text-sm font-semibold mb-3">{ask.q}</div>
          <div className="grid grid-cols-2 gap-2.5">
            {ask.opts.map(({ v, label, Icon }) => (
              <button key={v} onClick={() => setChoice(v)} className={`flex flex-col items-start gap-2 p-3.5 rounded-2xl text-left text-sm transition-colors ${choice === v ? "bg-white text-slate-900" : "bg-white/15 text-white"}`} data-testid={`app-start-choice-${v}`}>
                <Icon className="w-5 h-5" /> <span className="font-semibold leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1" />
      <div className="space-y-2.5 mt-8" data-testid="app-start-auth">
        {!NATIVE && (
          <>
            <button onClick={() => toast("Sign in with Apple is coming soon. Use Google, phone or email for now.")} className={`${btn} bg-black text-white`} data-testid="app-start-apple">
              <AppleLogo /> Continue with Apple
            </button>
            <button onClick={google} className={`${btn} bg-white text-slate-900`} data-testid="app-start-google">
              <GoogleG /> Continue with Google
            </button>
          </>
        )}
        <button onClick={() => { remember(); nav("/signin?method=phone"); }} className={`${btn} bg-white/15 text-white`} data-testid="app-start-phone">
          <Phone className="w-5 h-5" /> Continue with phone number
        </button>
        <button onClick={() => nav(signupUrl())} className={`${btn} bg-white/15 text-white`} data-testid="app-start-create">
          <Mail className="w-5 h-5" /> Sign up with email
        </button>
        <button onClick={() => { remember(); nav("/signin"); }} className="w-full pt-2 text-sm text-white/80" data-testid="app-start-signin">
          Already have an account? <span className="font-semibold underline">Log in</span>
        </button>
      </div>
    </div>
  );
}
