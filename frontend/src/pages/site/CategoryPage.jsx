import React from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { CATEGORIES, CATEGORY_LIST } from "@/components/site/siteData";
import { PhoneFrame } from "@/components/site/PhoneFrame";
import { StoreBadges } from "@/components/site/DownloadButtons";
import { DownloadCTA } from "@/components/site/DownloadCTA";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const fade = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };
const Kicker = ({ children, color }) => <div className="font-mono text-xs uppercase tracking-[0.2em] font-medium" style={{ color }}>{children}</div>;

function Hero({ c }) {
  return (
    <section className="relative bg-gradient-to-b from-slate-50 to-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 lg:pt-24 grid lg:grid-cols-12 gap-14 items-center">
        <motion.div className="lg:col-span-7" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Kicker color={c.accent}>{c.kicker}</Kicker>
          <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mt-5 text-slate-950" data-testid="category-title">{c.title}</h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed max-w-xl">{c.lead}</p>
          <div className="mt-10"><StoreBadges prefix="category-hero" /></div>
          <dl className="mt-12 grid grid-cols-3 gap-6 max-w-lg" data-testid="category-stats">
            {c.stats.map(([v, l]) => (<div key={l}><dt className="font-display font-bold text-2xl sm:text-3xl text-slate-950">{v}</dt><dd className="text-sm text-slate-500 mt-1">{l}</dd></div>))}
          </dl>
        </motion.div>
        <motion.div className="lg:col-span-5" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
          <PhoneFrame screen={c.screen} />
        </motion.div>
      </div>
    </section>
  );
}

function Features({ c }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid lg:grid-cols-2 gap-14 items-center">
      <motion.img {...fade} src={c.image} alt="" className="w-full h-[440px] object-cover rounded-[32px]" />
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-10">
        {c.features.map(([t, b], i) => (
          <motion.div key={t} {...fade} transition={{ delay: i * 0.06 }} data-testid={`category-feature-${i}`}>
            <div className="w-9 h-9 rounded-xl grid place-items-center text-white" style={{ background: c.accent }}><Check className="w-4 h-4" /></div>
            <h3 className="font-display font-semibold text-xl mt-4 text-slate-900">{t}</h3>
            <p className="text-slate-600 mt-2 leading-relaxed">{b}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Steps({ c }) {
  return (
    <section className="bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <Kicker color={c.accent}>How it works in the app</Kicker>
        <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl lg:text-4xl mt-4 text-slate-950">Up and running in four steps</h2>
        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {c.steps.map(([t, b], i) => (
            <motion.li key={t} {...fade} transition={{ delay: i * 0.08 }} className="bg-white rounded-3xl p-7 border border-slate-200 hover:-translate-y-1 transition-transform duration-200" data-testid={`category-step-${i}`}>
              <div className="font-mono text-sm font-semibold" style={{ color: c.accent }}>0{i + 1}</div>
              <h3 className="font-display font-semibold text-lg mt-6 text-slate-900">{t}</h3>
              <p className="text-slate-600 mt-2 text-sm leading-relaxed">{b}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeesFaq({ c }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid lg:grid-cols-2 gap-16">
      <div>
        <Kicker color={c.accent}>Pricing</Kicker>
        <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl mt-4 text-slate-950">Simple, fair fees</h2>
        <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200" data-testid="category-fees">
          {c.fees.map(([k, v]) => (<div key={k} className="flex justify-between gap-6 py-4"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-900 text-right">{v}</span></div>))}
        </div>
      </div>
      <div>
        <Kicker color={c.accent}>Questions</Kicker>
        <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl mt-4 text-slate-950">Good to know</h2>
        <Accordion type="single" collapsible className="mt-6" data-testid="category-faq">
          {c.faqs.map(([q, a], i) => (
            <AccordionItem key={q} value={`q${i}`}>
              <AccordionTrigger className="text-left font-display text-base" data-testid={`category-faq-${i}`}>{q}</AccordionTrigger>
              <AccordionContent className="text-slate-600 leading-relaxed">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function Others({ slug }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4 flex flex-wrap gap-3">
      {CATEGORY_LIST.filter((o) => o.slug !== slug).map((o) => (
        <Link key={o.slug} to={`/app/${o.slug}`} className="inline-flex items-center gap-2 px-5 h-11 rounded-full border border-slate-200 text-sm font-medium hover:border-slate-900 transition-colors" data-testid={`category-other-${o.slug}`}>
          Lumo for {o.label} <ArrowRight className="w-4 h-4" />
        </Link>
      ))}
    </section>
  );
}

export default function CategoryPage() {
  const { slug } = useParams();
  const c = CATEGORIES[slug];
  if (!c) return <Navigate to="/" replace />;
  return (
    <div className="bg-white text-slate-950" data-testid={`category-page-${slug}`}>
      <Hero c={c} />
      <Features c={c} />
      <Steps c={c} />
      <FeesFaq c={c} />
      <Others slug={slug} />
      <DownloadCTA title={`Lumo for ${c.label.toLowerCase()} is free on iPhone and Android`} prefix="category-cta" />
    </div>
  );
}
