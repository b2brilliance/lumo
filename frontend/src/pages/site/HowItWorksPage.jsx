import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Download, UserRound, Sparkles } from "lucide-react";
import { CATEGORY_LIST } from "@/components/site/siteData";
import { DownloadCTA } from "@/components/site/DownloadCTA";
import { StoreBadges } from "@/components/site/DownloadButtons";

const BASICS = [
  [Download, "Download Lumo", "Free on the App Store and Google Play."],
  [UserRound, "Pick who you are", "Customer, Worker, Seller or Real Estate. Each gets its own app experience."],
  [Sparkles, "Start in minutes", "Sign in with Apple, phone or email and you're ready to go."],
];

export default function HowItWorksPage() {
  return (
    <div className="bg-white text-slate-950" data-testid="how-it-works-page">
      <section className="bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber-600 font-medium">How Lumo works</div>
          <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mt-5 max-w-4xl">One app. Four ways to use it.</h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl leading-relaxed">When you open Lumo you choose who you are. From then on you only see what matters to you, nothing else.</p>
          <div className="mt-10"><StoreBadges prefix="how-hero" /></div>
          <ol className="mt-16 grid md:grid-cols-3 gap-5">
            {BASICS.map(([Icon, t, b], i) => (
              <motion.li key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="rounded-3xl border border-slate-200 bg-white p-7" data-testid={`how-basic-${i}`}>
                <Icon className="w-6 h-6" />
                <h3 className="font-display font-semibold text-xl mt-5">{t}</h3>
                <p className="text-slate-600 mt-2">{b}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>
      {CATEGORY_LIST.map((c, idx) => (
        <section key={c.slug} className={idx % 2 ? "bg-slate-50" : "bg-white"} data-testid={`how-section-${c.slug}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <c.Icon className="w-8 h-8" style={{ color: c.accent }} />
              <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl mt-5">For {c.label.toLowerCase()}</h2>
              <p className="text-slate-600 mt-3 leading-relaxed">{c.lead}</p>
              <Link to={`/app/${c.slug}`} className="mt-6 inline-flex items-center gap-2 font-semibold hover:gap-3 transition-[gap]" style={{ color: c.accent }} data-testid={`how-more-${c.slug}`}>Learn more <ArrowRight className="w-4 h-4" /></Link>
            </div>
            <ol className="lg:col-span-8 grid sm:grid-cols-2 gap-4">
              {c.steps.map(([t, b], i) => (
                <li key={t} className="rounded-3xl bg-white border border-slate-200 p-6">
                  <div className="font-mono text-sm font-semibold" style={{ color: c.accent }}>0{i + 1}</div>
                  <div className="font-display font-semibold mt-3">{t}</div>
                  <div className="text-sm text-slate-600 mt-1.5">{b}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ))}
      <DownloadCTA prefix="how-cta" />
    </div>
  );
}
