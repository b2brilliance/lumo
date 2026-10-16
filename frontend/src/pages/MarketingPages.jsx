import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import {
  ArrowRight, Wallet, Clock, Calendar, MapPin, ShieldCheck,
  Sparkles, Users, Zap, Star, Search, DollarSign, Award, Building2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RECRUITING_CITIES,
  PROVIDER_HOOKS,
  RECRUITING_CATEGORIES,
} from "@/lib/marketing";
import AffiliateBlock from "@/components/AffiliateBlock";
import ProviderExplainer from "@/components/ProviderExplainer";

const HOOK_ICONS = { wallet: Wallet, clock: Clock, calendar: Calendar, "map-pin": MapPin };

// ── Shared building blocks ─────────────────────────────────────────────
function Seo({ title, description, canonical, jsonLd }) {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {canonical && <link rel="canonical" href={canonical} />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}

function Hero({ eyebrow, title, subtitle, ctaHref, ctaLabel, secondaryHref, secondaryLabel }) {
  return (
    <section className="relative border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
        {eyebrow && (
          <div className="overline text-teal-700 mb-4" data-testid="hero-eyebrow">{eyebrow}</div>
        )}
        <h1 className="font-display font-black tracking-tighter text-4xl sm:text-5xl lg:text-6xl text-slate-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-600 leading-relaxed">
            {subtitle}
          </p>
        )}
        {(ctaHref || secondaryHref) && (
          <div className="mt-8 flex flex-wrap gap-3">
            {ctaHref && (
              <Link to={ctaHref} data-testid="hero-cta-primary">
                <Button className="rounded-none bg-slate-900 hover:bg-slate-800 text-white h-12 px-6 text-sm font-mono uppercase tracking-wider">
                  {ctaLabel} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            )}
            {secondaryHref && (
              <Link to={secondaryHref} data-testid="hero-cta-secondary">
                <Button variant="outline" className="rounded-none border-slate-900 h-12 px-6 text-sm font-mono uppercase tracking-wider">
                  {secondaryLabel}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function HooksGrid() {
  return (
    <section className="border-b border-slate-200 bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-16 grid gap-6 sm:grid-cols-2">
        {PROVIDER_HOOKS.map((h) => {
          const Icon = HOOK_ICONS[h.icon] || Sparkles;
          return (
            <div
              key={h.id}
              className="bg-white border border-slate-200 p-6"
              data-testid={`hook-${h.id}`}
            >
              <Icon className="w-6 h-6 text-teal-700" />
              <h3 className="mt-4 font-display font-bold text-xl text-slate-900">{h.title}</h3>
              <p className="mt-1 text-sm font-mono uppercase tracking-wider text-slate-500">{h.subtitle}</p>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">{h.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ApplyForm({ prefill = {}, dense = false }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", city: prefill.city || "",
    service: prefill.service || "", experience_years: "", hours_per_week: "",
    hook: prefill.hook || "", message: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || (!form.email && !form.phone)) {
      toast.error("Add your name plus an email or phone.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/recruits", {
        ...form,
        experience_years: form.experience_years ? parseInt(form.experience_years, 10) : null,
        hours_per_week: form.hours_per_week ? parseInt(form.hours_per_week, 10) : null,
        source_url: typeof window !== "undefined" ? window.location.href : null,
        referrer: typeof document !== "undefined" ? document.referrer : null,
      });
      setDone(true);
      toast.success("Application received. Someone will reach out shortly.");
    } catch (err) {
      toast.error(err?.response?.data?.detail?.message || "Could not submit — try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bg-teal-50 border border-teal-200 p-6" data-testid="apply-form-thanks">
        <div className="overline text-teal-700">Application received</div>
        <h3 className="mt-2 font-display font-bold text-2xl text-slate-900">Thanks — we&apos;ll be in touch.</h3>
        <p className="mt-2 text-sm text-slate-600">
          A Lumo team member will reach out within 24 hours. In the meantime,
          you can create your provider account and start browsing local jobs.
        </p>
        <Link to="/register?role=provider" className="mt-4 inline-block">
          <Button className="rounded-none bg-slate-900 text-white h-11 px-5 text-sm font-mono uppercase tracking-wider" data-testid="apply-form-register-cta">
            Create provider account
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`bg-white border border-slate-200 ${dense ? "p-4" : "p-6"}`} data-testid="apply-form">
      <div className={`grid gap-4 ${dense ? "" : "sm:grid-cols-2"}`}>
        <div>
          <label className="overline">Name *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="apply-name" />
        </div>
        <div>
          <label className="overline">Email</label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="apply-email" />
        </div>
        <div>
          <label className="overline">Phone</label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="apply-phone" />
        </div>
        <div>
          <label className="overline">City</label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="apply-city" placeholder="Which city do you work in?" />
        </div>
        <div>
          <label className="overline">Service you offer</label>
          <Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} data-testid="apply-service" placeholder="e.g. cleaning, roadside, moving" />
        </div>
        <div>
          <label className="overline">Years of experience</label>
          <Input type="number" min="0" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} data-testid="apply-experience" />
        </div>
        <div className="sm:col-span-2">
          <label className="overline">Anything you want the team to know?</label>
          <textarea
            className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm min-h-[80px]"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            data-testid="apply-message"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-none bg-slate-900 hover:bg-slate-800 text-white h-12 text-sm font-mono uppercase tracking-wider"
        data-testid="apply-submit"
      >
        {busy ? "Sending…" : "Submit application"}
      </Button>
      <p className="mt-3 text-xs text-slate-500">
        By submitting, you agree to be contacted by Lumo about becoming a service provider. No spam.
      </p>
    </form>
  );
}

function CityList({ pathPrefix = "/providers", title = "Available in these cities" }) {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="font-display font-black text-3xl text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500 font-mono uppercase tracking-wider">
          {RECRUITING_CITIES.length}+ cities and growing
        </p>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
          {RECRUITING_CITIES.map((c) => (
            <Link
              key={c.slug}
              to={`${pathPrefix}/${c.slug}`}
              className="border border-slate-200 px-3 py-2 hover:border-slate-900 hover:bg-slate-50"
              data-testid={`city-link-${c.slug}`}
            >
              <span className="font-mono uppercase tracking-wider text-slate-400 mr-1">{c.country}</span>
              <span className="text-slate-900">{c.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** FinalCTA — the informational-marketing-page closer.
 * All marketing pages end with this so readers who've absorbed the info
 * can tap straight through to the actual tool. */
function FinalCTA({
  title = "Ready to try Lumo?",
  subtitle = "One tap to post a request, or sign up as a provider and start earning this week.",
  primaryHref = "/services",
  primaryLabel = "Browse services",
  secondaryHref = "/register?role=provider",
  secondaryLabel = "Become a provider",
  tone = "dark",
}) {
  const bg = tone === "dark" ? "bg-slate-900 text-white" : "bg-teal-50 text-slate-900 border-y border-teal-100";
  const primaryBtn =
    tone === "dark"
      ? "bg-white text-slate-900 hover:bg-amber-300"
      : "bg-slate-900 text-white hover:bg-slate-800";
  const secondaryBtn =
    tone === "dark"
      ? "border border-white/40 text-white hover:bg-white/10"
      : "border border-slate-900 text-slate-900 hover:bg-white";
  return (
    <section className={bg} data-testid="marketing-final-cta">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20 text-center">
        <div className="overline mb-3 opacity-80">Next step</div>
        <h2 className="font-display font-black text-3xl sm:text-5xl tracking-tighter">{title}</h2>
        <p className={`mt-4 text-base sm:text-lg max-w-2xl mx-auto ${tone === "dark" ? "text-slate-300" : "text-slate-600"}`}>
          {subtitle}
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to={primaryHref} data-testid="marketing-final-cta-primary">
            <Button className={`rounded-none h-12 px-6 text-sm font-mono uppercase tracking-wider ${primaryBtn}`}>
              {primaryLabel} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link to={secondaryHref} data-testid="marketing-final-cta-secondary">
            <Button variant="outline" className={`rounded-none h-12 px-6 text-sm font-mono uppercase tracking-wider ${secondaryBtn}`}>
              {secondaryLabel}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Public pages ──────────────────────────────────────────────────────

export function HowItWorks() {
  return (
    <div data-testid="page-how-it-works">
      <Seo
        title="How Lumo works — jobs, delivery, rentals, and services in one app"
        description="Lumo connects customers with local providers in minutes. See how ordering, escrow payments, and same-day payouts work."
        canonical="https://golumo.app/how-it-works"
      />
      <Hero
        eyebrow="How Lumo works"
        title="Post a job. Get bids in minutes. Pay when it's done."
        subtitle="Lumo is an Uber-style, chronological, distance-based marketplace for every service you need — from moving a couch to fixing a leak to walking your dog. Customers pay a small deposit to lock in a provider; the rest releases to the provider the moment the work is confirmed done."
      />
      <section className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-16 grid gap-8 sm:grid-cols-3">
          {[
            { n: "01", t: "Post your request", b: "Tell us what you need. Auto-quote calculators price ~30 common services instantly; the rest go out for bids from nearby specialists." },
            { n: "02", t: "Providers show up", b: "GPS matches you with providers within your radius. Compare ratings, past photos, and quoted prices. Accept the one you like." },
            { n: "03", t: "Track & pay", b: "Live Uber-style tracker follows your provider en route. Pay the 10% deposit up front to lock the booking; the balance releases only after you confirm the work." },
          ].map((s) => (
            <div key={s.n}>
              <div className="font-mono text-teal-700 text-2xl font-bold">{s.n}</div>
              <h3 className="mt-2 font-display font-bold text-xl">{s.t}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="overline text-teal-700 mb-3">The details</div>
          <h2 className="font-display font-black text-3xl">Why every step of Lumo is built to protect both sides.</h2>
          <div className="mt-8 space-y-6 text-slate-700 leading-relaxed">
            <p><strong className="text-slate-900">Chronological + distance-based feed.</strong> Providers see the newest requests inside their radius first. No pay-to-play, no priority bumps for advertisers — everyone sees the same feed, in the same order.</p>
            <p><strong className="text-slate-900">Escrow-backed payments.</strong> When a provider accepts your job, your 10% deposit is held in Stripe escrow. Neither side sees the money until the work is confirmed done. Disputes get manual review by a Lumo operator.</p>
            <p><strong className="text-slate-900">Live GPS tracker.</strong> Every accepted job opens a live map view showing the provider's ETA, current position, and one-tap chat. It's the same tech Uber uses — because when you're waiting on someone at your front door, you deserve to see them coming.</p>
            <p><strong className="text-slate-900">Same-day payouts via Stripe Connect.</strong> Providers who complete the Stripe onboarding get funds released to their bank within 24 hours of the customer marking a job complete.</p>
          </div>
        </div>
      </section>
      <HooksGrid />
      <CityList />
      <AffiliateBlock category="global" title="While you're here — partner services you might like" subtitle="Cashback, banking, insurance and other tools our providers use. Lumo earns a small commission when you sign up — no extra cost to you." />
      <FinalCTA
        title="Ready to try Lumo?"
        subtitle="Post a service request in under a minute, or sign up as a provider and start earning this week."
        primaryHref="/services"
        primaryLabel="Browse services"
        secondaryHref="/register?role=provider"
        secondaryLabel="Become a provider"
      />
    </div>
  );
}

export function ForProviders() {
  return (
    <div data-testid="page-for-providers">
      <Seo
        title="Become a Lumo provider — keep 90%, get paid in 24 hours"
        description="Join Lumo and earn on your terms. Keep 90% of every job (half of what TaskRabbit takes), same-day payouts via Stripe, GPS-based job matching. No quotas, no fees."
        canonical="https://golumo.app/for-providers"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Independent service provider on Lumo",
          "description": "Set your own hours. Keep 90% of every job. Same-day payouts.",
          "employmentType": "CONTRACTOR",
          "hiringOrganization": { "@type": "Organization", "name": "Lumo", "sameAs": "https://golumo.app" },
        }}
      />
      <Hero
        eyebrow="For service providers"
        title="Earn on your terms. Keep 90% of every dollar."
        subtitle="Lumo takes 10%. That's it. No lead fees, no boost fees, no monthly minimums. Payouts hit your bank in under 24 hours. Pick the jobs you want; skip the ones you don't. No 1099 quotas — do one job a month or a hundred."
      />
      <ProviderExplainer />
      <HooksGrid />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <h2 className="font-display font-black text-3xl">The math: Lumo vs. everyone else</h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-slate-50 text-left font-mono uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3 border-b border-slate-200">Platform</th>
                  <th className="p-3 border-b border-slate-200">Take from provider</th>
                  <th className="p-3 border-b border-slate-200">Lead fees</th>
                  <th className="p-3 border-b border-slate-200">Payout speed</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Lumo", "10%", "None", "Same-day"],
                  ["TaskRabbit", "~25–30%", "None", "1–2 days"],
                  ["Thumbtack", "0%*", "$8–$60 per lead", "3–5 days"],
                  ["Uber / Uber Eats", "~25–30%", "None", "Weekly"],
                  ["Instacart", "~20%", "None", "Weekly"],
                ].map(([p, take, leads, speed]) => (
                  <tr key={p} className={p === "Lumo" ? "bg-teal-50" : ""}>
                    <td className="p-3 border-b border-slate-100 font-bold">{p}</td>
                    <td className="p-3 border-b border-slate-100">{take}</td>
                    <td className="p-3 border-b border-slate-100">{leads}</td>
                    <td className="p-3 border-b border-slate-100">{speed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">
              *Thumbtack charges providers PER LEAD whether they win the job or not — often more expensive than a percentage cut.
            </p>
          </div>
        </div>
      </section>
      <section className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="font-display font-black text-3xl">Start today</h2>
          <p className="mt-3 text-sm text-slate-600">Takes about 3 minutes. We&apos;ll follow up within 24 hours.</p>
          <div className="mt-6">
            <ApplyForm />
          </div>
        </div>
      </section>
      <CityList />
      <AffiliateBlock category="provider" title="Get paid earlier — partner banks & tools" subtitle="Earn referral bonuses while getting better banking, tax, and gig-worker perks." />
      <FinalCTA
        title="Earning on Lumo starts today."
        subtitle="Create your provider account, or fill in the application above — either path gets you approved in under 24 hours."
        primaryHref="/register?role=provider"
        primaryLabel="Create provider account"
        secondaryHref="/how-it-works"
        secondaryLabel="How Lumo works"
      />
    </div>
  );
}

export function ForCustomers() {
  return (
    <div data-testid="page-for-customers">
      <Seo
        title="Book local providers on Lumo — cleaning, moving, roadside, delivery, and more"
        description="Get instant quotes from vetted local providers. Pay a 10% deposit to lock the booking; the rest releases only when you confirm the work is done. Live GPS tracker included."
        canonical="https://golumo.app/for-customers"
      />
      <Hero
        eyebrow="For customers"
        title="One app for every service you need."
        subtitle="Delivery, cleaning, moving, roadside, mechanics, notaries, pet care, tutoring — the same experience for everything. Instant auto-quotes on common services. Escrow protection built in. Live GPS tracking on every accepted booking."
      />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-16 grid gap-6 sm:grid-cols-2">
          {[
            { Icon: Zap, t: "Instant auto-quotes", b: "Cleaning, moving, delivery, roadside, and 25+ other services get a real price the moment you fill in the form. No back-and-forth." },
            { Icon: ShieldCheck, t: "Escrow protection", b: "Your 10% deposit locks in the provider. The remaining 90% releases only after you confirm the work is done. Simple, fair, safe." },
            { Icon: MapPin, t: "Live GPS tracker", b: "Uber-style live tracking on every accepted job. Watch your provider en route with real-time ETA and one-tap chat." },
            { Icon: Star, t: "Ratings that matter", b: "Every provider is rated after every job. Photos, timestamps, and receipts baked into every review so you know what you\u2019re getting." },
          ].map((f, i) => (
            <div key={i} className="border border-slate-200 p-6">
              <f.Icon className="w-6 h-6 text-teal-700" />
              <h3 className="mt-3 font-display font-bold text-xl">{f.t}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.b}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="overline text-teal-700 mb-3">What you can book</div>
          <h2 className="font-display font-black text-3xl">28+ services, one flow, one app.</h2>
          <p className="mt-4 text-slate-700 leading-relaxed">
            Lumo is not a niche marketplace. You can hire a mover, book a locksmith, order same-day delivery, get a mechanic to your driveway, book a tutor, hire a notary, list an item for sale, or rent out a room — all inside the same app, with the same escrow, the same rating system, and the same GPS-based matching.
          </p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {["Cleaning", "Moving", "Delivery", "Roadside", "Handyman", "Auto detail", "Notary", "Pet care", "Tutoring", "IT support", "Landscaping", "Photography"].map((s) => (
              <div key={s} className="border border-slate-200 bg-white px-3 py-2 text-slate-800 font-medium">{s}</div>
            ))}
          </div>
        </div>
      </section>
      <CityList pathPrefix="/cities" title="Now live in these cities" />
      <AffiliateBlock category="customer" title="Stretch your dollar — partner cards & cashback" subtitle="Credit cards, cashback portals, and services our users love." />
      <FinalCTA
        title="Book your first service today."
        subtitle="Instant quotes, escrow-backed payment, live tracker included."
        primaryHref="/services"
        primaryLabel="Browse services"
        secondaryHref="/how-it-works"
        secondaryLabel="How it works"
      />
    </div>
  );
}

export function Apply() {
  return (
    <div data-testid="page-apply">
      <Seo
        title="Apply to be a Lumo provider — start earning this week"
        description="Fill out a 3-minute application. Cleaners, movers, delivery drivers, mechanics, roadside techs, and more. Keep 90%, same-day payouts."
        canonical="https://golumo.app/apply"
      />
      <Hero
        eyebrow="Provider application"
        title="Let's get you earning."
        subtitle="A Lumo team member will reach out within 24 hours to walk you through onboarding, background check, and Stripe setup. No fee to sign up or stay active."
      />
      <section>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <ApplyForm />
        </div>
      </section>
    </div>
  );
}

export function ProviderCity() {
  const { city } = useParams();
  const cityData = RECRUITING_CITIES.find((c) => c.slug === city);
  const displayName = cityData?.name || "your city";
  const country = cityData?.country || "";
  return (
    <div data-testid="page-provider-city">
      <Seo
        title={`Service jobs in ${displayName} — become a Lumo provider${country ? ` (${country})` : ""}`}
        description={`Earn as a service provider in ${displayName}. Keep 90% of every job, get paid in 24 hours, choose your own hours. Cleaners, movers, roadside, delivery, mechanics.`}
        canonical={`https://golumo.app/providers/${city}`}
      />
      <Hero
        eyebrow={`Providers in ${displayName}`}
        title={`Earn as a Lumo provider in ${displayName}.`}
        subtitle={`Real customers, real jobs, real payouts in ${displayName}. Keep 90% of every dollar you earn. Same-day cash-out. No lead fees, no minimums, no quotas.`}
        ctaHref={`/apply?city=${encodeURIComponent(displayName)}`}
        ctaLabel="Apply now"
        secondaryHref="/for-providers"
        secondaryLabel="Why Lumo"
      />
      <HooksGrid />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <h2 className="font-display font-black text-3xl">Highest-demand services in {displayName}</h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
            {RECRUITING_CATEGORIES.slice(0, 12).map((c) => (
              <Link
                key={c.slug}
                to={`/careers/${c.slug}`}
                className="border border-slate-200 p-3 hover:border-slate-900 hover:bg-slate-50"
                data-testid={`city-service-${c.slug}`}
              >
                <div className="font-bold text-slate-900">{c.label}</div>
                <div className="text-xs text-slate-500 font-mono">{c.rate}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="font-display font-black text-3xl">Apply — {displayName}</h2>
          <div className="mt-6">
            <ApplyForm prefill={{ city: displayName }} />
          </div>
        </div>
      </section>
      <FinalCTA
        title={`Start earning in ${displayName} this week.`}
        subtitle="Sign up as a provider or submit the application above — approval takes under 24 hours."
        primaryHref="/register?role=provider"
        primaryLabel="Create provider account"
        secondaryHref="/for-providers"
        secondaryLabel="Why Lumo"
      />
    </div>
  );
}

export function CareersCategory() {
  const { category } = useParams();
  const cat = RECRUITING_CATEGORIES.find((c) => c.slug === category);
  if (!cat) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-display font-black text-3xl">Category not found</h1>
        <Link to="/for-providers" className="mt-4 inline-block text-teal-700 underline">See all provider roles</Link>
      </div>
    );
  }
  return (
    <div data-testid="page-careers-category">
      <Seo
        title={`${cat.label} jobs near you — apply on Lumo (${cat.rate})`}
        description={`Find ${cat.label.toLowerCase()} jobs near you on Lumo. Set your own hours. Keep 90% of every job. Same-day payouts. Typical rate: ${cat.rate}.`}
        canonical={`https://golumo.app/careers/${cat.slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": `${cat.label} — independent contractor`,
          "description": `${cat.label} contractor position on the Lumo marketplace. Typical earnings ${cat.rate}. Choose your own hours and jobs.`,
          "employmentType": "CONTRACTOR",
          "baseSalary": { "@type": "MonetaryAmount", "currency": "USD", "value": cat.rate },
          "hiringOrganization": { "@type": "Organization", "name": "Lumo", "sameAs": "https://golumo.app" },
        }}
      />
      <Hero
        eyebrow={`${cat.label} jobs`}
        title={`${cat.label} jobs, on your terms.`}
        subtitle={`Typical earnings: ${cat.rate}. Set your own hours, pick your own jobs. Keep 90% of every dollar you earn. Same-day payouts via Stripe.`}
        ctaHref={`/apply?service=${cat.slug}&hook=career_${cat.slug}`}
        ctaLabel="Apply now"
        secondaryHref="/for-providers"
        secondaryLabel="Why Lumo"
      />
      <HooksGrid />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <h2 className="font-display font-black text-3xl">Where {cat.label.toLowerCase()}s are earning on Lumo</h2>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
            {RECRUITING_CITIES.slice(0, 20).map((c) => (
              <Link
                key={c.slug}
                to={`/providers/${c.slug}`}
                className="border border-slate-200 px-3 py-2 hover:border-slate-900 hover:bg-slate-50"
                data-testid={`career-city-${c.slug}`}
              >
                <span className="font-mono uppercase tracking-wider text-slate-400 mr-1">{c.country}</span>
                <span className="text-slate-900">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="font-display font-black text-3xl">Apply — {cat.label}</h2>
          <div className="mt-6">
            <ApplyForm prefill={{ service: cat.service, hook: `career_${cat.slug}` }} />
          </div>
        </div>
      </section>
      <FinalCTA
        title={`Ready to start doing ${cat.label.toLowerCase()} work?`}
        subtitle={`Create a provider account and pick ${cat.label.toLowerCase()} jobs the moment they come in. Same-day payouts, 90% of every dollar.`}
        primaryHref={`/register?role=provider&service=${cat.slug}`}
        primaryLabel="Create provider account"
        secondaryHref="/for-providers"
        secondaryLabel="Why Lumo"
      />
    </div>
  );
}

export function About() {
  return (
    <div data-testid="page-about">
      <Seo
        title="About Lumo — the Uber-style marketplace for every service"
        description="Lumo is a chronological, distance-based, mobile-first marketplace for local jobs, delivery, rentals, and everything in between. Low flat fee, same-day payouts, escrow-protected."
        canonical="https://golumo.app/about"
      />
      <Hero
        eyebrow="Our story"
        title="Every service, one app. Half the fees."
        subtitle="Lumo was built to fix the two biggest problems with gig-work marketplaces: providers keep too little, and customers wait too long. We charge 10% flat (half of TaskRabbit), match customers to providers by GPS in seconds, and settle payouts same-day via Stripe."
      />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-16 space-y-6 text-slate-700 leading-relaxed">
          <p>
            Lumo works like Uber for everything — from moving a couch to walking a dog to fixing a leaky pipe. Customers post what they need; nearby providers surface based on GPS distance and rating. Auto-quote calculators handle the pricing for ~30 common categories; everything else goes out to competitive bids.
          </p>
          <p>
            Every payment runs through escrow: a 10% deposit locks in the provider, and the remaining 90% releases only after the customer confirms the work is done. Providers get paid same-day via Stripe Connect. There are no lead fees, no boost fees, and no monthly minimums.
          </p>
          <p>
            We&apos;re live in 50+ cities across the US, Canada, UK, Europe, and Asia-Pacific — and growing every week. Interested in bringing Lumo to your city or category?{" "}
            <Link to="/apply" className="text-teal-700 underline">Get in touch.</Link>
          </p>
        </div>
      </section>
      <FinalCTA
        title="Join the marketplace built for both sides."
        subtitle="Post a request as a customer, or earn as a provider — either way, you keep more of every dollar."
        primaryHref="/services"
        primaryLabel="Book a service"
        secondaryHref="/register?role=provider"
        secondaryLabel="Become a provider"
      />
    </div>
  );
}

export function Press() {
  return (
    <div data-testid="page-press">
      <Seo
        title="Lumo press kit — logos, brand guidelines, and story"
        description="Media resources for Lumo — the Uber-style, distance-based marketplace for services, delivery, and rentals."
        canonical="https://golumo.app/press"
      />
      <Hero
        eyebrow="Press & media"
        title="Press kit"
        subtitle="For interviews, partnerships, or story inquiries, reach us at press@golumo.app. Below are our brand assets and quick facts."
      />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-16 grid gap-8 sm:grid-cols-2">
          {[
            { Icon: DollarSign, t: "Take rate", b: "10% flat — half of TaskRabbit / Instacart / Uber Eats." },
            { Icon: Clock, t: "Payout speed", b: "Same-day via Stripe Connect (Instant Payouts on eligible accounts)." },
            { Icon: Building2, t: "Coverage", b: `${RECRUITING_CITIES.length}+ cities across US, Canada, UK, Europe, and Asia-Pacific.` },
            { Icon: Users, t: "Categories", b: "28+ verticals — delivery, cleaning, moving, roadside, mechanics, notaries, pet care, tutoring, beauty, more." },
            { Icon: Award, t: "Founded", b: "2025. Product-first, no venture capital, no dark patterns." },
            { Icon: Search, t: "Contact", b: "press@golumo.app · hello@golumo.app" },
          ].map((f, i) => (
            <div key={i} className="border border-slate-200 p-6">
              <f.Icon className="w-6 h-6 text-teal-700" />
              <h3 className="mt-3 font-display font-bold text-xl">{f.t}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.b}</p>
            </div>
          ))}
        </div>
      </section>
      <FinalCTA
        title="Building a story on Lumo?"
        subtitle="Email press@golumo.app or hit either button below to see the product live."
        primaryHref="/services"
        primaryLabel="See services"
        secondaryHref="/how-it-works"
        secondaryLabel="How it works"
        tone="light"
      />
    </div>
  );
}

export function ProviderCityIndex() {
  return (
    <div data-testid="page-providers-index">
      <Seo
        title="Lumo provider cities — earn as a service pro worldwide"
        description="Cities where you can earn as a Lumo provider. 50+ cities across the US, Canada, UK, Europe, Asia-Pacific, and beyond."
        canonical="https://golumo.app/providers"
      />
      <Hero
        eyebrow="Provider cities"
        title="Earn as a Lumo provider in 50+ cities."
        subtitle="Wherever you live, if Lumo is live there, you can start earning this week. Pick your city to see local demand + apply."
      />
      <CityList pathPrefix="/providers" title="All provider cities" />
      <FinalCTA
        title="Skip the city page — apply now."
        subtitle="One application, valid in every city Lumo operates in. Approval in under 24 hours."
        primaryHref="/register?role=provider"
        primaryLabel="Create provider account"
        secondaryHref="/apply"
        secondaryLabel="Apply via form"
      />
    </div>
  );
}

export function CareersIndex() {
  return (
    <div data-testid="page-careers-index">
      <Seo
        title="Service jobs on Lumo — cleaner, mover, driver, mechanic, and more"
        description="Independent contractor roles on the Lumo marketplace. Set your own hours, keep 90%, same-day payouts. See the current in-demand roles."
        canonical="https://golumo.app/careers"
      />
      <Hero
        eyebrow="Careers"
        title="Independent contractor roles on Lumo."
        subtitle="Set your own hours. Keep 90% of every job. Get paid same-day. Below are the current in-demand roles — click one to apply."
      />
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RECRUITING_CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                to={`/careers/${c.slug}`}
                className="border border-slate-200 p-4 hover:border-slate-900 hover:bg-slate-50"
                data-testid={`careers-cat-${c.slug}`}
              >
                <div className="font-display font-bold text-lg text-slate-900">{c.label}</div>
                <div className="text-sm text-slate-500 font-mono mt-1">{c.rate}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <FinalCTA
        title="Ready to pick a role?"
        subtitle="Or skip the browse and just create a provider account — you can add multiple services from the dashboard."
        primaryHref="/register?role=provider"
        primaryLabel="Create provider account"
        secondaryHref="/for-providers"
        secondaryLabel="Learn why Lumo"
      />
    </div>
  );
}
