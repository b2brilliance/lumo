import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Globe2, ShieldCheck, Zap } from "lucide-react";
import { CATEGORY_LIST } from "@/components/site/siteData";
import { PhoneFrame } from "@/components/site/PhoneFrame";
import { StoreBadges } from "@/components/site/DownloadButtons";
import { DownloadCTA } from "@/components/site/DownloadCTA";
import { FeeCalculator } from "@/components/site/FeeCalculator";

const fade = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

function Hero() {
  const [tab, setTab] = useState(0);
  const c = CATEGORY_LIST[tab];
  return (
    <section className="relative bg-gradient-to-b from-slate-50 via-white to-white overflow-hidden">
      <div className="absolute -top-40 right-0 w-[640px] h-[640px] rounded-full bg-gradient-to-tr from-amber-300 via-rose-300 to-indigo-300 opacity-30 blur-3xl" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 lg:pt-24 lg:pb-32 grid lg:grid-cols-12 gap-14 items-center">
        <motion.div className="lg:col-span-7" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500" /> Free on iPhone and Android
          </div>
          <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mt-6 text-slate-950" data-testid="home-title">
            Order food, book local pros, earn and find a home. <span className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 bg-clip-text text-transparent">One app.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-xl leading-relaxed">Lumo connects customers, workers, local sellers and real estate in your city. Everyone gets their own app experience, built for what they came to do.</p>
          <div className="mt-10"><StoreBadges prefix="home-hero" /></div>
          <dl className="mt-12 grid grid-cols-3 gap-6 max-w-lg">
            {[["90%", "workers keep"], ["5%", "seller fee"], ["$0", "to list a home"]].map(([v, l]) => (
              <div key={l}><dt className="font-display font-bold text-3xl text-slate-950">{v}</dt><dd className="text-sm text-slate-500 mt-1">{l}</dd></div>
            ))}
          </dl>
        </motion.div>
        <div className="lg:col-span-5">
          <div className="flex justify-center gap-1 mb-8 p-1 rounded-full bg-slate-100 w-fit mx-auto" data-testid="home-phone-tabs">
            {CATEGORY_LIST.map((x, i) => (
              <button key={x.slug} onClick={() => setTab(i)} className="relative px-4 h-9 text-sm font-medium whitespace-nowrap" data-testid={`home-phone-tab-${x.slug}`}>
                {tab === i && <motion.span layoutId="tabpill" className="absolute inset-0 rounded-full bg-white shadow-sm" />}
                <span className={`relative ${tab === i ? "text-slate-950" : "text-slate-500"}`}>{x.label}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={c.slug} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <PhoneFrame screen={c.screen} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function Personas() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24" data-testid="home-personas">
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber-600 font-medium">Four ways to use Lumo</div>
      <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl lg:text-4xl mt-4 max-w-2xl">Choose who you are. The app adapts to you.</h2>
      <div className="grid sm:grid-cols-2 gap-5 mt-12">
        {CATEGORY_LIST.map((c, i) => (
          <motion.div key={c.slug} {...fade} transition={{ delay: i * 0.07 }}>
            <Link to={`/app/${c.slug}`} className="group block h-full rounded-[28px] border border-slate-200 p-8 hover:border-slate-900 hover:-translate-y-1 transition-[transform,border-color] duration-200" data-testid={`home-persona-${c.slug}`}>
              <div className="w-12 h-12 rounded-2xl grid place-items-center text-white" style={{ background: c.accent }}><c.Icon className="w-6 h-6" /></div>
              <h3 className="font-display font-semibold text-2xl mt-6">{c.label}</h3>
              <p className="text-slate-600 mt-2 leading-relaxed">{c.lead}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold group-hover:gap-3 transition-[gap]">See how it works <ArrowRight className="w-4 h-4" /></span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber-600 font-medium">Fair, open pricing</div>
          <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl lg:text-4xl mt-4">See the delivery fee before you order.</h2>
          <p className="text-lg text-slate-600 mt-5 leading-relaxed">No subscriptions and no hidden markups. Delivery is a small base fee plus a per-mile charge, scaled for bigger orders, and drivers keep 90% of it.</p>
          <ul className="mt-8 space-y-3 text-slate-700">
            {["Pickup: just a 5% service fee", "Sellers open a shop free and pay 5% per sale", "Homes for sale and long-term rentals list free", "Short stays: 5% per booking"].map((t) => <li key={t} className="flex gap-3"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0" />{t}</li>)}
          </ul>
        </div>
        <FeeCalculator />
      </div>
    </section>
  );
}

function Trust() {
  const items = [[Globe2, "Worldwide, in your language", "Available in cities around the world, in 15+ languages and local currencies."], [ShieldCheck, "Verified and secure", "Workers verify their ID, and payments are processed securely by Stripe."], [Zap, "Instant alerts", "Push notifications for every order, job and message, the moment it happens."]];
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid md:grid-cols-3 gap-10">
      {items.map(([Icon, t, b], i) => (
        <motion.div key={t} {...fade} transition={{ delay: i * 0.08 }} data-testid={`home-trust-${i}`}>
          <Icon className="w-7 h-7" />
          <h3 className="font-display font-semibold text-xl mt-5">{t}</h3>
          <p className="text-slate-600 mt-2 leading-relaxed">{b}</p>
        </motion.div>
      ))}
    </section>
  );
}

export default function WebsiteHome() {
  return (
    <div className="bg-white text-slate-950" data-testid="website-landing">
      <Hero />
      <Personas />
      <Pricing />
      <Trust />
      <DownloadCTA prefix="home-cta" />
    </div>
  );
}
