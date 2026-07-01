import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ArrowRight, MapPin, Briefcase, Sparkles, Store, KeyRound, Building2 } from "lucide-react";
import AffiliateBlock from "@/components/AffiliateBlock";
import { api } from "@/lib/api";

/* ── State / country-level SEO landing pages ─────────────────────────────
 * Deliberately kept separate from /cities/:slug which is CITY-level. States
 * and countries get their own hub so we can fan out to every city + every
 * service category inside that region. Big win for long-tail search.     */

const REGIONS = {
  // ── US STATES ─────────────────────────────────────────────────────────
  california: {
    kind: "state", country: "US",
    name: "California", label: "California",
    hero: "Local services, jobs & marketplace listings across California.",
    blurb: "From LA to San Francisco, San Diego to Sacramento — hire vetted providers, sell to your neighbors, or earn money on your schedule anywhere in the Golden State.",
    cities: [
      { slug: "los-angeles",  name: "Los Angeles" },
      { slug: "san-francisco",name: "San Francisco" },
      { slug: "san-diego",    name: "San Diego" },
    ],
    neighborhoods: ["San Jose", "Sacramento", "Oakland", "Fresno", "Long Beach", "Anaheim", "Bakersfield", "Riverside", "Stockton", "Irvine"],
    geo: { latitude: 36.7783, longitude: -119.4179 },
  },
  texas: {
    kind: "state", country: "US",
    name: "Texas", label: "Texas",
    hero: "Local services, jobs & marketplace listings across Texas.",
    blurb: "From Houston to Austin, Dallas to San Antonio — post a job, sell an item, or earn on demand across the Lone Star State.",
    cities: [
      { slug: "houston",     name: "Houston" },
      { slug: "dallas",      name: "Dallas" },
      { slug: "austin",      name: "Austin" },
      { slug: "san-antonio", name: "San Antonio" },
    ],
    neighborhoods: ["Fort Worth", "El Paso", "Arlington", "Corpus Christi", "Plano", "Lubbock", "Irving", "Laredo", "Frisco", "McKinney"],
    geo: { latitude: 31.9686, longitude: -99.9018 },
  },
  "new-york-state": {
    kind: "state", country: "US",
    name: "New York State", label: "New York",
    hero: "Local services, jobs & marketplace listings across New York.",
    blurb: "From New York City to Buffalo, Rochester to Albany — hire a pro, earn extra, or list your goods anywhere in NY State.",
    cities: [{ slug: "new-york", name: "New York City" }],
    neighborhoods: ["Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany", "New Rochelle", "Mount Vernon", "Schenectady", "Utica", "White Plains", "Hempstead", "Levittown"],
    geo: { latitude: 42.1657, longitude: -74.9481 },
  },
  nevada: {
    kind: "state", country: "US",
    name: "Nevada", label: "Nevada",
    hero: "Local services, jobs & marketplace listings across Nevada.",
    blurb: "From Las Vegas to Reno, Henderson to Carson City — book vetted help, sell to locals, or earn on Lumo statewide.",
    cities: [],
    neighborhoods: ["Las Vegas", "Reno", "Henderson", "North Las Vegas", "Sparks", "Carson City", "Fernley", "Elko", "Mesquite", "Boulder City"],
    geo: { latitude: 38.8026, longitude: -116.4194 },
  },
  // ── COUNTRIES (for country-level hubs alongside state pages) ──────────
  india: {
    kind: "country", country: "IN",
    name: "India", label: "India",
    hero: "Local services, jobs & marketplace listings across India.",
    blurb: "Post a job, hire a pro, buy or sell — Lumo covers Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad and every corner of India.",
    cities: [
      { slug: "delhi",     name: "Delhi" },
      { slug: "mumbai",    name: "Mumbai" },
      { slug: "bengaluru", name: "Bengaluru (Bangalore)" },
      { slug: "chennai",   name: "Chennai" },
      { slug: "kolkata",   name: "Kolkata" },
      { slug: "hyderabad", name: "Hyderabad" },
    ],
    neighborhoods: ["Pune", "Ahmedabad", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal", "Patna", "Vadodara", "Coimbatore", "Kochi"],
    geo: { latitude: 20.5937, longitude: 78.9629 },
  },
};

// Slug aliases so common misspellings & alt names still land on the page.
const ALIASES = {
  "new-york": "new-york-state",   // The city hub lives at /cities/new-york
  "ny":       "new-york-state",
  "cal":      "california",
  "cali":     "california",
  "ca":       "california",
  "tx":       "texas",
  "nv":       "nevada",
  "bangalore":"bengaluru",        // Redirect to city hub
};

// Public API — used by App.js and the sitemap generator.
export const REGION_KEYS = Object.keys(REGIONS);

const CATEGORIES = [
  { slug: "delivery",  label: "Delivery",  Icon: Briefcase },
  { slug: "cleaning",  label: "Cleaning",  Icon: Sparkles },
  { slug: "moving",    label: "Moving",    Icon: Briefcase },
  { slug: "handyman",  label: "Handyman",  Icon: Store },
  { slug: "pet_care",  label: "Pet care",  Icon: Briefcase },
  { slug: "personal_care", label: "Beauty",Icon: Sparkles },
  { slug: "it_support",label: "Tech help", Icon: Store },
  { slug: "notary",    label: "Notary",    Icon: Building2 },
];

export default function RegionHub() {
  const { slug = "" } = useParams();
  const aliased = ALIASES[slug];
  const key = aliased || slug;
  const region = REGIONS[key];

  const [externalJobs, setExternalJobs] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!region) { setExternalJobs([]); return; }
    (async () => {
      try {
        const { data } = await api.get("/jobs/external", { params: { country: region.name, limit: 8 } });
        if (alive) setExternalJobs(data?.jobs || []);
      } catch { if (alive) setExternalJobs([]); }
    })();
    return () => { alive = false; };
  }, [region]);

  const canonical = useMemo(() => `https://golumo.app/regions/${key}`, [key]);

  // Route aliases: bangalore → /cities/bengaluru (existing city hub)
  if (aliased && aliased.startsWith("bengaluru")) {
    return <Navigate to={`/cities/${aliased}`} replace />;
  }

  if (!region) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="font-display text-3xl font-bold">Region not found</h1>
        <p className="text-slate-600 mt-2">
          We don&apos;t have a hub for &ldquo;{slug}&rdquo;. Try <Link to="/cities" className="text-teal-700 underline">all cities</Link> or one of these:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {REGION_KEYS.map((k) => (
            <li key={k}><Link to={`/regions/${k}`} className="text-teal-700 hover:underline">{REGIONS[k].label}</Link></li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen" data-testid={`region-hub-${key}`}>
      <Helmet>
        <title>{`Lumo ${region.label} — local services, jobs & marketplace`}</title>
        <meta name="description" content={`${region.blurb} Hire vetted providers, sell, rent, or earn on demand.`} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={`Lumo ${region.label} — local services & jobs`} />
        <meta property="og:description" content={region.blurb} />
        <meta property="og:url" content={canonical} />
        {/* Geo signals so Google associates the page with the region.  */}
        <meta name="geo.region" content={`${region.country}${region.kind === "state" ? "-" + regionCodeFor(key) : ""}`} />
        <meta name="geo.placename" content={region.name} />
        <meta name="geo.position" content={`${region.geo.latitude};${region.geo.longitude}`} />
        <meta name="ICBM" content={`${region.geo.latitude}, ${region.geo.longitude}`} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home",   "item": "https://golumo.app/" },
            { "@type": "ListItem", "position": 2, "name": "Regions","item": "https://golumo.app/regions" },
            { "@type": "ListItem", "position": 3, "name": region.label, "item": canonical },
          ],
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": region.kind === "country" ? "Country" : "State",
          "name": region.name,
          "containsPlace": (region.cities || []).map((c) => c.name),
          "geo": { "@type": "GeoCoordinates", "latitude": region.geo.latitude, "longitude": region.geo.longitude },
        })}</script>
      </Helmet>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <div className="overline inline-flex items-center gap-2"><MapPin className="w-3 h-3" /> {region.kind === "country" ? "Country hub" : "State hub"}</div>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tighter mt-3">
            Lumo {region.label}.
          </h1>
          <p className="text-lg text-slate-600 mt-4 max-w-2xl leading-relaxed">{region.blurb}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/" className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 font-mono uppercase tracking-wider text-xs hover:bg-teal-700" data-testid="region-post-cta">
              Post a request <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link to="/become-a-provider" className="inline-flex items-center gap-2 border border-slate-300 px-5 py-2.5 font-mono uppercase tracking-wider text-xs hover:bg-slate-50" data-testid="region-earn-cta">
              Earn in {region.label}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Services × region — funnels users into the ordering pages ── */}
      <section className="border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
          <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tighter">Order help across {region.label}</h2>
          <p className="text-sm text-slate-600 mt-1">One-tap service requests. Providers respond in minutes.</p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
            {CATEGORIES.map((c) => (
              <Link key={c.slug} to={`/order/${c.slug}`}
                className="bg-white p-4 hover:bg-teal-50 transition-colors"
                data-testid={`region-service-${c.slug}`}
              >
                <c.Icon className="w-5 h-5 text-slate-700" />
                <div className="text-sm font-display font-bold mt-2">{c.label}</div>
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-1">
                  Available in {region.label}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cities inside the region ────────────────────────────── */}
      {region.cities && region.cities.length > 0 && (
        <section className="border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tighter">Cities in {region.label}</h2>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
              {region.cities.map((c) => (
                <Link key={c.slug} to={`/cities/${c.slug}`}
                  className="bg-white p-4 hover:bg-slate-50 transition-colors group"
                  data-testid={`region-city-${c.slug}`}
                >
                  <div className="font-display font-bold text-base">{c.name}</div>
                  <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mt-1 inline-flex items-center gap-1">
                    Open hub <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Neighbourhoods / cities we also serve (SEO long-tail) ── */}
      {region.neighborhoods && region.neighborhoods.length > 0 && (
        <section className="border-b border-slate-200 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
            <div className="overline">Also serving</div>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              {region.neighborhoods.join(" · ")}
            </p>
          </div>
        </section>
      )}

      {/* ── External jobs in this region (auto-filtered) ────────── */}
      {externalJobs.length > 0 && (
        <section className="border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex items-center justify-between">
              <div>
                <div className="overline">Featured</div>
                <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tighter mt-1">Open jobs in {region.label}</h2>
              </div>
              <Link to="/remote-jobs" className="text-xs font-mono uppercase tracking-wider text-teal-700 hover:underline">
                See all →
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {externalJobs.map((j) => (
                <a key={j.id} href={j.apply_url} target="_blank" rel="nofollow noopener noreferrer"
                  className="block border border-slate-200 hover:border-slate-900 p-3 bg-white group"
                  data-testid={`region-ext-job-${j.id}`}
                >
                  <div className="font-display font-bold text-sm group-hover:text-teal-700">{j.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {j.customer_name} · {j.location_text || "Remote"} · ${Math.round(j.pay_rate || 0).toLocaleString()}/yr
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Affiliate partners — filtered by country. */}
      <AffiliateBlock category="global" title={`Recommended partners for ${region.label}`} subtitle="Cashback, insurance, travel and more." />
    </div>
  );
}


// Maps our region slugs to ISO 3166-2 sub-region codes for geo meta.
function regionCodeFor(key) {
  return ({
    california: "CA",
    texas:      "TX",
    "new-york-state": "NY",
    nevada:     "NV",
  })[key] || "";
}
