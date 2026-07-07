import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { DollarSign, Zap, Clock, Shield, TrendingUp, MapPin, Star, ArrowRight, CheckCircle2 } from "lucide-react";

const PROVIDER_FAQ = [
  { q: "How much does Lumo charge?", a: "Just 10%. You keep 90% of every dollar earned — half of what Uber, DoorDash, and TaskRabbit charge their workers." },
  { q: "When do I get paid?", a: "Payouts release 24 hours after the customer marks the job complete, sent directly to your bank via Stripe Connect." },
  { q: "Do I need a license?", a: "Most categories — no. Regulated work like medical, legal, and notary require a verified credential before you can accept those jobs. The rest (cleaning, moving, delivery, IT support, errands, etc.) — no license needed." },
  { q: "Can I do this part-time?", a: "Yes. Most providers on Lumo are part-time. Turn it on when you want work, turn it off when you don't." },
  { q: "What kinds of work can I do?", a: "27 categories — same-day delivery, cleaning, handyman, moving, notary, mechanic, IT support, errands, locksmith, security, tutoring, plus any of 3,000+ external salaried listings." },
];

export default function BecomeProvider() {
  return (
    <div className="bg-white">
      <Helmet>
        <title>Become a Lumo Service Provider — Earn 90% Per Job, Same-Day Pay</title>
        <meta name="description" content="Earn money locally on your schedule. Drivers, cleaners, handymen, movers, notaries, IT pros, mechanics, tutors — sign up free, keep 90% of every dollar. Same-day payouts. No license required for most categories." />
        <meta property="og:title" content="Become a Lumo Service Provider — Keep 90% of Every Job" />
        <meta property="og:description" content="Earn money locally on your schedule. Same-day payouts, no license required for most categories, half the commission of TaskRabbit or Uber." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://golumo.app/become-a-provider" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href="https://golumo.app/become-a-provider" />
        {/* Structured data — Job-board-style schema lets Google surface this in
            "jobs near you" rich results. */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Independent Service Provider — Multiple Categories",
          "description": "Take on-demand jobs in your area through Lumo. Delivery, cleaning, moving, handyman, notary, IT support, errands, security, tutoring, mechanic, locksmith, appliance repair and more. Keep 90% of every dollar earned. Same-day payouts via Stripe.",
          "datePosted": new Date().toISOString().slice(0, 10),
          "employmentType": ["CONTRACTOR", "PART_TIME", "FULL_TIME"],
          "hiringOrganization": { "@type": "Organization", "name": "Lumo", "sameAs": "https://golumo.app" },
          "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressCountry": "Worldwide" } },
          "applicantLocationRequirements": { "@type": "Country", "name": "Worldwide" },
          "jobLocationType": "TELECOMMUTE",
          "baseSalary": { "@type": "MonetaryAmount", "currency": "USD", "value": { "@type": "QuantitativeValue", "minValue": 15, "maxValue": 75, "unitText": "HOUR" } },
        })}</script>
      </Helmet>

      {/* Hero */}
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-20">
          <div className="overline">Earn on Lumo</div>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mt-3 max-w-4xl">
            Earn more. Keep more. Work on your terms.
          </h1>
          <p className="text-lg text-slate-600 mt-6 max-w-2xl leading-relaxed">
            Lumo connects you with paying customers in your area within minutes. Keep <span className="font-bold text-slate-900">90%</span> of every dollar — half the commission of Uber, DoorDash, or TaskRabbit. Same-day payouts. 27 job categories. No license required for most of them.
          </p>
          <div className="mt-8 flex items-center gap-3 flex-wrap">
            <Link to="/register?role=provider" className="inline-flex items-center gap-2 bg-teal-700 text-white px-6 py-3 font-mono uppercase tracking-wider text-sm hover:bg-teal-800" data-testid="become-provider-cta">
              Start earning — sign up free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/map" className="text-sm font-mono uppercase tracking-wider text-slate-600 hover:text-slate-900 underline">
              See jobs near me first →
            </Link>
          </div>
        </div>
      </section>

      {/* Why Lumo beats other gig platforms */}
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <div className="overline">Why Lumo</div>
          <h2 className="font-display text-4xl font-black tracking-tighter mt-2">Stop giving 30% of your work to a billion-dollar app.</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {[
              { icon: DollarSign, title: "10% flat commission", body: "Keep 90¢ of every dollar. TaskRabbit takes 15%, Uber 25%, DoorDash up to 30%. We charge 10%, period." },
              { icon: Zap, title: "Same-day payouts", body: "Money lands in your bank 24 hours after the customer marks the job complete. No 7-day holds, no minimum balances." },
              { icon: Clock, title: "Work when you want", body: "Online when you're available, invisible when you're not. No mandatory shifts, no quotas, no acceptance-rate penalties." },
              { icon: Shield, title: "Protected payments", body: "Customers pre-fund every job into Lumo's escrow. Funds release automatically — you'll never chase someone for payment." },
              { icon: TrendingUp, title: "27 job categories", body: "From same-day delivery and cleaning to notary, mechanic, IT support, security and tutoring. Stack categories, earn from multiple lanes." },
              { icon: MapPin, title: "Local jobs first", body: "GPS-based feed shows opportunities closest to you. One tap accepts the job and starts the live tracker with the customer." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="border border-slate-200 p-6">
                <Icon className="w-6 h-6 text-teal-700" />
                <h3 className="font-display text-xl font-bold mt-4">{title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <div className="overline">How it works</div>
          <h2 className="font-display text-4xl font-black tracking-tighter mt-2">Three steps. About ten minutes.</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {[
              { n: "01", title: "Sign up free", body: "Pick your categories, upload a profile photo, add a payout method. No application fees. No background check unless you choose regulated work." },
              { n: "02", title: "Accept jobs nearby", body: "Open the map. Tap any green Accept & track button. The customer is notified instantly and you're routed straight to the live tracker." },
              { n: "03", title: "Get paid", body: "Mark the job complete. Funds release within 24 hours straight to your bank via Stripe Connect. Done." },
            ].map((s) => (
              <div key={s.n} className="bg-white border border-slate-200 p-6">
                <div className="font-mono text-xs uppercase tracking-widest text-slate-400">{s.n}</div>
                <h3 className="font-display text-xl font-bold mt-2">{s.title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — Schema'd up for rich results */}
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <h2 className="font-display text-4xl font-black tracking-tighter">Common questions</h2>
          <Helmet>
            <script type="application/ld+json">{JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": PROVIDER_FAQ.map((f) => ({
                "@type": "Question",
                "name": f.q,
                "acceptedAnswer": { "@type": "Answer", "text": f.a },
              })),
            })}</script>
          </Helmet>
          <div className="mt-8 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
            {PROVIDER_FAQ.map((f) => (
              <div key={f.q} className="py-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-display text-lg font-bold">{f.q}</h3>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 text-center">
          <Star className="w-8 h-8 text-amber-400 inline-block" />
          <h2 className="font-display text-5xl md:text-6xl font-black tracking-tighter mt-4">Ready to earn locally?</h2>
          <p className="text-slate-300 mt-4 text-lg max-w-xl mx-auto">Join the thousands of providers earning on Lumo every week.</p>
          <Link to="/register?role=provider" className="inline-flex items-center gap-2 bg-white text-slate-900 px-7 py-3 font-mono uppercase tracking-wider text-sm hover:bg-amber-300 mt-8" data-testid="become-provider-cta-bottom">
            Sign up free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
