import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Search, MapPin, ShoppingBag, Car, Wrench, Sparkles, Truck, PawPrint,
  Laptop, HardHat, ArrowRight, Zap, ShieldCheck, Star, Wallet,
  Clock, DollarSign, Camera,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import FeaturedShopWidget from "@/components/FeaturedShopWidget";
import AdSense from "@/components/AdSense";

/* ── Landing (Feb 2026 Uber-inspired redesign) ────────────────────
 *
 * Structure:
 *   1. Full-bleed split hero — big editorial headline + floating request
 *      card (service picker + address input) on white, high-contrast
 *      photograph on the right
 *   2. Service grid — 8 headline categories + "All services" tile
 *   3. How it works — three numbered steps in dense mono
 *   4. Trust markers — 4 stats in a horizontal bar
 *   5. P2P marketplace teaser — Community Market side-section
 *   6. Provider recruitment banner — full-bleed obsidian black card CTA
 *
 * Palette: stark black + white, single blue accent for state/highlights.
 * No gradients. Pill-shaped CTAs. Space Grotesk display type.        */

const SERVICES = [
  { key: "delivery",     label: "Delivery",       tagline: "On-demand, any distance", Icon: Truck,       to: "/order/delivery",     color: "text-orange-500" },
  { key: "cleaning",     label: "Cleaning",       tagline: "Same-day pros",       Icon: Sparkles,    to: "/order/cleaning",     color: "text-cyan-500" },
  { key: "moving",       label: "Moving",         tagline: "Hourly / haul",       Icon: HardHat,     to: "/order/moving",       color: "text-yellow-500" },
  { key: "handyman",     label: "Handyman",       tagline: "Fix anything",        Icon: Wrench,      to: "/order/handyman",     color: "text-blue-500" },
  { key: "auto",         label: "Mechanic",       tagline: "Mobile repair",       Icon: Car,         to: "/order/auto",         color: "text-red-500" },
  { key: "pet_care",     label: "Pet care",       tagline: "Walks + boards",      Icon: PawPrint,    to: "/order/pet_care",     color: "text-amber-600" },
  { key: "digital_tech", label: "Tech help",      tagline: "In-person or remote", Icon: Laptop,      to: "/order/digital_tech", color: "text-violet-500" },
  { key: "events",       label: "Events",         tagline: "Staff + catering",    Icon: Camera,      to: "/order/events",       color: "text-pink-500" },
];

const HOW_IT_WORKS = [
  { n: "01", t: "Tell us what you need", b: "Pick a category, describe the job, drop in reference photos or a short video if it helps." },
  { n: "02", t: "Meet your pro",         b: "Nearby providers respond in minutes. Compare profiles, ratings and prices, then pick the one you want." },
  { n: "03", t: "Track it live",         b: "Watch your pro on the map from arrival to done. Message, tip, and rate — all in the app." },
];

const TRUST_STATS = [
  { Icon: Wallet,       n: "10%",   l: "Flat platform fee" },
  { Icon: Clock,        n: "<24h",  l: "Payout to providers" },
  { Icon: ShieldCheck,  n: "100%",  l: "Escrow protected" },
  { Icon: Star,         n: "4.9",   l: "Avg. rating" },
];

export default function Landing() {
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const nav = useNavigate();

  const submit = (e) => {
    e?.preventDefault?.();
    const query = q.trim();
    nav(query ? `/services?q=${encodeURIComponent(query)}` : "/services");
  };

  return (
    <div className="bg-white" data-testid="page-landing">
      <Helmet>
        <title>Lumo — Real help. Real people. Right now.</title>
        <meta name="description" content="Lumo is the on-demand marketplace for real-world help. Delivery, cleaning, moving, mechanics, tutors, pet care and 30+ more services from vetted local pros. Providers keep 90%." />
      </Helmet>

      {/* ═════════════ HERO + SERVICES (unified) ══════════════════════ */}
      <section className="relative overflow-hidden bg-white" data-testid="landing-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-16 sm:pt-20 lg:pt-24 pb-4 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="overline mb-4" data-testid="hero-overline">On-demand marketplace</div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-black leading-[1.02] tracking-tight">
              Real help. Real people. <span className="text-neutral-500">Right now.</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-neutral-600 leading-relaxed max-w-xl">
              Tap once for delivery, cleaning, moving, a mechanic, a tutor, a pet sitter — 30+ services from vetted local pros. Match in minutes, track them live.
            </p>

            {/* Search / picker card */}
            <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-2xl" data-testid="hero-search-form">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="What do you need help with?"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-black focus:bg-white focus:ring-2 focus:ring-black rounded-full pl-12 pr-4 h-14 text-base text-black placeholder:text-neutral-500 transition-all outline-none"
                  data-testid="hero-search-input"
                />
              </div>
              <button type="submit" className="btn-lumo btn-lumo-primary btn-lumo-lg" data-testid="hero-search-submit">
                Find help <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Right — photograph with vignette */}
          <div className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden hero-vignette hidden lg:block" data-testid="hero-image">
            <img
              src="https://images.unsplash.com/photo-1607130232670-52123ba5be5c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHw0fHxtb2Rlcm4lMjBjaXR5JTIwdXJiYW4lMjBzdHJlZXQlMjBkcml2ZXIlMjBzZXJ2aWNlJTIwY291cmllciUyMHRlY2huaWNpYW4lMjB0YXNrJTIwZGVsaXZlcnl8ZW58MHx8fHwxNzg4ODY1NzIzfDA&ixlib=rb-4.1.0&q=85&w=1200"
              alt="Local Lumo courier arriving at customer"
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute bottom-6 left-6 right-6 text-white z-10">
              <div className="overline text-white/70 mb-2">Live in your city</div>
              <div className="font-display text-2xl font-semibold leading-tight">Providers arrive in minutes, not days.</div>
            </div>
          </div>
        </div>

        {/* Service tiles — same section, no visual break */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pb-16 sm:pb-24" data-testid="landing-services">
          <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
            <div className="overline">Or jump straight in</div>
            <Link to="/services" className="btn-lumo btn-lumo-ghost" data-testid="services-all">
              All services <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4" data-testid="services-grid">
            {SERVICES.map((s) => {
              const Icon = s.Icon;
              return (
                <Link
                  key={s.key}
                  to={s.to}
                  className="group card-lumo card-lumo-hoverable flex flex-col justify-between h-full"
                  data-testid={`service-tile-${s.key}`}
                >
                  <div className="w-11 h-11 rounded-full bg-neutral-100 flex items-center justify-center group-hover:bg-black transition-colors">
                    <Icon className={`w-5 h-5 ${s.color || "text-black"} group-hover:text-white transition-colors`} strokeWidth={2.25} />
                  </div>
                  <div className="mt-8">
                    <div className="font-display font-semibold text-lg text-black leading-tight">{s.label}</div>
                    <div className="overline text-[10px] mt-1">{s.tagline}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═════════════ HOW IT WORKS ═════════════════════════════════════ */}
      <section className="border-t border-neutral-200 bg-neutral-50" data-testid="landing-how-it-works">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24">
          <div className="overline mb-3">How it works</div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-black leading-tight tracking-tight max-w-2xl">Three taps. No back-and-forth.</h2>
          <div className="mt-12 grid md:grid-cols-3 gap-6 sm:gap-8">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.n} className="card-lumo bg-white" data-testid={`how-step-${s.n}`}>
                <div className="font-mono text-[#276EF1] text-sm font-semibold tracking-widest">{s.n}</div>
                <h3 className="mt-3 font-display font-semibold text-xl text-black leading-tight">{s.t}</h3>
                <p className="mt-3 text-neutral-600 text-[15px] leading-relaxed">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ TRUST STATS BAR ══════════════════════════════════ */}
      <section className="border-t border-neutral-200 bg-black text-white" data-testid="landing-trust">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-14 grid grid-cols-2 md:grid-cols-4 gap-6">
          {TRUST_STATS.map((s, i) => (
            <div key={i} className="flex flex-col" data-testid={`trust-stat-${i}`}>
              <s.Icon className="w-5 h-5 text-white/60 mb-3" strokeWidth={2} />
              <div className="font-display text-3xl sm:text-4xl font-bold leading-none">{s.n}</div>
              <div className="overline text-white/50 mt-2">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════ FEATURED SHOP ═══════════════════════════════════ */}
      <FeaturedShopWidget />

      {/* ═════════════ SPONSORED (Google AdSense) ══════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <AdSense testid="adsense-landing" />
      </div>

      {/* ═════════════ MARKETPLACE TEASER ══════════════════════════════ */}
      <section className="border-t border-neutral-200 bg-white" data-testid="landing-marketplace">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="overline mb-3">Community Market</div>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-black leading-tight tracking-tight">Sell what you don&apos;t need. Find what you do.</h2>
            <p className="mt-5 text-lg text-neutral-600 leading-relaxed max-w-xl">
              Neighbor-to-neighbor resale — no fees for buyers, 5% for sellers when your item sells. Locally sortable, escrow-protected, live-tracked handoff via Lumo delivery.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/marketplace" className="btn-lumo btn-lumo-primary" data-testid="marketplace-browse">
                Browse marketplace <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/marketplace/new" className="btn-lumo btn-lumo-outline" data-testid="marketplace-sell">
                Sell an item
              </Link>
            </div>
          </div>
          <div className="relative aspect-square lg:aspect-[4/5] w-full rounded-2xl overflow-hidden" data-testid="marketplace-image">
            <img
              src="https://images.unsplash.com/photo-1604605801370-3396f9bd9cf0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBjaXR5JTIwdXJiYW4lMjBzdHJlZXQlMjBkcml2ZXIlMjBzZXJ2aWNlJTIwY291cmllciUyMHRlY2huaWNpYW4lMjB0YXNrJTIwZGVsaXZlcnl8ZW58MHx8fHwxNzg4ODY1NzIzfDA&ixlib=rb-4.1.0&q=85&w=1200"
              alt="Neighbor handing off a package"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* ═════════════ PROVIDER RECRUITMENT BANNER ═════════════════════ */}
      <section className="bg-black text-white border-t border-black" data-testid="landing-provider-cta">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="overline text-[#276EF1] mb-3">Earn on Lumo</div>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">Keep 90%.<br/>Get paid in 24 hours.</h2>
            <p className="mt-5 text-lg text-white/80 leading-relaxed max-w-xl">
              We take 10% flat. No lead fees, no boost fees, no monthly minimum. Same-day payouts via Stripe. Pick the jobs you want; skip the ones you don&apos;t.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={user ? "/provider" : "/register?role=provider"} className="btn-lumo btn-lumo-lg bg-white text-black hover:bg-neutral-100" data-testid="provider-signup">
                Start earning today <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/join" className="btn-lumo btn-lumo-lg bg-transparent border-white/40 text-white hover:bg-white/10 border" data-testid="provider-city-picker">
                Pick your city
              </Link>
              <Link to="/for-providers" className="btn-lumo btn-lumo-lg bg-transparent border-white/40 text-white hover:bg-white/10 border" data-testid="provider-learn">
                How it works
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" data-testid="provider-benefits">
            {[
              { Icon: DollarSign,  t: "10% flat fee",     b: "Half of TaskRabbit's cut" },
              { Icon: Clock,       t: "24h payouts",      b: "Stripe Connect same-day" },
              { Icon: ShieldCheck, t: "Escrow protected", b: "Money already secured" },
              { Icon: Zap,         t: "No lead fees",     b: "Only pay when you earn" },
            ].map((h, i) => (
              <div key={i} className="p-5 border border-white/20 rounded-xl bg-white/5 backdrop-blur">
                <h.Icon className="w-4 h-4 text-[#276EF1]" strokeWidth={2} />
                <div className="mt-3 overline text-white/60">{h.t}</div>
                <div className="mt-1 text-white text-[15px] font-medium">{h.b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
