/**
 * Full-catalog services grid.
 *
 * The homepage shows 8 popular tiles + a "More services" CTA that lands here.
 * This page renders every category defined in SERVICE_SCHEMAS as an
 * attractive tile grid, grouped by intent (Home, Auto, Personal, Business,
 * Digital, Other) so customers can browse the entire Lumo catalog.
 */
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SERVICE_SCHEMAS } from "@/lib/serviceSchemas";
import PageHero from "@/components/PageHero";
import { Search, Home, Sparkles, Truck, Wrench, Heart, Briefcase, MonitorSmartphone, ShieldCheck, ArrowRight } from "lucide-react";

const GROUPS = [
  { key: "home",     label: "Home & Property",  Icon: Home,           categories: ["cleaning", "handyman", "landscaping", "appliance_repair", "locksmith", "security", "moving"] },
  { key: "auto",     label: "Auto & Transport", Icon: Truck,          categories: ["delivery", "courier", "ride_share", "auto", "auto_detailing", "roadside", "towing"] },
  { key: "personal", label: "Personal & Care",  Icon: Heart,          categories: ["personal_care", "medical", "pet_care", "events", "education"] },
  { key: "biz",      label: "Business & Legal", Icon: Briefcase,      categories: ["business_admin", "marketing", "legal", "financial", "notary"] },
  { key: "tech",     label: "Digital & Tech",   Icon: MonitorSmartphone, categories: ["digital_tech", "it_support", "remote_work", "research"] },
  { key: "other",    label: "Errands & Other",  Icon: Sparkles,       categories: ["errand", "other"] },
];

const PRETTY = {
  delivery: "Delivery", courier: "Courier", ride_share: "Ride-share",
  towing: "Towing", moving: "Moving", handyman: "Handyman",
  cleaning: "Cleaning", landscaping: "Landscaping", auto: "Mobile mechanic",
  auto_detailing: "Auto detailing",
  roadside: "Roadside assistance", pet_care: "Pet care", events: "Events & catering",
  personal_care: "Personal care", medical: "Medical & wellness",
  digital_tech: "Digital & tech", marketing: "Marketing",
  business_admin: "Business admin", education: "Tutoring & education",
  legal: "Legal services", financial: "Financial services",
  remote_work: "Remote work", research: "Research",
  notary: "Notary", it_support: "IT support", errand: "Errands",
  appliance_repair: "Appliance repair", locksmith: "Locksmith",
  security: "Home security", other: "Something else",
};

export default function Services() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return null;
    const needle = q.toLowerCase();
    return Object.keys(SERVICE_SCHEMAS).filter((k) =>
      (PRETTY[k] || k).toLowerCase().includes(needle)
    );
  }, [q]);

  return (
    <div className="min-h-screen bg-white" data-testid="services-page">
      <PageHero
        title="Every service on Lumo."
        subtitle="Browse the full catalog — from moving trucks to notaries. Tap any tile to describe what you need. Providers respond in minutes."
        imageQuery="marketplace services variety"
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 text-xs text-slate-500 flex items-center gap-2">
          <Link to="/" className="hover:text-teal-700">Home</Link>
          <span>/</span><span className="text-slate-800 font-mono uppercase tracking-wider">All services</span>
        </div>
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search services (moving, notary, cleaning…)"
            className="w-full pl-10 pr-4 py-3 border border-slate-300 focus:border-slate-900 focus:outline-none text-base"
            data-testid="services-search-input"
          />
        </div>

        {filtered ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="services-search-results">
            {filtered.length === 0 && (
              <p className="col-span-full text-sm text-slate-500">No service matches "{q}". Try a broader term.</p>
            )}
            {filtered.map((cat) => (
              <ServiceTile key={cat} cat={cat} />
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {GROUPS.map(({ key, label, Icon, categories }) => (
              <div key={key} data-testid={`services-group-${key}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 text-teal-700" />
                  <h2 className="font-display text-xl font-black tracking-tight">{label}</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {categories.filter((c) => SERVICE_SCHEMAS[c]).map((cat) => (
                    <ServiceTile key={cat} cat={cat} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sub-CTA: Provider-facing insurance / training links so a customer
            who lands here and realises "hmm I could do this too" gets a
            path into the sign-up funnel. */}
        <div className="mt-14 border-2 border-slate-900 bg-slate-50 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to="/insurance" className="flex items-center justify-between p-4 bg-white border border-slate-200 hover:border-slate-900 group" data-testid="services-to-insurance">
              <div>
                <div className="flex items-center gap-2 text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <span className="font-display font-black">Need insurance to work?</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">General Liability, Workers Comp, Commercial Auto, and more.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900" />
            </Link>
            <Link to="/training" className="flex items-center justify-between p-4 bg-white border border-slate-200 hover:border-slate-900 group" data-testid="services-to-training">
              <div>
                <div className="flex items-center gap-2 text-slate-800">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <span className="font-display font-black">Need to get certified?</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">Notary, CDL, Real Estate, CPR, trade skills — all online.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceTile({ cat }) {
  const label = PRETTY[cat] || cat.replace(/_/g, " ");
  return (
    <Link
      to={`/order/${cat}`}
      className="border-2 border-slate-200 hover:border-slate-900 bg-white p-4 flex items-center justify-between group aspect-[3/1] transition-all"
      data-testid={`service-tile-${cat}`}
    >
      <span className="font-display font-black text-slate-900 leading-tight capitalize">{label}</span>
      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-1 transition" />
    </Link>
  );
}
