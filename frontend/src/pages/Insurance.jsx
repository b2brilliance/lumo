/**
 * Curated insurance-affiliate marketplace.
 *
 * Each card links out to an affiliate partner. Categories map to the
 * insurance types Lumo providers actually need to be legally compliant
 * on the platform (General Liability, Workers Comp, Commercial Auto,
 * Bond, Cyber, Health). Tracking IDs flow through the same affiliate
 * pipeline as the rest of the site (Admin → Affiliates tab).
 */
import React from "react";
import { Link } from "react-router-dom";
import { Shield, Truck, Wrench, HardHat, Lock, Heart, ExternalLink, Home } from "lucide-react";
import PageHero from "@/components/PageHero";

const OFFERS = [
  {
    Icon: HardHat, tint: "amber", category: "General Liability",
    good_for: "Handyman · Cleaning · Landscaping · Pet care · Movers",
    partners: [
      { name: "Thimble",     from: "$16/mo",  url: "https://www.thimble.com/general-liability-insurance?ref=lumo" },
      { name: "NEXT Insurance", from: "$21/mo", url: "https://www.nextinsurance.com/general-liability/?ref=lumo" },
      { name: "Hiscox",      from: "$22/mo",  url: "https://www.hiscox.com/small-business-insurance/general-liability?ref=lumo" },
    ],
  },
  {
    Icon: Wrench, tint: "teal", category: "Workers' Compensation",
    good_for: "Anyone hiring subcontractors · Multi-crew moving · Cleaning teams",
    partners: [
      { name: "NEXT Insurance", from: "$45/mo", url: "https://www.nextinsurance.com/workers-compensation/?ref=lumo" },
      { name: "Pie Insurance",  from: "$40/mo", url: "https://pieinsurance.com/workers-comp-insurance/?ref=lumo" },
    ],
  },
  {
    Icon: Truck, tint: "red", category: "Commercial Auto",
    good_for: "Delivery · Moving · Rideshare · Roadside · Towing",
    partners: [
      { name: "Progressive Commercial", from: "$146/mo", url: "https://www.progressivecommercial.com/?ref=lumo" },
      { name: "Geico Commercial",       from: "$150/mo", url: "https://www.geico.com/commercial-auto-insurance/?ref=lumo" },
    ],
  },
  {
    Icon: Shield, tint: "indigo", category: "Surety Bond",
    good_for: "Notary · Locksmith · Contractors · Cleaning (janitorial)",
    partners: [
      { name: "NNA Notary Bonds", from: "$45/2yr", url: "https://www.nationalnotary.org/notary-supplies/notary-bonds?ref=lumo" },
      { name: "Bondmart",         from: "$100/yr", url: "https://www.bondmart.com/?ref=lumo" },
    ],
  },
  {
    Icon: Lock, tint: "slate", category: "Cyber Liability",
    good_for: "Anyone storing customer data · Notaries · IT consultants",
    partners: [
      { name: "Coalition",   from: "$50/mo", url: "https://www.coalitioninc.com/?ref=lumo" },
      { name: "At-Bay",      from: "$45/mo", url: "https://www.at-bay.com/?ref=lumo" },
    ],
  },
  {
    Icon: Heart, tint: "rose", category: "Health & Dental (Freelancer)",
    good_for: "Every provider without employer coverage",
    partners: [
      { name: "Stride Health", from: "$0 sign-up", url: "https://www.stridehealth.com/?ref=lumo" },
      { name: "Sesame Care",   from: "$25/visit",  url: "https://www.sesamecare.com/?ref=lumo" },
    ],
  },
];

const TINTS = {
  amber:  "border-amber-400 bg-amber-50 text-amber-800",
  teal:   "border-teal-400  bg-teal-50  text-teal-800",
  red:    "border-red-400   bg-red-50   text-red-800",
  indigo: "border-indigo-400 bg-indigo-50 text-indigo-800",
  slate:  "border-slate-400 bg-slate-50 text-slate-800",
  rose:   "border-rose-400  bg-rose-50  text-rose-800",
};

async function trackClick(name, url) {
  try {
    // Fire-and-forget attribution — same collector as other affiliate blocks
    await fetch("/api/affiliates/clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner: name, url, source: "insurance_page" }),
    });
  } catch { /* ignore */ }
  window.open(url, "_blank", "noopener");
}

export default function Insurance() {
  return (
    <div className="min-h-screen bg-white" data-testid="insurance-page">
      <PageHero
        title="Get legal to work — insurance built for gig pros."
        subtitle="Compare rates from the top carriers, get quoted in minutes, and start accepting jobs the same day. Lumo doesn't sell insurance — we curate independent offers so you're covered your way."
        imageQuery="business insurance shield"
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 text-xs text-slate-500 flex items-center gap-2">
          <Link to="/" className="hover:text-teal-700 flex items-center gap-1"><Home className="w-3 h-3" />Home</Link>
          <span>/</span><span className="text-slate-800 font-mono uppercase tracking-wider">Insurance</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {OFFERS.map(({ Icon, tint, category, good_for, partners }) => (
            <div
              key={category}
              className="border-2 border-slate-200 hover:border-slate-900 transition-colors bg-white p-5 flex flex-col"
              data-testid={`insurance-card-${category.toLowerCase().replace(/\s|['\/&]/g, "-")}`}
            >
              <div className={`inline-flex items-center gap-2 px-2 py-1 border ${TINTS[tint]} font-mono text-[10px] uppercase tracking-wider w-fit`}>
                <Icon className="w-3.5 h-3.5" />
                {category}
              </div>
              <h3 className="font-display text-lg font-black tracking-tight mt-3">Coverage for</h3>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{good_for}</p>
              <div className="mt-4 space-y-2 flex-1">
                {partners.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => trackClick(p.name, p.url)}
                    className="w-full text-left border border-slate-200 hover:border-teal-700 hover:bg-teal-50/40 p-3 flex items-center justify-between group"
                    data-testid={`insurance-partner-${p.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <div>
                      <div className="font-display font-bold text-sm">{p.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">from {p.from}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-teal-700" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-8 leading-relaxed max-w-3xl">
          <strong>Disclosure:</strong> Lumo earns a commission from some of these partners at no extra cost to you. We list them because they're the ones our providers actually use — not because they pay us. Rates shown are starting quotes; your final price depends on your business type, location, and prior claims.
        </p>
      </div>
    </div>
  );
}
