import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight, ShoppingBag, Store, Briefcase, Wallet,
  Zap, Building2, Clock, Users, ShieldCheck,
} from "lucide-react";
import HomeReviewsSection from "@/components/HomeReviewsSection";
import EmailSubscribeForm from "@/components/EmailSubscribeForm";
import LanguageBar from "@/components/LanguageBar";
import { useAuth } from "@/lib/auth";

export default function Landing() {
  const { user } = useAuth();
  // Logged-in users see context-aware CTAs (jump straight into their hub),
  // anonymous users see "Create an account".
  const dashFor = {
    provider: "/provider",
    retailer: "/retailer",
    restaurant: "/restaurant",
    admin: "/admin",
  };
  const primaryCta = user
    ? { to: dashFor[user.role] || "/customer", label: "Open your dashboard" }
    : { to: "/signin", label: "Create an account" };

  return (
    <div className="bg-white">
      <LanguageBar />
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200 relative overflow-hidden">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7">
            <div className="overline text-teal-700">Lumo</div>
            <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mt-4 leading-none">
              Local <span className="text-red-600">deliveries</span>,<br />
              everyday <span className="text-blue-600">services</span>,<br />
              <span className="text-amber-600">digital</span> &amp; <span className="text-teal-700">remote</span> work —<br />
              in one place.
            </h1>
            <p className="text-lg text-slate-600 mt-6 max-w-xl leading-relaxed">
              Lumo connects customers with trusted providers for everything from package delivery and home services to retail orders and remote contracts. Post a request, review quotes, and pay safely — all in one app.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to={primaryCta.to}><Button size="lg" className="bg-slate-900 hover:bg-slate-800" data-testid="hero-cta-register">{primaryCta.label} <ArrowUpRight className="ml-1 w-4 h-4" /></Button></Link>
              <Link to="/map"><Button size="lg" variant="outline" data-testid="hero-cta-map">Browse open jobs</Button></Link>
            </div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            {[
              { c: "#DC2626", k: "Delivery", v: "Couriers & moving" },
              { c: "#2563EB", k: "Local services", v: "Home, auto, pets" },
              { c: "#D97706", k: "Digital & tech", v: "Builds & creative" },
              { c: "#0F766E", k: "Remote work", v: "Anywhere, anytime" },
            ].map((t) => (
              <div key={t.k} className="border border-slate-200 p-5" data-testid={`hero-tile-${t.k}`}>
                <div className="w-3 h-3 rounded-full" style={{ background: t.c }} />
                <div className="font-display font-bold mt-4">{t.k}</div>
                <div className="text-xs text-slate-500 mt-1 font-mono uppercase tracking-wider">{t.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Same-day on-demand delivery banner ──────────────────────────── */}
      <section className="bg-slate-900 text-white border-b border-slate-900" data-testid="ondemand-banner">
        <div className="max-w-screen-2xl mx-auto px-6 py-14 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <div className="flex items-center gap-2 overline text-red-400">
              <Zap className="w-3 h-3" /> Same-day, on-demand
            </div>
            <h2 className="font-display text-3xl md:text-5xl font-black tracking-tighter mt-3 leading-[1.05]">
              Anything from <span className="text-red-400">anywhere</span>,<br />
              delivered <span className="text-amber-400">today</span>.
            </h2>
            <p className="text-slate-300 mt-5 max-w-xl leading-relaxed">
              Order from any local restaurant, retailer, or even an individual on the platform — our community of drivers brings it to your door the same day. No menus to negotiate, no minimums, no waiting for tomorrow.
            </p>
          </div>
          <div className="md:col-span-5 grid grid-cols-3 gap-px bg-slate-800">
            {[
              { Icon: ShoppingBag, t: "Retailers", d: "Any store, any item" },
              { Icon: Store,       t: "Restaurants", d: "Full local catalog" },
              { Icon: Users,       t: "People",  d: "From your neighbors" },
            ].map((b) => (
              <div key={b.t} className="bg-slate-900 p-5 text-center">
                <b.Icon className="w-5 h-5 text-amber-400 mx-auto" />
                <div className="font-display font-bold mt-3 text-sm">{b.t}</div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono uppercase tracking-wider">{b.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases (kept) ─────────────────────────────────────────────── */}
      <section className="max-w-screen-2xl mx-auto px-6 py-16 border-b border-slate-200">
        <div className="overline">How Lumo works</div>
        <div className="mt-6 grid md:grid-cols-3 gap-px bg-slate-200">
          {[
            { icon: ShoppingBag, t: "Request a service.", d: "Tell us what you need — delivery, a home service, or a remote project. Add a photo, set your budget, and we will match you with nearby providers.", to: "/customer" },
            { icon: Store,       t: "Shop your neighborhood.", d: "Order from local stores and restaurants in one place. We arrange same-day delivery automatically — you only ever pay one bill.", to: "/stores" },
            { icon: Briefcase,   t: "Earn on your schedule.", d: "Providers accept jobs in their area or send a counter-offer with their own rate. Pick the work that fits — by the hour, day, week, or flat fee.", to: "/provider" },
          ].map((u) => (
            <Link key={u.t} to={u.to} className="bg-white p-8 hover:bg-slate-50" data-testid={`usecase-${u.t}`}>
              <u.icon className="w-5 h-5 text-teal-700" />
              <div className="font-display text-xl font-bold mt-4">{u.t}</div>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{u.d}</p>
              <div className="overline mt-6 flex items-center gap-1">Open <ArrowUpRight className="w-3 h-3" /></div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── REVISED: Commission + payments (no more "10% deposit") ─────── */}
      <section className="max-w-screen-2xl mx-auto px-6 py-20" data-testid="commission-section">
        <div className="grid md:grid-cols-12 gap-10">
          <div className="md:col-span-5">
            <div className="overline text-teal-700">Built for the people doing the work</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-3 leading-[1.05]">
              Keep <span className="text-teal-700">90%</span> of what you earn.
            </h2>
            <p className="text-slate-600 mt-5 leading-relaxed">
              Lumo only takes a flat <strong>10% commission</strong> — half of what most gig platforms charge. Every dollar a customer pays goes into secure escrow and releases to you when the work is done. Withdraw any time to your bank, debit card, or in-app wallet.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono uppercase tracking-wider">
              {["Stripe payouts", "Cash optional", "Card on file", "Wallet credit"].map((t) => (
                <span key={t} className="border border-slate-300 px-2 py-1">{t}</span>
              ))}
            </div>
          </div>

          {/* Commission comparison — clean grid, no chart */}
          <div className="md:col-span-7">
            <div className="overline mb-3">Commission, compared</div>
            <div className="divide-y divide-slate-200 border border-slate-200">
              {[
                { name: "Lumo",         pct: 10, hi: true },
                { name: "TaskRabbit",   pct: 15 },
                { name: "Instacart",    pct: 15 },
                { name: "DoorDash",     pct: 25 },
                { name: "Uber Eats",    pct: 30 },
                { name: "Airbnb (host)", pct: 14 },
              ].map((c) => (
                <div key={c.name} className="flex items-center gap-3 sm:gap-4 px-4 py-3" data-testid={`compare-${c.name.toLowerCase().replace(/[^a-z]/g, '-')}`}>
                  <div className={`w-[28%] sm:w-[26%] shrink-0 font-display font-bold text-sm sm:text-base leading-tight ${c.hi ? "text-teal-700" : "text-slate-700"}`}>
                    {c.name}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="h-2 bg-slate-100 relative">
                      <div
                        className={`absolute inset-y-0 left-0 ${c.hi ? "bg-teal-600" : "bg-slate-400"}`}
                        style={{ width: `${(c.pct / 30) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className={`w-12 shrink-0 text-right font-mono text-sm tabular-nums ${c.hi ? "text-teal-700 font-bold" : "text-slate-500"}`}>
                    {c.pct}%
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-2 uppercase tracking-wider">
              Comparison shows publicly disclosed take-rates · last verified 2026
            </div>
          </div>
        </div>

        {/* Payments — quietly under the commission story */}
        <div className="mt-12 grid md:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
          {[
            { Icon: ShieldCheck, t: "Escrow on every order",     d: "Customer funds are held safely until the job is confirmed — protection for both sides." },
            { Icon: Wallet,      t: "Pay how you want",          d: "Stripe, debit, in-app wallet, or cash on completion. Mix and match per job." },
            { Icon: Clock,       t: "Auto-release in 24 hours",  d: "Funds release automatically after delivery — no waiting on customer confirmation." },
          ].map((p) => (
            <div key={p.t} className="bg-white p-6">
              <p.Icon className="w-5 h-5 text-teal-700" />
              <div className="font-display text-lg font-bold mt-3">{p.t}</div>
              <div className="text-sm text-slate-600 mt-2 leading-relaxed">{p.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── NEW: Lumo as personal staffing agency ────────────────────────── */}
      <section className="bg-amber-50 border-y border-amber-200" data-testid="staffing-section">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-5">
            <div className="overline text-amber-700">For workers</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-3 leading-[1.05] text-slate-900">
              Your <span className="text-amber-700">personal staffing agency</span>, in your pocket.
            </h2>
            <p className="text-slate-700 mt-5 leading-relaxed">
              Lumo doesn&apos;t just send you one-off gigs — it places you in front of <strong>every kind of work nearby</strong>, every day. Drive a delivery in the morning, hang drywall in the afternoon, photograph a wedding on the weekend. One profile. One rating. One stream of pay.
            </p>
            <div className="mt-6">
              <Link to={user ? (user.role === "provider" ? "/provider" : "/map") : "/signin"}>
                <Button size="lg" className="bg-amber-700 hover:bg-amber-800 text-white" data-testid="staffing-cta">
                  {user ? "Find work near you" : "Start earning"} <ArrowUpRight className="ml-1 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              "Delivery", "Moving", "Cleaning", "Handyman",
              "Photography", "Tutoring", "Beauty", "Pet care",
              "Childcare", "Lawn care", "IT help", "Event staff",
            ].map((s) => (
              <div key={s} className="bg-white border border-amber-200 p-3 font-display font-bold text-sm" data-testid={`staffing-skill-${s.toLowerCase()}`}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEW: For businesses — find help fast ─────────────────────────── */}
      <section className="border-b border-slate-200" data-testid="business-section">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-5 md:order-2">
            <div className="overline text-blue-700">For businesses</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-3 leading-[1.05]">
              Find <span className="text-blue-700">help</span> in minutes,<br /> not weeks.
            </h2>
            <p className="text-slate-600 mt-5 leading-relaxed">
              Need a courier for today, a warehouse hand for the weekend, or a full-time delivery driver? Post a job once — local pros apply within minutes. Vet them on Lumo, hire on Lumo, or take them off-platform once you&apos;ve found your people.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/customer">
                <Button size="lg" className="bg-blue-700 hover:bg-blue-800 text-white" data-testid="business-cta-post">
                  Post a job <ArrowUpRight className="ml-1 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/map">
                <Button size="lg" variant="outline" data-testid="business-cta-browse">Browse providers</Button>
              </Link>
            </div>
          </div>
          <div className="md:col-span-7 md:order-1">
            <div className="grid grid-cols-2 gap-px bg-slate-200">
              {[
                { Icon: Clock,     t: "On-demand",         d: "Same-day shifts, hourly gigs, and one-off jobs." },
                { Icon: Users,     t: "Recurring crews",   d: "Build a roster you trust and re-hire in one tap." },
                { Icon: Building2, t: "Local talent only", d: "Filter by neighborhood, ratings, and verified credentials." },
                { Icon: Briefcase, t: "Direct hire ready", d: "Convert a great gig worker into a W-2 employee — no extra fees." },
              ].map((b) => (
                <div key={b.t} className="bg-white p-6">
                  <b.Icon className="w-5 h-5 text-blue-700" />
                  <div className="font-display text-lg font-bold mt-3">{b.t}</div>
                  <div className="text-sm text-slate-600 mt-2 leading-relaxed">{b.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Customer reviews (or founding members block) ────────────────── */}
      <HomeReviewsSection />

      {/* ── Email subscription ──────────────────────────────────────────── */}
      <section className="max-w-screen-2xl mx-auto px-6 py-16" data-testid="home-subscribe-section">
        <div className="grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-6">
            <div className="overline text-teal-700">Stay in the loop</div>
            <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-3 leading-[1.05]">
              Two short emails a day.<br />Worth opening, we promise.
            </h2>
            <p className="text-slate-600 mt-4 max-w-xl">
              A quick note in the morning and one in the afternoon — each highlighting a different way to use Lumo. Unsubscribe in one click whenever.
            </p>
          </div>
          <div className="md:col-span-6">
            <EmailSubscribeForm source="landing_inline" variant="card" />
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="max-w-screen-2xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display text-4xl md:text-6xl font-black tracking-tighter leading-[1.05]">
          One app. One community.<br />
          Everything you need <span className="text-teal-700">done</span>.
        </h2>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <Link to={primaryCta.to}><Button size="lg" className="bg-slate-900 hover:bg-slate-800" data-testid="final-cta-join">{primaryCta.label}</Button></Link>
          <Link to="/map"><Button size="lg" variant="outline" data-testid="final-cta-browse">Browse the map</Button></Link>
        </div>
      </section>
    </div>
  );
}
