import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Home, Car, ShoppingBag, KeyRound, ArrowRight, Sparkles, Wallet, Camera, Globe, CheckCircle2 } from "lucide-react";

const SELLER_FAQ = [
  { q: "What can I list on Lumo?", a: "Anything you own that someone might want to buy or rent. Vacation homes, spare rooms, cars, trucks, RVs, tools, gear, party rentals, used items, collectibles, anything." },
  { q: "How much does it cost to list?", a: "Listing is free. Lumo only takes 10% when a transaction completes — that's roughly half of what Airbnb (14-20%) or Turo (15-40%) charge hosts." },
  { q: "How do I get paid?", a: "Payouts go directly to your bank via Stripe Connect within 24 hours of the booking starting or the item being delivered." },
  { q: "Is my listing protected?", a: "Yes. Renters pre-fund into escrow, ID verification is built in, and disputes are mediated by the Lumo support team." },
  { q: "Can I list in multiple categories?", a: "Absolutely. One account, multiple listings — list your house on Rentals, your truck on Auto Sales, your old camera in Community Market. All under one dashboard." },
];

export default function ListYourStuff() {
  return (
    <div className="bg-white">
      <Helmet>
        <title>Sell, Rent or Advertise on Lumo — Half the Fees of Airbnb & Turo</title>
        <meta name="description" content="List your home, car, vacation rental, gear, or anything you own — Lumo charges just 10%, half what Airbnb (14-20%) or Turo (15-40%) charge. Free to list, same-day payouts, escrow-protected payments." />
        <meta property="og:title" content="Sell, Rent or Advertise on Lumo — 10% Flat Fee" />
        <meta property="og:description" content="List rentals, cars, real estate, and items for sale. 10% flat fee — half what Airbnb or Turo charge." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://golumo.app/list-your-stuff" />
        <link rel="canonical" href="https://golumo.app/list-your-stuff" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "serviceType": "Listing & marketplace platform",
          "provider": { "@type": "Organization", "name": "Lumo", "url": "https://golumo.app" },
          "areaServed": "Worldwide",
          "offers": {
            "@type": "Offer",
            "name": "Listing fee",
            "description": "10% flat commission per completed transaction. Free to list.",
            "priceSpecification": { "@type": "PriceSpecification", "price": "10", "priceCurrency": "USD", "valueAddedTaxIncluded": false }
          },
        })}</script>
      </Helmet>

      {/* Hero */}
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-20">
          <div className="overline">Sell. Rent. Advertise.</div>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mt-3 max-w-4xl">
            Turn what you own into income.
          </h1>
          <p className="text-lg text-slate-600 mt-6 max-w-2xl leading-relaxed">
            List your vacation rental, car, real estate, or anything you own on Lumo for a flat <span className="font-bold text-slate-900">10%</span> fee — half what Airbnb (14–20%), Turo (15–40%) and Vrbo (15%+) charge. Free to list. Escrow-protected. Bank payouts in 24 hours.
          </p>
          <div className="mt-8 flex items-center gap-3 flex-wrap">
            <Link to="/register?role=seller" className="inline-flex items-center gap-2 bg-teal-700 text-white px-6 py-3 font-mono uppercase tracking-wider text-sm hover:bg-teal-800" data-testid="list-stuff-cta">
              Start listing — it&apos;s free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/stores" className="text-sm font-mono uppercase tracking-wider text-slate-600 hover:text-slate-900 underline">
              Browse the marketplace →
            </Link>
          </div>
        </div>
      </section>

      {/* Category grid — every listing surface */}
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <div className="overline">What can you list?</div>
          <h2 className="font-display text-4xl font-black tracking-tighter mt-2">Every kind of advertisement, in one place.</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
            {[
              { icon: KeyRound, label: "Vacation rentals", body: "Cabins, beach houses, apartments — like Airbnb, minus the 14–20% fee.", to: "/rentals/new" },
              { icon: Home, label: "Real estate", body: "Homes for sale or rent. Direct buyer/seller, no agent commission.", to: "/real-estate/new" },
              { icon: Car, label: "Auto sales & rentals", body: "Cars, trucks, RVs, boats, motorcycles — list once, reach buyers and renters.", to: "/autos/new" },
              { icon: ShoppingBag, label: "Community Market", body: "Anything else — gear, used items, party rentals, tools, collectibles.", to: "/marketplace/new" },
            ].map((c) => (
              <Link key={c.label} to={c.to} className="group bg-white p-6 hover:bg-slate-50 transition-colors flex flex-col" data-testid={`list-cat-${c.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                <c.icon className="w-6 h-6 text-teal-700" />
                <h3 className="font-display text-xl font-bold mt-4">{c.label}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed flex-1">{c.body}</p>
                <span className="text-xs font-mono uppercase tracking-wider text-teal-700 mt-4 inline-flex items-center gap-1">
                  List now <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Lumo */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <div className="overline">Why list on Lumo</div>
          <h2 className="font-display text-4xl font-black tracking-tighter mt-2">Lower fees. More categories. One inbox.</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            {[
              { icon: Wallet, title: "10% flat fee", body: "Half of Airbnb's 14–20%, a fraction of Turo's 15–40%. No subscriptions, no listing fees, no service fees stacked on the renter." },
              { icon: Sparkles, title: "Cross-category visibility", body: "Your listings appear across Marketplaces search and the right category page — one upload, multiple discovery surfaces." },
              { icon: Camera, title: "Built-in photo & AI helpers", body: "Drop in photos and Lumo writes a high-converting listing description in 8 languages. No copywriter required." },
              { icon: Globe, title: "Reach 34 languages", body: "Lumo auto-translates every listing for visitors browsing in their native language. Bigger audience, more bookings." },
              { icon: CheckCircle2, title: "Escrow + ID verification", body: "Renters pre-fund into Lumo's escrow. Lumo verifies IDs and handles dispute mediation. Your home, car, or item is safe." },
              { icon: Wallet, title: "24-hour payouts", body: "Money lands in your bank within 24 hours of booking start or item delivery. No 7-day holds." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white border border-slate-200 p-6">
                <Icon className="w-6 h-6 text-teal-700" />
                <h3 className="font-display text-xl font-bold mt-4">{title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-16">
          <h2 className="font-display text-4xl font-black tracking-tighter">Common questions</h2>
          <Helmet>
            <script type="application/ld+json">{JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": SELLER_FAQ.map((f) => ({
                "@type": "Question",
                "name": f.q,
                "acceptedAnswer": { "@type": "Answer", "text": f.a },
              })),
            })}</script>
          </Helmet>
          <div className="mt-8 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
            {SELLER_FAQ.map((f) => (
              <div key={f.q} className="py-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-display text-lg font-bold">{f.q}</h3>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-5xl md:text-6xl font-black tracking-tighter">Your asset deserves better than a 20% fee.</h2>
          <Link to="/register?role=seller" className="inline-flex items-center gap-2 bg-white text-slate-900 px-7 py-3 font-mono uppercase tracking-wider text-sm hover:bg-amber-300 mt-8" data-testid="list-stuff-cta-bottom">
            List your first item free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
