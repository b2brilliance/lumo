import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Search, MapPin, ShoppingBag, UtensilsCrossed, Car, Home,
  KeyRound, Store, Wrench, Sparkles, Truck, PawPrint,
  Laptop, Briefcase, HardHat, Scissors,
  ArrowRight, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/locale";

/* Uber × Craigslist homepage
 * ─────────────────────────
 * Top: "What do you need?" search + auto-detected location (editable).
 * Middle: dense category grid — one tap to browse.
 * Bottom: how it works (3 tiles) + 90% commission tile. Nothing else.
 * Removed marketing bloat, subscribe form, philosophy sections. */

const SERVICES = [
  { key: "delivery",     label: "Delivery",     Icon: Truck,           to: "/order/delivery" },
  { key: "cleaning",     label: "Cleaning",     Icon: Sparkles,        to: "/order/cleaning" },
  { key: "moving",       label: "Moving",       Icon: HardHat,         to: "/order/moving" },
  { key: "handyman",     label: "Handyman",     Icon: Wrench,          to: "/order/handyman" },
  { key: "pet_care",     label: "Pet care",     Icon: PawPrint,        to: "/order/pet_care" },
  { key: "personal_care",label: "Beauty",       Icon: Scissors,        to: "/order/personal_care" },
  { key: "it_support",   label: "Tech help",    Icon: Laptop,          to: "/order/it_support" },
  { key: "more",         label: "More services",Icon: ArrowRight,      to: "/services" },
];

const BROWSE = [
  { key: "food",         label: "Food",         Icon: UtensilsCrossed, to: "/restaurants" },
  { key: "marketplace",  label: "For sale",     Icon: ShoppingBag,     to: "/marketplace" },
  { key: "autos",        label: "Cars",         Icon: Car,             to: "/autos" },
  { key: "rentals",      label: "Rentals",      Icon: KeyRound,        to: "/rentals" },
  { key: "housing",      label: "Housing",      Icon: Home,            to: "/real-estate" },
  { key: "stores",       label: "Stores",       Icon: Store,           to: "/stores" },
];

const COUNTRY_LABELS = {
  US: "United States", CA: "Canada", GB: "United Kingdom", FR: "France", DE: "Germany",
  ES: "Spain", IT: "Italy", MX: "Mexico", AU: "Australia", JP: "Japan", IN: "India",
  BR: "Brazil", AE: "United Arab Emirates", SG: "Singapore", NG: "Nigeria",
};

export default function Landing() {
  const { user } = useAuth();
  const { country, setCountryOverride } = useLocale() || {};
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [locOpen, setLocOpen] = useState(false);

  const submit = (e) => {
    e?.preventDefault?.();
    const query = q.trim();
    if (!query) { nav("/map"); return; }
    nav(`/stores?q=${encodeURIComponent(query)}`);
  };

  const locLabel = COUNTRY_LABELS[country] || country || "Set location";

  return (
    <div className="bg-white min-h-screen">
      <Helmet>
        <title>Lumo — What do you need? Local services, jobs, delivery, rentals</title>
        <meta name="description" content="One tap to find local help, order delivery, sell your stuff, rent anything, or hire a pro. Lumo — like Uber met Craigslist and everyone won." />
        <link rel="canonical" href="https://golumo.app/" />
      </Helmet>

      {/* ─── Hero: search + location ─────────────────────────────── */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tighter text-center">
            What do you need?
          </h1>

          <form onSubmit={submit} className="mt-6 sm:mt-8" data-testid="home-search-form">
            <div className="flex items-stretch border-2 border-slate-900 bg-white shadow-lg">
              <div className="flex items-center pl-3 sm:pl-4 text-slate-500">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Try 'cleaning', 'used couch', 'moving help'..."
                aria-label="What do you need?"
                className="flex-1 min-w-0 px-3 py-4 text-base sm:text-lg focus:outline-none"
                data-testid="home-search-input"
              />
              <button
                type="submit"
                className="bg-slate-900 text-white px-4 sm:px-6 font-mono text-xs sm:text-sm uppercase tracking-wider hover:bg-teal-700 transition-colors"
                data-testid="home-search-submit"
              >
                Search
              </button>
            </div>
          </form>

          {/* Location bar */}
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-teal-700" />
            <span className="text-slate-500">Showing near</span>
            <button
              onClick={() => setLocOpen((v) => !v)}
              className="font-display font-bold text-slate-900 underline decoration-dotted underline-offset-2 hover:text-teal-700"
              data-testid="home-location-toggle"
            >
              {locLabel}
            </button>
          </div>

          {locOpen && (
            <div className="mt-3 max-w-md mx-auto border border-slate-300 bg-white p-3" data-testid="home-location-picker">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">Change location</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {Object.entries(COUNTRY_LABELS).map(([c, name]) => (
                  <button
                    key={c}
                    onClick={() => { setCountryOverride?.(c); setLocOpen(false); }}
                    className={`text-left px-2 py-1.5 text-sm hover:bg-slate-100 ${country === c ? "bg-teal-50 text-teal-800 font-bold" : "text-slate-700"}`}
                    data-testid={`home-loc-${c}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── "Get help" — services (Uber-style order flow) ─────── */}
      <section className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <div className="flex items-center justify-between mb-3">
            <div className="overline">Get help — order now</div>
            <Link to="/services" className="text-xs font-mono uppercase tracking-wider text-teal-700 hover:underline" data-testid="home-more-services">All services →</Link>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-px bg-slate-200 border border-slate-200">
            {SERVICES.map((c) => (
              <Link
                key={c.key}
                to={c.to}
                className="bg-white flex flex-col items-center justify-center text-center p-3 sm:p-5 hover:bg-teal-50 active:bg-teal-100 transition-colors min-h-[90px] sm:min-h-[110px]"
                data-testid={`home-service-${c.key}`}
              >
                <c.Icon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700" />
                <div className="text-[11px] sm:text-sm font-display font-bold mt-2 leading-tight">{c.label}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── "Browse & buy" — marketplaces ─────────────────────── */}
      <section className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-6 sm:pb-10">
          <div className="overline mb-3">Browse & buy</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-slate-200 border border-slate-200">
            {BROWSE.map((c) => (
              <Link
                key={c.key}
                to={c.to}
                className="bg-white flex flex-col items-center justify-center text-center p-3 sm:p-5 hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[90px] sm:min-h-[110px]"
                data-testid={`home-browse-${c.key}`}
              >
                <c.Icon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700" />
                <div className="text-[11px] sm:text-sm font-display font-bold mt-2 leading-tight">{c.label}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Quick actions strip — Uber-style CTAs ────────────────── */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { to: "/customer",           t: "Post a job",       Icon: Zap,       color: "text-red-600" },
            { to: "/map",                t: "Jobs near me",     Icon: Briefcase, color: "text-blue-600" },
            { to: "/marketplace/new",    t: "Sell an item",     Icon: ShoppingBag, color: "text-amber-600" },
            { to: "/become-a-provider",  t: "Earn on Lumo",     Icon: HardHat,   color: "text-teal-700" },
          ].map((a) => (
            <Link
              key={a.t}
              to={a.to}
              className="flex items-center gap-2 sm:gap-3 bg-white border border-slate-200 hover:border-slate-900 px-3 py-3 sm:py-4 group"
              data-testid={`home-action-${a.t.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <a.Icon className={`w-5 h-5 ${a.color} flex-shrink-0`} />
              <div className="font-display font-bold text-sm sm:text-base flex-1 leading-tight">{a.t}</div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </section>

      {/* ─── 90% keep + how it works (compact, no essay) ──────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid md:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
          <div className="bg-white p-6">
            <div className="font-display text-4xl sm:text-5xl font-black tracking-tighter text-teal-700">90%</div>
            <div className="text-sm text-slate-600 mt-2 leading-snug">Workers keep 90% of every job. Lumo takes a flat 10% — half what most gig apps charge.</div>
          </div>
          <div className="bg-white p-6">
            <div className="font-display text-4xl sm:text-5xl font-black tracking-tighter text-slate-900">1 tap</div>
            <div className="text-sm text-slate-600 mt-2 leading-snug">Accept jobs, book help, buy an item — everything is one tap. GPS-based, escrow-protected, instant confirmation.</div>
          </div>
          <div className="bg-white p-6">
            <div className="font-display text-4xl sm:text-5xl font-black tracking-tighter text-red-600">24 hr</div>
            <div className="text-sm text-slate-600 mt-2 leading-snug">Payouts land in your bank within 24 hours of the job being marked complete. No 7-day holds.</div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            {user ? "Welcome back — jump into your dashboard." : "New here? Sign up in 30 seconds."}
          </div>
          <Link
            to={user ? "/customer" : "/signin"}
            className="bg-slate-900 text-white px-5 py-2.5 font-mono uppercase tracking-wider text-xs sm:text-sm hover:bg-teal-700"
            data-testid="home-primary-cta"
          >
            {user ? "Open dashboard" : "Get started"} <ArrowRight className="inline w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
      </section>
    </div>
  );
}
