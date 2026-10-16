import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Search, Rocket, Briefcase, CreditCard, Wallet, ShoppingBag, CalendarDays, Building2, ShieldCheck, Wrench,
  RefreshCw, LogIn, BellOff, Sparkles, Mail,
} from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const TOPIC_ICON = {
  getting_started: Rocket, booking: Briefcase, payments: CreditCard, earning: Wallet, buying_selling: ShoppingBag,
  rentals: CalendarDays, real_estate: Building2, account: ShieldCheck, troubleshooting: Wrench,
};

const FIXES = [
  { key: "reset", Icon: RefreshCw, title: "Site won't load", body: "Clears this device's saved copy of Lumo.", cta: "Reset this device", to: "/reset" },
  { key: "login", Icon: LogIn, title: "Can't sign in", body: "Try phone or Google sign-in.", cta: "Go to sign in", to: "/signin" },
  { key: "payment", Icon: CreditCard, title: "Payment failed", body: "Check your card or try another.", cta: "Open orders", to: "/orders" },
  { key: "notify", Icon: BellOff, title: "No notifications", body: "Turn alerts back on.", cta: "Open settings", to: "/settings" },
];

export const openGuide = () => window.dispatchEvent(new CustomEvent("lumo:open-guide"));

function Fixes() {
  return (
    <section className="mt-12" data-testid="help-fixes">
      <h2 className="font-display text-2xl font-black tracking-tight">Fix common problems</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {FIXES.map(({ key, Icon, title, body, cta, to }) => (
          <div key={key} className="border border-slate-200 rounded-2xl p-5 flex flex-col" data-testid={`help-fix-${key}`}>
            <Icon className="w-5 h-5" />
            <div className="font-display font-bold mt-3">{title}</div>
            <p className="text-sm text-slate-600 mt-1 flex-1">{body}</p>
            <Link to={to} className="mt-4 inline-flex justify-center rounded-full bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 transition-colors" data-testid={`help-fix-${key}-btn`}>{cta}</Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Help() {
  const [data, setData] = useState({ topics: [], faqs: [] });
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState(null);

  useEffect(() => { api.get("/help/faqs").then(({ data }) => setData(data)).catch(() => {}); }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.faqs.filter((f) => (!topic || f.topic === topic) &&
      (!needle || `${f.question} ${f.answer}`.toLowerCase().includes(needle)));
  }, [data.faqs, q, topic]);
  const groups = data.topics.map((t) => ({ ...t, items: shown.filter((f) => f.topic === t.key) })).filter((g) => g.items.length);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10 pb-28" data-testid="help-page">
      <Helmet><title>Help Center · Lumo</title></Helmet>
      <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter">Help</h1>
      <div className="relative mt-6 max-w-2xl">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help" className="h-12 pl-11 rounded-full" data-testid="help-search" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-8" data-testid="help-topics">
        {data.topics.map((t) => {
          const Icon = TOPIC_ICON[t.key] || Rocket;
          const on = topic === t.key;
          return (
            <button key={t.key} onClick={() => setTopic(on ? null : t.key)}
                    className={`text-left rounded-2xl border p-4 transition-colors ${on ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 hover:border-slate-900"}`}
                    data-testid={`help-topic-${t.key}`}>
              <Icon className="w-5 h-5" />
              <div className="font-display font-bold text-sm mt-2">{t.label}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-10" data-testid="help-faqs">
        {groups.length === 0 && data.faqs.length > 0 && <p className="text-sm text-slate-500" data-testid="help-no-results">No answers match “{q}”. Try Lumi below.</p>}
        {groups.map((g) => (
          <section key={g.key} className="mb-8">
            <h2 className="font-display text-xl font-bold mb-2">{g.label}</h2>
            <Accordion type="multiple" className="border border-slate-200 rounded-2xl px-4">
              {g.items.map((f) => (
                <AccordionItem key={f.id} value={f.id} data-testid={`help-faq-${f.id}`}>
                  <AccordionTrigger className="text-left font-medium">{f.question}</AccordionTrigger>
                  <AccordionContent className="text-slate-600 leading-relaxed whitespace-pre-wrap">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>

      <Fixes />

      <section className="mt-12 rounded-3xl bg-slate-900 text-white p-8 flex flex-col sm:flex-row sm:items-center gap-4" data-testid="help-contact">
        <div className="flex-1">
          <div className="font-display text-2xl font-black">Still stuck?</div>
          <div className="text-sm text-white/70 mt-1">Lumi answers instantly. Support replies within a day.</div>
        </div>
        <button onClick={openGuide} className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-slate-900 px-5 py-3 font-medium hover:scale-[1.03] transition-transform" data-testid="help-ask-lumi">
          <Sparkles className="w-4 h-4" />Ask Lumi
        </button>
        <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-5 py-3 font-medium hover:bg-white/10 transition-colors" data-testid="help-contact-btn">
          <Mail className="w-4 h-4" />Contact support
        </Link>
      </section>
    </div>
  );
}
