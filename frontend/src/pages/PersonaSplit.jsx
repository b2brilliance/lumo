import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/lib/auth";
import {
  Sparkles, Briefcase, ShoppingBag, Building2, ArrowRight,
} from "lucide-react";

/**
 * PersonaSplit — the first screen a visitor sees.
 * One job: route the human to the right world. Four worlds:
 *   1. I need something done   → /for-you   (customers)
 *   2. I want to work / earn   → /for-work  (providers, jobseekers)
 *   3. Buy or rent stuff       → /marketplace(products + rentals, global)
 *   4. Buy / rent / stay       → /real-estate(real estate, global)
 *
 * Mobile-first: 1 column, big tap targets. Desktop: 2×2 grid.
 */

const TILES = [
  {
    key: "customer",
    to: "/for-you",
    icon: Sparkles,
    overline: "I need something done",
    title: "Book a service.",
    subtitle: "Hire local pros — delivery, home care, auto, business, creative, errands.",
    tint: "bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-500",
    textOnTint: "text-white",
    testid: "persona-customer",
  },
  {
    key: "work",
    to: "/become-a-provider",
    icon: Briefcase,
    overline: "I want to work or earn",
    title: "Get paid.",
    subtitle: "On-demand gigs, long-term contracts, full-time staff roles — your schedule.",
    tint: "bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700",
    textOnTint: "text-white",
    testid: "persona-work",
  },
  {
    key: "market",
    to: "/marketplace",
    icon: ShoppingBag,
    overline: "Buy or rent stuff",
    title: "Shop the market.",
    subtitle: "Buy new or used, or rent for a day — tools, electronics, furniture, outdoor gear.",
    tint: "bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900",
    textOnTint: "text-white",
    testid: "persona-market",
  },
  {
    key: "estate",
    to: "/real-estate",
    icon: Building2,
    overline: "Real estate & rentals",
    title: "Buy, rent or stay.",
    subtitle: "Homes for sale, long-term rentals and short stays worldwide — plus rooms, commercial space and land.",
    tint: "bg-gradient-to-br from-slate-900 via-stone-900 to-amber-900",
    textOnTint: "text-white",
    testid: "persona-estate",
  },
];

export default function PersonaSplit() {
  const { user } = useAuth();
  const isSignedIn = !!(user && user !== false);
  return (
    <>
      <Helmet>
        <title>Lumo — pick your lane</title>
        <meta name="description" content="One global community marketplace. Hire pros, find work, buy or rent stuff, list a home." />
      </Helmet>
      <div className="min-h-[calc(100vh-56px)] bg-white" data-testid="persona-split">
        {/* Headline band */}
        <div className="max-w-6xl mx-auto px-5 pt-10 pb-4 sm:pt-16 sm:pb-6">
          <div className="overline text-slate-500">Lumo · global community marketplace</div>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tighter mt-2 leading-[0.95]">
            What brings you<br className="hidden sm:block" /> here today?
          </h1>
        </div>

        {/* 4 tiles — 1col mobile, 2col desktop */}
        <div className="max-w-6xl mx-auto px-5 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {TILES.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  to={t.to}
                  key={t.key}
                  data-testid={t.testid}
                  className={`group relative overflow-hidden ${t.tint} ${t.textOnTint} p-6 sm:p-8 min-h-[200px] sm:min-h-[260px] flex flex-col justify-between transition-transform hover:-translate-y-0.5 active:translate-y-0`}
                >
                  <div className="flex items-start justify-between">
                    <Icon className="w-8 h-8 sm:w-10 sm:h-10 opacity-90" strokeWidth={1.5} />
                    <div className="opacity-80 group-hover:opacity-100 transition-opacity text-[11px] font-mono uppercase tracking-widest text-white">
                      Enter →
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/85">{t.overline}</div>
                    <div className="font-display text-3xl sm:text-4xl font-black tracking-tighter mt-1 leading-[0.95]">
                      {t.title}
                    </div>
                    <div className="text-sm opacity-90 mt-2 max-w-sm">{t.subtitle}</div>
                  </div>
                  {/* Subtle grain overlay for depth */}
                  <div className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
                       style={{ backgroundImage: "radial-gradient(circle at 20% 10%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                </Link>
              );
            })}
          </div>

          {/* Secondary row — sign-in / help */}
          <div className="mt-10 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm">
            {isSignedIn ? (
              <div className="text-slate-600" data-testid="persona-greeting">
                Welcome back, <span className="font-bold text-slate-900">{user.name || user.email}</span>.
              </div>
            ) : (
              <div className="text-slate-600">
                Already have an account?{" "}
                <Link to="/signin" className="font-bold text-slate-900 underline underline-offset-2" data-testid="persona-signin">
                  Sign in
                </Link>
              </div>
            )}
            <Link to="/about" className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-slate-900" data-testid="persona-about">
              How Lumo works <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
