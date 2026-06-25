import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Check, Sparkles, Globe } from "lucide-react";

/**
 * Generic SEO landing page for /work/:category[/:city], /sell/:category[/:city],
 * /find-help/:category[/:city], /rent-out/:category[/:city]
 *
 * Sets document.title + meta description + open-graph tags dynamically.
 * Google's modern crawler executes JS so these get indexed.
 */
function setMeta(name, content) {
  if (!content) return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setOG(prop, content) {
  if (!content) return;
  let el = document.querySelector(`meta[property="${prop}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", prop);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function LandingPage({ pageType }) {
  const { category, city } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [siblings, setSiblings] = useState({ cities: [], categories: [] });
  const [error, setError] = useState(null);

  useEffect(() => {
    const url = city
      ? `/landing/${pageType}/${category}/${city}`
      : `/landing/${pageType}/${category}`;
    api.get(url).then(({ data }) => {
      setData(data);
      // Set SEO
      document.title = data.title;
      setMeta("description", data.description);
      setOG("og:title", data.title);
      setOG("og:description", data.description);
      setOG("og:type", "website");
      setOG("og:url", window.location.href);
      setMeta("twitter:card", "summary_large_image");
      setMeta("twitter:title", data.title);
      setMeta("twitter:description", data.description);
    }).catch((e) => setError(e?.response?.status === 404 ? "404" : "error"));

    Promise.all([
      api.get("/landing/cities").then((r) => r.data.cities).catch(() => []),
      api.get("/landing/types").then((r) => r.data.types).catch(() => ({})),
    ]).then(([cities, types]) => {
      setSiblings({
        cities: cities.slice(0, 12),
        categories: Object.keys((types?.[pageType]?.categories) || {}),
      });
    });
  }, [pageType, category, city]);

  if (error === "404") return (
    <div className="max-w-screen-md mx-auto px-6 py-24 text-center">
      <div className="overline text-red-600">404</div>
      <h1 className="font-display text-5xl font-black tracking-tighter mt-2">Page not found.</h1>
      <p className="text-slate-600 mt-4">That landing page doesn&apos;t exist. Head back to the marketplace.</p>
      <Link to="/" className="inline-block mt-6"><Button>Back home</Button></Link>
    </div>
  );

  if (!data) return <div className="p-12 text-slate-500">Loading…</div>;

  const isWorker = pageType === "work";
  const isCustomer = pageType === "find-help";
  const isSeller = pageType === "sell";
  const isHost = pageType === "rent-out";

  const bullets = isWorker ? [
    "Keep 90% of every job. We only take 10%.",
    "Set your own hours — work when you want.",
    "Get matched to jobs in your area instantly.",
    "Fast payouts. No monthly fees, no hidden cuts.",
  ] : isCustomer ? [
    "Vetted professionals respond in minutes, not days.",
    "Transparent pricing. No surprise charges.",
    "Same-day availability across thousands of providers.",
    "Pay safely through Lumo. Full refund if not satisfied.",
  ] : isSeller ? [
    "Same-day delivery built in — no separate driver app needed.",
    "Keep 90% of every order. Zero monthly subscription.",
    "Reach customers across your city the day you list.",
    "Lumo handles payments, refunds, and customer support.",
  ] : isHost ? [
    "Lumo handles deposits, payouts, calendar, and insurance.",
    "Reach renters across your city and globally.",
    "Keep 90% of every booking. Zero monthly listing fee.",
    "Approve every booking — you stay in control.",
  ] : [];

  return (
    <div className="bg-white" data-testid={`landing-${pageType}`}>
      {/* HERO */}
      <section className="max-w-screen-2xl mx-auto px-6 pt-12 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
          {data.city && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 border border-slate-200 text-[10px] font-mono uppercase tracking-widest text-slate-600">
              <MapPin className="w-3 h-3" /> {data.city.name}, {data.city.country}
            </div>
          )}
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mt-5" data-testid="landing-h1">
            {data.h1}
          </h1>
          <p className="text-lg text-slate-600 mt-6 leading-relaxed max-w-2xl">{data.subtitle}</p>
          <div className="flex gap-3 mt-8">
            <Button onClick={() => navigate(data.cta_path)} className="bg-slate-900 hover:bg-slate-800 text-white h-12 px-6 font-mono uppercase tracking-widest text-xs" data-testid="landing-cta">
              {data.cta_label} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Link to="/marketplace">
              <Button variant="outline" className="h-12 px-6 font-mono uppercase tracking-widest text-xs">Browse Lumo</Button>
            </Link>
          </div>

          <ul className="mt-10 space-y-3" data-testid="landing-bullets">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 bg-teal-50 border border-teal-200"><Check className="w-3 h-3 text-teal-700" /></span>
                <span className="text-slate-700">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-5">
          <div className="border border-slate-200 p-6 bg-slate-50/50">
            <div className="overline">Why Lumo</div>
            <h3 className="font-display text-2xl font-bold tracking-tight mt-2">A marketplace, not a middleman.</h3>
            <div className="grid grid-cols-2 gap-4 mt-5">
              <Stat label="Platform fee" value="10%" sub="industry-low" />
              <Stat label="Worker keeps" value="90%" sub="every job" />
              <Stat label="Cities" value="500+" sub="and growing" />
              <Stat label="Response time" value="< 5m" sub="median" />
            </div>
            <div className="mt-6 text-[11px] font-mono uppercase tracking-widest text-slate-500">
              <Sparkles className="w-3 h-3 inline mr-1" /> Live in {data.city ? `${data.city.name} now` : "your city"}.
            </div>
          </div>
        </div>
      </section>

      {/* CITY GRID — internal-link SEO */}
      <section className="border-t border-slate-100 bg-slate-50/30">
        <div className="max-w-screen-2xl mx-auto px-6 py-14">
          <div className="overline"><Globe className="w-3 h-3 inline mr-1" /> Worldwide</div>
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-2">
            {data.page_label} in your city.
          </h2>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="landing-cities">
            {siblings.cities.map((c) => (
              <Link key={c.slug} to={`/${pageType}/${category}/${c.slug}`}
                className={`text-sm border px-3 py-2 hover:bg-white hover:border-slate-400 transition-colors ${city === c.slug ? "border-slate-900 bg-white font-bold" : "border-slate-200 text-slate-600"}`}>
                {c.name} <span className="text-[10px] font-mono opacity-50">{c.country}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORY GRID — adjacent landing pages */}
      <section className="border-t border-slate-100">
        <div className="max-w-screen-2xl mx-auto px-6 py-14">
          <div className="overline">Also on Lumo</div>
          <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter mt-2">More ways to {data.page_label.toLowerCase()}.</h2>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" data-testid="landing-categories">
            {siblings.categories.filter((c) => c !== category).slice(0, 12).map((c) => (
              <Link key={c} to={`/${pageType}/${c}${city ? "/" + city : ""}`}
                className="text-sm border border-slate-200 px-3 py-2 hover:bg-slate-50 hover:border-slate-400 transition-colors text-slate-700 capitalize">
                {c.replace(/-/g, " ")}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CONVERSION CTA */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-screen-md mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter">Ready to start?</h2>
          <p className="text-slate-300 mt-4 text-lg">{data.subtitle}</p>
          <Button onClick={() => navigate(data.cta_path)} className="mt-8 bg-white text-slate-900 hover:bg-slate-100 h-12 px-8 font-mono uppercase tracking-widest text-xs" data-testid="landing-cta-bottom">
            {data.cta_label} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="overline text-slate-500">{label}</div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
