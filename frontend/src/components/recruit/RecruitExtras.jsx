import React from "react";
import { Link } from "react-router-dom";
import { Languages, MapPin, ArrowRight, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const langName = (code) => {
  try { return new Intl.DisplayNames([code], { type: "language" }).of(code) || code; } catch { return code; }
};

export const RecruitLangToggle = ({ pageLang, pref, onChange }) => {
  if (!pageLang || pageLang === "en") return null;
  const opts = [{ v: "local", label: langName(pageLang) }, { v: "en", label: "English" }];
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/20 p-1" data-testid="recruit-lang-toggle" data-no-i18n="true">
      <Languages className="w-3.5 h-3.5 mx-1.5 text-white/70" />
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 py-0.5 rounded-full text-xs transition-colors ${pref === o.v ? "bg-white text-black" : "text-white/80 hover:text-white"}`}
          data-testid={`recruit-lang-${o.v}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

export const RecruitShareBar = ({ slug, cityName }) => {
  const { user } = useAuth();
  if (!user?.referral_code) return null;
  const url = `${window.location.origin}/join/${slug}?ref=${user.referral_code}`;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: `Work with Lumo in ${cityName}`, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(url); toast.success("Recruit link copied"); } catch { toast.error("Copy failed"); }
  };
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-8 py-8" data-testid="recruit-share-bar">
      <div className="border border-teal-700 bg-teal-50 p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <div className="font-display font-bold">Recruit in {cityName} and earn on every job</div>
          <div className="text-xs font-mono text-slate-600 break-all mt-1" data-no-i18n="true">{url}</div>
        </div>
        <button onClick={share} className="btn-lumo btn-lumo-primary btn-lumo-sm" data-testid="recruit-share-city-btn">
          <Share2 className="w-4 h-4" /> Share my link
        </button>
      </div>
    </section>
  );
};

export const NearbyRecruitCities = ({ city }) => {
  const list = city.nearby || [];
  if (!list.length) return null;
  const cc = (city.country || "US").toLowerCase();
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12" data-testid="recruit-nearby">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-2xl font-bold">Also hiring in {city.country_name || "this country"}</h2>
        <Link to={`/join/country/${cc}`} className="text-sm font-mono hover:underline" data-testid="recruit-nearby-all">All cities →</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {list.map((c) => (
          <Link key={c.slug} to={`/join/${c.slug}`} className="group border border-neutral-200 hover:border-black p-4 transition-colors" data-testid={`recruit-nearby-${c.slug}`}>
            <div className="font-display font-bold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{c.city}</div>
            <div className="text-xs font-mono text-neutral-500 mt-1 flex items-center justify-between">
              {c.signups_total} / {c.goal_workers || 300}
              <ArrowRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};
