import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, Bike, Store, Building2, ChevronRight } from "lucide-react";
import { PERSONAS } from "@/lib/persona";

const CARDS = [
  { key: "customer", Icon: ShoppingBag },
  { key: "provider", Icon: Bike },
  { key: "seller", Icon: Store },
  { key: "real_estate", Icon: Building2 },
];

export default function AppWelcome() {
  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white px-5 pt-[calc(env(safe-area-inset-top)+40px)] pb-10 flex flex-col" data-testid="app-welcome">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="font-display font-black text-5xl tracking-tighter" data-testid="app-welcome-logo">Lumo</div>
        <p className="mt-3 text-white/60 text-base leading-snug max-w-xs">Local help, food, products and places. One app.</p>
      </motion.div>
      <div className="mt-10 text-xs uppercase tracking-[0.2em] text-white/40 font-mono">Continue as</div>
      <div className="mt-3 space-y-3 flex-1">
        {CARDS.map(({ key, Icon }, i) => {
          const p = PERSONAS[key];
          return (
            <motion.div key={key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}>
              <Link to={`/start/${key}`} className={`flex items-center gap-4 p-4 rounded-3xl bg-gradient-to-br ${p.tint} active:scale-[0.98] transition-transform`} data-testid={`app-persona-${key}`}>
                <span className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-display font-bold text-lg leading-tight">{p.label}</span>
                  <span className="block text-sm text-white/80 leading-snug mt-0.5">{p.tagline}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-white/70" />
              </Link>
            </motion.div>
          );
        })}
      </div>
      <Link to="/signin" className="mt-8 text-center text-sm text-white/60" data-testid="app-welcome-signin">
        Already have an account? <span className="text-white font-semibold underline">Sign in</span>
      </Link>
    </div>
  );
}
