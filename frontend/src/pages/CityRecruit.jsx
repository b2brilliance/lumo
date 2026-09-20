import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowRight, MapPin, Zap, Wallet, Clock, Users, DollarSign, Star,
  ShieldCheck, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";

/* CityRecruit — /join/:slug
 *
 * City-specific provider recruitment landing. Real photo, live progress
 * bar toward the 300-spot goal, sign-on bonus banner, and a Start CTA
 * that carries the recruit_city_slug into /register.
 */

export default function CityRecruit() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [city, setCity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/recruit/cities/${slug}`);
        if (!cancelled) setCity(data);
        api.post(`/recruit/cities/${slug}/click`).catch(() => {});
      } catch (err) {
        if (!cancelled) setError(err?.response?.status === 404 ? "not-found" : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const startSignup = () => {
    nav(`/register?role=provider&recruit_city_slug=${encodeURIComponent(slug)}`);
  };

  if (loading) return <div className="p-24 text-center text-neutral-500" data-testid="city-recruit-loading">Loading…</div>;
  if (error === "not-found") {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center" data-testid="city-recruit-not-found">
        <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-neutral-400" />
        </div>
        <h1 className="font-display text-2xl font-bold mt-4">City not on Lumo yet.</h1>
        <p className="text-sm text-neutral-500 mt-2">Try one of our active cities or check back soon.</p>
        <Link to="/for-providers" className="btn-lumo btn-lumo-primary btn-lumo-sm mt-6">See all cities</Link>
      </div>
    );
  }
  if (!city) return null;

  const pct = Number(city.progress_pct || 0);
  const bonusEligible = (city.signups_total || 0) < (city.bonus_first_n || 100);
  const displayName = `${city.city}, ${city.state_full || city.state}`;

  return (
    <div className="bg-white min-h-screen" data-testid={`page-city-recruit-${slug}`}>
      <Helmet>
        <title>{`Drive with Lumo in ${displayName} — apply in 10 minutes`}</title>
        <meta name="description" content={city.hero_subhead || `Lumo is hiring ${city.goal_workers} providers in ${displayName}. Keep 90% of every job, same-day payouts, $${city.bonus_amount} sign-on for the first ${city.bonus_first_n}.`} />
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden bg-black text-white" data-testid="city-hero">
        {city.hero_image && (
          <div className="absolute inset-0 opacity-40">
            <img src={city.hero_image} alt={displayName} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
          </div>
        )}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 py-16 sm:py-28">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-mono uppercase tracking-widest mb-6" data-testid="city-hero-tag">
            <MapPin className="w-3.5 h-3.5" /> {displayName}
          </div>
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-bold leading-[1.02] tracking-tight max-w-3xl" data-testid="city-hero-headline">
            {city.hero_headline || `Drive with Lumo in ${city.city}.`}
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-white/80 leading-relaxed max-w-2xl" data-testid="city-hero-subhead">
            {city.hero_subhead || `Lumo needs ${city.goal_workers} providers in ${displayName}. Keep 90% of every job, same-day payouts, no lead fees.`}
          </p>

          {bonusEligible && (
            <div className="mt-6 inline-flex items-center gap-3 px-4 py-3 rounded-full bg-amber-500 text-black font-semibold text-sm shadow-lg" data-testid="city-hero-bonus">
              <Zap className="w-4 h-4" />
              <span>${Number(city.bonus_amount).toFixed(0)} sign-on for the first {city.bonus_first_n} — only {Math.max(0, city.bonus_first_n - (city.signups_total || 0))} spots left</span>
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button onClick={startSignup} className="btn-lumo btn-lumo-lg bg-white text-black hover:bg-neutral-100" data-testid="city-hero-cta">
              Start my application <ArrowRight className="w-4 h-4" />
            </button>
            <Link to="/for-providers" className="btn-lumo btn-lumo-lg bg-white/0 border border-white/40 text-white hover:bg-white/10">
              How Lumo works
            </Link>
          </div>
        </div>
      </section>

      {/* Progress bar */}
      <section className="border-b border-neutral-200 bg-white" data-testid="city-progress-section">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
            <div>
              <div className="overline">Hiring in {city.city}</div>
              <div className="font-display font-bold text-3xl sm:text-4xl mt-1 text-black" data-testid="city-progress-count">
                <span className="text-black">{city.signups_total || 0}</span>
                <span className="text-neutral-400 font-mono text-2xl"> / {city.goal_workers}</span>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-mono text-neutral-500 uppercase tracking-widest text-[10px]">This week</div>
              <div className="font-display font-bold text-xl text-black">+{city.signups_last_7d || 0} new</div>
            </div>
          </div>
          <div className="h-3 rounded-full bg-neutral-100 overflow-hidden" data-testid="city-progress-bar">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-black transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-xs text-neutral-500 font-mono">
            <span>{pct}% filled</span>
            <span>{city.spots_remaining || 0} spots remaining</span>
          </div>
        </div>
      </section>

      {/* Why join */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-16" data-testid="city-benefits">
        <div className="overline mb-4">What Lumo pros get</div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-black tracking-tight max-w-2xl mb-10">
          You do the work. We handle the rest.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { Icon: Wallet, t: "Keep 90%", b: "Flat 10% platform fee. No lead fees, no monthly subscription." },
            { Icon: Clock, t: "Same-day pay", b: "Cash out with one tap the moment you finish a job." },
            { Icon: ShieldCheck, t: "Escrow protected", b: "The customer's money is secured before you're dispatched." },
            { Icon: Star, t: "Multi-service", b: "Deliveries, moving, handyman, cleaning, pet, IT — accept whatever fits." },
          ].map((h, i) => {
            const Icon = h.Icon;
            return (
              <div key={i} className="card-lumo p-6" data-testid={`city-benefit-${i}`}>
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-black" strokeWidth={2} />
                </div>
                <div className="font-display font-bold text-base mt-4">{h.t}</div>
                <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{h.b}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bonus milestone */}
      <section className="border-t border-neutral-200 bg-neutral-50" data-testid="city-milestone">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-16">
          <div className="grid sm:grid-cols-2 gap-8 items-center">
            <div>
              <div className="overline flex items-center gap-2 mb-3">
                <DollarSign className="w-3.5 h-3.5" /> Sign-on bonus
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-black tracking-tight">
                ${Number(city.bonus_amount).toFixed(0)} after your 10th job.
              </h2>
              <p className="mt-4 text-neutral-600 leading-relaxed">
                Complete 10 paid jobs on Lumo in {city.city} and we pay you a flat <b className="text-black">${Number(city.bonus_amount).toFixed(0)}</b> milestone bonus — on top of your normal earnings. Reserved for the <b>first {city.bonus_first_n}</b> providers who join in {city.city}.
              </p>
              <button onClick={startSignup} className="btn-lumo btn-lumo-primary btn-lumo-lg mt-6" data-testid="city-milestone-cta">
                Claim my spot <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="border border-neutral-200 rounded-2xl p-6 bg-white" data-testid="city-milestone-progress">
              <div className="overline text-neutral-500 mb-2">First {city.bonus_first_n} in {city.city}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-black text-5xl text-black">
                  {Math.max(0, city.bonus_first_n - (city.signups_total || 0))}
                </span>
                <span className="text-neutral-500 font-mono text-sm">bonus spots left</span>
              </div>
              <div className="mt-4 h-2 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.min(100, ((city.signups_total || 0) / (city.bonus_first_n || 1)) * 100)}%` }}
                />
              </div>
              <div className="mt-4 space-y-2 text-sm text-neutral-700">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600" /> Apply in 10 minutes</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600" /> Approved same day (usually)</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600" /> Bonus lands the moment you hit job #10</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-neutral-200 bg-black text-white" data-testid="city-cta-final">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-white/60 mb-4">
            <Users className="w-3.5 h-3.5" /> Join {city.signups_total || 0} pros already earning
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Ready to start earning in {city.city}?
          </h2>
          <button onClick={startSignup} className="btn-lumo btn-lumo-lg bg-white text-black hover:bg-neutral-100 mt-8" data-testid="city-cta-final-btn">
            Start my application <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-white/60 mt-4">10-minute application · Same-day approval · No fees to apply</p>
        </div>
      </section>
    </div>
  );
}
