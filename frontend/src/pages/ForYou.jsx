import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Truck, Home as HomeIcon, Car, HeartPulse, Briefcase,
  Film, HandHelping, Sparkles, Search, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AiServiceCopilot from "@/components/AiServiceCopilot";

/**
 * ForYou — the customer home. ≤7 top-level categories; each expands into
 * the deep dropdowns inside /order/<service>. AI copilot button opens a
 * small chat that pins down exactly what the user needs.
 */

const CATEGORIES = [
  {
    key: "transport",
    label: "Transport & Delivery",
    sub: "Rides · courier · moving · towing · CDL trucking",
    icon: Truck,
    tint: "bg-gradient-to-br from-sky-500 to-indigo-600",
    picks: [
      { to: "/order/delivery",  label: "Package or food delivery" },
      { to: "/order/courier",   label: "Same-day courier" },
      { to: "/order/moving",    label: "Moving / haul" },
      { to: "/order/towing",    label: "Towing" },
      { to: "/order/other",     label: "Hire a CDL driver",       hint: "one-time or long-term" },
    ],
  },
  {
    key: "home",
    label: "Home & Property Care",
    sub: "Cleaning · handyman · landscaping · appliance · locksmith · security",
    icon: HomeIcon,
    tint: "bg-gradient-to-br from-emerald-500 to-teal-700",
    picks: [
      { to: "/order/cleaning",         label: "Cleaning / housekeeping" },
      { to: "/order/handyman",         label: "Handyman / repairs" },
      { to: "/order/landscaping",      label: "Lawn & landscaping" },
      { to: "/order/appliance_repair", label: "Appliance repair" },
      { to: "/order/locksmith",        label: "Locksmith" },
      { to: "/order/security",         label: "Home security" },
    ],
  },
  {
    key: "auto",
    label: "Auto Care",
    sub: "Mobile mechanic · detailing · roadside · tires · diagnostics",
    icon: Car,
    tint: "bg-gradient-to-br from-rose-500 to-red-700",
    picks: [
      { to: "/order/auto",           label: "Mobile mechanic — comes to you" },
      { to: "/order/auto_detailing", label: "Detailing & cleaning" },
      { to: "/order/roadside",       label: "Roadside assistance" },
    ],
  },
  {
    key: "care",
    label: "Health & Personal Care",
    sub: "Pet care · medical house-calls · beauty · fitness · elder care",
    icon: HeartPulse,
    tint: "bg-gradient-to-br from-fuchsia-500 to-pink-700",
    picks: [
      { to: "/order/pet_care", label: "Pet care — walks, sitting, grooming" },
      { to: "/order/medical",  label: "Medical house-call / visiting nurse" },
      { to: "/order/other",    label: "Beauty, fitness, elder care",         hint: "describe your need" },
    ],
  },
  {
    key: "business",
    label: "Business & Professional",
    sub: "IT · marketing · legal · notary · accounting · tutoring · remote work",
    icon: Briefcase,
    tint: "bg-gradient-to-br from-indigo-600 to-slate-900",
    picks: [
      { to: "/order/it_support",     label: "IT / tech help",            hint: "small jobs → full projects" },
      { to: "/order/digital_tech",   label: "Web, apps, design, data" },
      { to: "/order/marketing",      label: "Marketing & social" },
      { to: "/order/legal",          label: "Legal help" },
      { to: "/order/notary",         label: "Licensed notary" },
      { to: "/order/financial",      label: "Bookkeeping & tax" },
      { to: "/order/education",      label: "Tutoring & coaching" },
      { to: "/order/business_admin", label: "Business admin / VA" },
      { to: "/order/remote_work",    label: "Remote work — hire or get hired" },
    ],
  },
  {
    key: "creative",
    label: "Creative & Events",
    sub: "Photo · video · event staff · cinematic production · performers",
    icon: Film,
    tint: "bg-gradient-to-br from-amber-500 to-orange-700",
    picks: [
      { to: "/order/events",   label: "Event staff & setup" },
      { to: "/order/other",    label: "Photo / video / production", hint: "cinematic & commercial" },
      { to: "/order/other",    label: "Performers & DJs",           hint: "describe your event" },
    ],
  },
  {
    key: "errands",
    label: "Everyday Help & Errands",
    sub: "Shopping · waiting in line · pickups · misc",
    icon: HandHelping,
    tint: "bg-gradient-to-br from-stone-600 to-stone-900",
    picks: [
      { to: "/order/errand", label: "Run an errand" },
      { to: "/order/other",  label: "Something else", hint: "I'll describe it" },
    ],
  },
];

function CategoryTile({ cat, open, onOpen }) {
  const Icon = cat.icon;
  return (
    <div className="border border-slate-200 bg-white overflow-hidden" data-testid={`fy-cat-${cat.key}`}>
      <button
        type="button"
        onClick={() => onOpen(open ? null : cat.key)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50"
        data-testid={`fy-cat-${cat.key}-toggle`}
      >
        <div className={`${cat.tint} w-14 h-14 flex items-center justify-center text-white flex-shrink-0`}>
          <Icon className="w-7 h-7" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-black text-xl tracking-tight">{cat.label}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{cat.sub}</div>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
          {open ? "close" : "open"}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 grid gap-2" data-testid={`fy-cat-${cat.key}-picks`}>
          {cat.picks.map((p, i) => (
            <Link
              key={i}
              to={p.to}
              className="flex items-center justify-between gap-3 bg-white border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm"
              data-testid={`fy-pick-${cat.key}-${i}`}
            >
              <div>
                <div className="font-bold text-slate-900">{p.label}</div>
                {p.hint && <div className="text-[11px] font-mono text-slate-500 mt-0.5">{p.hint}</div>}
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Book →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ForYou() {
  const nav = useNavigate();
  const [openKey, setOpenKey] = useState(null);
  const [search, setSearch] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    // route to "other" with the query so the wizard captures it in step 1
    nav(`/order/other?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <>
      <Helmet>
        <title>Hire a pro — Lumo</title>
      </Helmet>
      <div className="min-h-[calc(100vh-56px)] bg-white" data-testid="for-you">
        <div className="max-w-5xl mx-auto px-5 pt-8 pb-24">
          <Link to="/" className="hidden md:inline-flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-slate-900" data-testid="fy-back">
            <ArrowLeft className="w-3 h-3" /> Back
          </Link>
          <div className="overline text-slate-500 mt-4">For you</div>
          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tighter mt-1">
            What do you need done?
          </h1>

          {/* Search + AI copilot CTA */}
          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <form onSubmit={onSearchSubmit} className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. notary at my house Sunday"
                className="pl-9 h-12 text-sm"
                data-testid="fy-search"
              />
            </form>
            <Button
              type="button"
              onClick={() => setCopilotOpen(true)}
              className="h-12 bg-slate-900 hover:bg-slate-800 text-white"
              data-testid="fy-copilot-open"
            >
              <Sparkles className="w-4 h-4 mr-2" /> Ask Lumo
            </Button>
          </div>

          {/* 7 categories */}
          <div className="mt-8 grid gap-3">
            {CATEGORIES.map((c) => (
              <CategoryTile key={c.key} cat={c} open={openKey === c.key} onOpen={setOpenKey} />
            ))}
          </div>
        </div>
      </div>

      {copilotOpen && (
        <AiServiceCopilot
          onClose={() => setCopilotOpen(false)}
          onPick={(serviceKey, prefill) => {
            setCopilotOpen(false);
            const qs = prefill ? `?q=${encodeURIComponent(prefill)}` : "";
            nav(`/order/${serviceKey}${qs}`);
          }}
        />
      )}
    </>
  );
}
