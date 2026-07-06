/**
 * Curated training / licensing affiliate marketplace.
 *
 * Same pattern as Insurance.jsx — each card links out to a partner offering
 * the certification / course that unlocks a Lumo job category. Affiliate
 * tracking IDs flow through the standard affiliate collector.
 */
import React from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Truck, Home as HomeIcon, Wrench, HeartPulse, Scale, Sparkles, ExternalLink, Home } from "lucide-react";
import PageHero from "@/components/PageHero";

const COURSES = [
  {
    Icon: Truck, tint: "red", category: "CDL & Commercial Driving",
    good_for: "Towing · Long-haul moving · Truck rental delivery",
    partners: [
      { name: "Roadmaster Drivers School", from: "$5,995",  url: "https://www.roadmaster.com/?ref=lumo" },
      { name: "160 Driving Academy",       from: "$4,995",  url: "https://160drivingacademy.com/?ref=lumo" },
    ],
  },
  {
    Icon: HomeIcon, tint: "amber", category: "Real Estate License",
    good_for: "Real estate listings · Property management · Rental host verification",
    partners: [
      { name: "The CE Shop",   from: "$139",  url: "https://www.theceshop.com/?ref=lumo" },
      { name: "Colibri Real Estate", from: "$149", url: "https://www.colibrirealestate.com/?ref=lumo" },
    ],
  },
  {
    Icon: HeartPulse, tint: "rose", category: "Healthcare (CNA · CPR · First Aid)",
    good_for: "Elder care · Childcare · Pet care · Personal training",
    partners: [
      { name: "Red Cross First Aid/CPR", from: "$110", url: "https://www.redcross.org/take-a-class?ref=lumo" },
      { name: "Coursera Nursing Assistant", from: "$59/mo", url: "https://www.coursera.org/browse/health/nursing?ref=lumo" },
    ],
  },
  {
    Icon: Scale, tint: "indigo", category: "Notary Public",
    good_for: "Loan signing · Document authentication · Mobile notary services",
    partners: [
      { name: "National Notary Association", from: "$79", url: "https://www.nationalnotary.org/become-a-notary?ref=lumo" },
      { name: "Loan Signing System",         from: "$497", url: "https://loansigningsystem.com/?ref=lumo" },
    ],
  },
  {
    Icon: Wrench, tint: "teal", category: "Trade Skills",
    good_for: "Handyman · Plumbing · HVAC · Electrical · General contracting",
    partners: [
      { name: "Penn Foster Trades", from: "$59/mo",  url: "https://www.pennfoster.edu/programs/trades?ref=lumo" },
      { name: "Ashworth College",   from: "$799",    url: "https://www.ashworthcollege.edu/?ref=lumo" },
    ],
  },
  {
    Icon: Sparkles, tint: "slate", category: "Beauty & Personal Services",
    good_for: "Beauty · Barbering · Massage · Nail care",
    partners: [
      { name: "Milady Beauty Academy", from: "$29/mo",  url: "https://milady.cengage.com/?ref=lumo" },
      { name: "Empire Beauty Schools", from: "$8,000", url: "https://www.empire.edu/?ref=lumo" },
    ],
  },
  {
    Icon: GraduationCap, tint: "emerald", category: "General & Business",
    good_for: "Marketing certifications · Google IT Support · Coursera catalog",
    partners: [
      { name: "Google Career Certificates", from: "$49/mo",  url: "https://grow.google/certificates/?ref=lumo" },
      { name: "Coursera Plus",              from: "$59/mo",  url: "https://www.coursera.org/courseraplus?ref=lumo" },
      { name: "LinkedIn Learning",          from: "$26.99/mo", url: "https://www.linkedin.com/learning/?ref=lumo" },
    ],
  },
];

const TINTS = {
  amber:   "border-amber-400 bg-amber-50 text-amber-800",
  teal:    "border-teal-400  bg-teal-50  text-teal-800",
  red:     "border-red-400   bg-red-50   text-red-800",
  indigo:  "border-indigo-400 bg-indigo-50 text-indigo-800",
  slate:   "border-slate-400 bg-slate-50 text-slate-800",
  rose:    "border-rose-400  bg-rose-50  text-rose-800",
  emerald: "border-emerald-400 bg-emerald-50 text-emerald-800",
};

async function trackClick(name, url) {
  try {
    await fetch("/api/affiliates/clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner: name, url, source: "training_page" }),
    });
  } catch { /* ignore */ }
  window.open(url, "_blank", "noopener");
}

export default function Training() {
  return (
    <div className="min-h-screen bg-white" data-testid="training-page">
      <PageHero
        title="Get certified. Unlock more jobs."
        subtitle="Online courses, licenses and certifications curated for what Lumo customers actually pay for. Finish in weeks, not years, and start accepting the categories that require credentials."
        imageQuery="online training certification"
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 text-xs text-slate-500 flex items-center gap-2">
          <Link to="/" className="hover:text-teal-700 flex items-center gap-1"><Home className="w-3 h-3" />Home</Link>
          <span>/</span><span className="text-slate-800 font-mono uppercase tracking-wider">Training & Licensing</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COURSES.map(({ Icon, tint, category, good_for, partners }) => (
            <div
              key={category}
              className="border-2 border-slate-200 hover:border-slate-900 transition-colors bg-white p-5 flex flex-col"
              data-testid={`training-card-${category.toLowerCase().replace(/\s|['\/&·]/g, "-")}`}
            >
              <div className={`inline-flex items-center gap-2 px-2 py-1 border ${TINTS[tint]} font-mono text-[10px] uppercase tracking-wider w-fit`}>
                <Icon className="w-3.5 h-3.5" />
                {category}
              </div>
              <h3 className="font-display text-lg font-black tracking-tight mt-3">Unlocks</h3>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{good_for}</p>
              <div className="mt-4 space-y-2 flex-1">
                {partners.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => trackClick(p.name, p.url)}
                    className="w-full text-left border border-slate-200 hover:border-teal-700 hover:bg-teal-50/40 p-3 flex items-center justify-between group"
                    data-testid={`training-partner-${p.name.toLowerCase().replace(/\s/g, "-")}`}
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
          <strong>Disclosure:</strong> Lumo earns a commission on some enrollments at no extra cost to you. Prices shown are starting rates and may vary by state/country. Complete a course, upload your certificate in Provider Hub → Credentials, and unlock matching job categories.
        </p>
      </div>
    </div>
  );
}
