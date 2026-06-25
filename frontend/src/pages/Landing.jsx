import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ShoppingBag, Store, Briefcase, Wallet } from "lucide-react";

export default function Landing() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-slate-200 relative overflow-hidden">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7">
            <div className="overline text-teal-700">Lumo</div>
            <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mt-4 leading-none">
              Local <span className="text-red-600">deliveries</span>,<br />
              everyday <span className="text-blue-600">services</span>,<br />
              <span className="text-amber-600">digital</span> &amp; <span className="text-teal-700">remote</span> work —<br />
              in one place.
            </h1>
            <p className="text-lg text-slate-600 mt-6 max-w-xl leading-relaxed">
              Lumo connects customers with trusted providers for everything from package delivery and home services to retail orders and remote contracts. Post a request, review quotes, and pay safely — all in one app.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/signin"><Button size="lg" className="bg-slate-900 hover:bg-slate-800" data-testid="hero-cta-register">Create an account <ArrowUpRight className="ml-1 w-4 h-4" /></Button></Link>
              <Link to="/map"><Button size="lg" variant="outline" data-testid="hero-cta-map">Browse open jobs</Button></Link>
            </div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            {[
              { c: "#DC2626", k: "Delivery", v: "Couriers & moving" },
              { c: "#2563EB", k: "Local services", v: "Home, auto, pets" },
              { c: "#D97706", k: "Digital & tech", v: "Builds & creative" },
              { c: "#0F766E", k: "Remote work", v: "Anywhere, anytime" },
            ].map((t) => (
              <div key={t.k} className="border border-slate-200 p-5" data-testid={`hero-tile-${t.k}`}>
                <div className="w-3 h-3 rounded-full" style={{ background: t.c }} />
                <div className="font-display font-bold mt-4">{t.k}</div>
                <div className="text-xs text-slate-500 mt-1 font-mono uppercase tracking-wider">{t.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="max-w-screen-2xl mx-auto px-6 py-16 border-b border-slate-200">
        <div className="overline">How Lumo works</div>
        <div className="mt-6 grid md:grid-cols-3 gap-px bg-slate-200">
          {[
            { icon: ShoppingBag, t: "Request a service.", d: "Tell us what you need — delivery, a home service, or a remote project. Add a photo, set your budget, and we will match you with nearby providers.", to: "/customer" },
            { icon: Store, t: "Shop your neighborhood.", d: "Order from local stores and restaurants in one place. Pay a small deposit at checkout and we will arrange delivery for you.", to: "/stores" },
            { icon: Briefcase, t: "Earn on your schedule.", d: "Providers accept jobs in their area or send a counter-offer with their own rate. Pick the work that fits — by the hour, day, week, or flat fee.", to: "/provider" },
          ].map((u) => (
            <Link key={u.t} to={u.to} className="bg-white p-8 hover:bg-slate-50" data-testid={`usecase-${u.t}`}>
              <u.icon className="w-5 h-5 text-teal-700" />
              <div className="font-display text-xl font-bold mt-4">{u.t}</div>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{u.d}</p>
              <div className="overline mt-6 flex items-center gap-1">Open <ArrowUpRight className="w-3 h-3" /></div>
            </Link>
          ))}
        </div>
      </section>

      {/* How payments work */}
      <section className="max-w-screen-2xl mx-auto px-6 py-16 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-4">
          <div className="overline">Payments, made simple.</div>
          <h2 className="font-display text-3xl font-bold mt-3 leading-tight">A small deposit holds every order.</h2>
          <p className="text-slate-600 mt-4 text-sm leading-relaxed">
            For peer-to-peer orders, customers pay a 10% deposit on the item and 10% of the delivery fee at checkout. Lumo holds the deposit until the work is done. The remaining balance can be paid through the app, by card, or in cash — whichever you and your provider agree to up front.
          </p>
        </div>
        <div className="md:col-span-8 grid grid-cols-2 gap-px bg-slate-200">
          {[
            { t: "Item deposit", v: "10%", d: "Held by Lumo until the order is delivered." },
            { t: "Delivery deposit", v: "10%", d: "Bundled with the item deposit in one checkout." },
            { t: "Remaining balance", v: "90%", d: "Pay via app, card, or cash — your terms." },
            { t: "Provider wallet", v: "$", d: "Funds land in an in-app balance. Withdraw any time.", icon: Wallet },
          ].map((p) => (
            <div key={p.t} className="bg-white p-6">
              <div className="overline">{p.t}</div>
              <div className="font-display text-4xl font-black mt-2">{p.v}</div>
              <div className="text-xs text-slate-500 mt-2">{p.d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
