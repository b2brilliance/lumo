import React, { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, UtensilsCrossed, ShoppingBasket, KeyRound, Home } from "lucide-react";
import { PERSONAS, setChosenPersona } from "@/lib/persona";

const CHOICES = {
  seller: { q: "What do you run?", opts: [
    { v: "restaurant", label: "Restaurant or food business", Icon: UtensilsCrossed },
    { v: "retailer", label: "Shop or store", Icon: ShoppingBasket },
  ] },
  real_estate: { q: "What do you want to do?", opts: [
    { v: "seeking", label: "Buy or rent a place", Icon: KeyRound },
    { v: "listing", label: "Sell or rent out a place", Icon: Home },
  ] },
};

function registerUrl(key, choice) {
  if (key === "seller") return `/register?role=${choice}`;
  if (key === "real_estate") return `/register?role=real_estate&re_mode=${choice}`;
  return `/register?role=${key}`;
}

export default function AppStart() {
  const { persona } = useParams();
  const nav = useNavigate();
  const p = PERSONAS[persona];
  const ask = CHOICES[persona];
  const [choice, setChoice] = useState(ask ? ask.opts[0].v : null);
  if (!p || persona === "admin") return <Navigate to="/" replace />;

  const go = (to) => {
    setChosenPersona(persona, persona === "seller" ? choice : null);
    if (persona === "real_estate") { try { localStorage.setItem("lumo_re_mode", choice); } catch { /* noop */ } }
    nav(to);
  };

  return (
    <div className={`min-h-[100dvh] bg-gradient-to-br ${p.tint} text-white px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col`} data-testid={`app-start-${persona}`}>
      <Link to="/" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full active:bg-white/10" aria-label="Back" data-testid="app-start-back">
        <ChevronLeft className="w-6 h-6" />
      </Link>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
        <div className="text-xs uppercase tracking-[0.2em] text-white/70 font-mono">Lumo for</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-2 leading-[1.05]" data-testid="app-start-title">{p.label}</h1>
        <p className="mt-3 text-white/85 text-base">{p.tagline}</p>
      </motion.div>
      {ask && (
        <div className="mt-10" data-testid="app-start-choice">
          <div className="text-sm font-semibold mb-3">{ask.q}</div>
          <div className="space-y-2.5">
            {ask.opts.map(({ v, label, Icon }) => (
              <button key={v} onClick={() => setChoice(v)} className={`w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-colors ${choice === v ? "bg-white text-slate-900" : "bg-white/15 text-white"}`} data-testid={`app-start-choice-${v}`}>
                <Icon className="w-5 h-5" /> <span className="font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1" />
      <div className="space-y-3 mt-10">
        <button onClick={() => go(registerUrl(persona, choice))} className="w-full h-14 rounded-full bg-white text-slate-900 font-bold text-base active:scale-[0.98] transition-transform" data-testid="app-start-create">
          Create account
        </button>
        <button onClick={() => go("/signin")} className="w-full h-14 rounded-full bg-black/25 text-white font-semibold text-base active:scale-[0.98] transition-transform" data-testid="app-start-signin">
          I already have an account
        </button>
      </div>
    </div>
  );
}
