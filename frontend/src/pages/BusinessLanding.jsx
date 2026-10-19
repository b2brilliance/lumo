import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, BadgeDollarSign, CalendarCheck, MapPin, Store, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";

const BENEFITS = [
  { Icon: Store, t: "List your services free", b: "Repairs, cleaning, beauty, catering, tutoring, delivery and more." },
  { Icon: Wallet, t: "Keep 90% of every job", b: "Customers book and pay in the app. Payouts land the same day." },
  { Icon: BadgeDollarSign, t: "No monthly fees", b: "No subscriptions, no contracts, no paying for leads." },
  { Icon: Users, t: "Find local help", b: "Short-handed? Hire reliable local pros for deliveries and odd jobs." },
];

function Benefits({ city }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-8 py-16" data-testid="biz-benefits">
      <div className="overline mb-3">Why {city} businesses use Lumo</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {BENEFITS.map(({ Icon, t, b }, i) => (
          <div key={t} className="card-lumo p-6" data-testid={`biz-benefit-${i}`}>
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Icon className="w-5 h-5 text-black" />
            </div>
            <div className="font-display font-bold mt-4">{t}</div>
            <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LeadForm({ city, onDone }) {
  const [qs] = useSearchParams();
  const [f, setF] = useState({ business_name: "", category: "", contact_name: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!f.category) return setErr("Pick a service category");
    if (!f.phone.trim() && !f.email.trim()) return setErr("Add a phone number or email");
    setBusy(true);
    try {
      await api.post("/business/leads", {
        ...f, city_slug: city.slug,
        utm_source: qs.get("utm_source") || "", utm_campaign: qs.get("utm_campaign") || "", utm_content: qs.get("utm_content") || "",
      });
      onDone(f);
    } catch (ex) {
      setErr(ex?.response?.data?.detail?.toString?.() || "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const input = "w-full h-11 px-3 rounded-lg border border-neutral-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black";
  return (
    <form onSubmit={submit} className="bg-white text-black rounded-2xl p-6 sm:p-7 shadow-2xl space-y-3" data-testid="biz-lead-form">
      <div className="font-display font-bold text-xl">List your services</div>
      <p className="text-xs text-neutral-500 -mt-1">Free. Takes under a minute, then create your Lumo account.</p>
      <input required minLength={2} className={input} placeholder="Business name" value={f.business_name} onChange={set("business_name")} data-testid="biz-lead-business-name" />
      <select className={input} value={f.category} onChange={set("category")} data-testid="biz-lead-category">
        <option value="">Service category…</option>
        {city.categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input className={input} placeholder="Your name" value={f.contact_name} onChange={set("contact_name")} data-testid="biz-lead-contact-name" />
      <div className="grid grid-cols-2 gap-3">
        <input className={input} type="tel" placeholder="Phone" value={f.phone} onChange={set("phone")} data-testid="biz-lead-phone" />
        <input className={input} type="email" placeholder="Email" value={f.email} onChange={set("email")} data-testid="biz-lead-email" />
      </div>
      {err && <div className="text-sm text-red-600" data-testid="biz-lead-error">{err}</div>}
      <button disabled={busy} className="btn-lumo btn-lumo-primary w-full justify-center h-12" data-testid="biz-lead-submit">
        {busy ? "Saving…" : "Continue"} <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}

export default function BusinessLanding() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [city, setCity] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.get(`/business/cities/${slug}`).then(({ data }) => setCity(data)).catch(() => setMissing(true));
  }, [slug]);

  const onDone = (f) => {
    const q = new URLSearchParams({ role: "provider", recruit_city_slug: slug, name: f.contact_name || f.business_name });
    if (f.email) q.set("email", f.email);
    if (f.phone) q.set("phone", f.phone);
    nav(`/register?${q.toString()}`);
  };

  if (missing) {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center" data-testid="biz-city-not-found">
        <h1 className="font-display text-2xl font-bold">City not on Lumo yet.</h1>
        <Link to="/join" className="btn-lumo btn-lumo-primary btn-lumo-sm mt-6">See all cities</Link>
      </div>
    );
  }
  if (!city) return <div className="p-24 text-center text-neutral-500" data-testid="biz-loading">Loading…</div>;

  return (
    <div className="bg-white min-h-screen" data-testid={`page-business-${slug}`}>
      <Helmet>
        <title>{`List your ${city.city} business on Lumo, free`}</title>
        <meta name="description" content={`Small business owners in ${city.city}: list your services free, get booked by local customers and keep 90% of every job.`} />
      </Helmet>
      <section className="relative overflow-hidden bg-black text-white" data-testid="biz-hero">
        <img src={city.hero_image} alt={`Small business in ${city.city}`} className="absolute inset-0 w-full h-full object-cover opacity-50" data-testid="biz-hero-image" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-8 py-14 sm:py-24 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-mono uppercase tracking-widest" data-testid="biz-city-tag">
              <MapPin className="w-3.5 h-3.5" /> {city.city}{city.country_name ? `, ${city.country_name}` : ""}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.03] tracking-tight mt-6" data-testid="biz-headline">
              Get more local customers in {city.city}.
            </h1>
            {city.local_line && (
              <p dir={city.rtl ? "rtl" : "ltr"} className="mt-5 text-lg text-amber-300 max-w-xl" style={{ letterSpacing: "normal", fontFamily: "system-ui, sans-serif" }} data-testid="biz-local-line">{city.local_line}</p>
            )}
            <p className="mt-4 text-base sm:text-lg text-white/80 max-w-xl">
              Lumo puts your business in front of people nearby who are booking services right now. Free to list, keep 90%, no monthly fees.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-white/70" data-testid="biz-joined-count">
              <CalendarCheck className="w-4 h-4" /> {city.businesses_joined > 0 ? `${city.businesses_joined} ${city.city} ${city.businesses_joined === 1 ? "business has" : "businesses have"} signed up` : `Be one of the first ${city.city} businesses on Lumo`}
            </div>
          </div>
          <LeadForm city={city} onDone={onDone} />
        </div>
      </section>
      <Benefits city={city.city} />
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-20 text-sm text-neutral-600" data-testid="biz-footer-links">
        Looking for work instead? <Link to={`/join/${slug}`} className="underline font-medium text-black" data-testid="biz-worker-link">Join as a Lumo pro in {city.city}</Link>
      </section>
    </div>
  );
}
