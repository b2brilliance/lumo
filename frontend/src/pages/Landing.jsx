import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, MapPin, ShoppingBag, Store, UtensilsCrossed, Briefcase, Wallet } from "lucide-react";

export default function Landing() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-slate-200 relative overflow-hidden">
        <div className="max-w-screen-2xl mx-auto px-6 py-20 grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7">
            <div className="overline text-teal-700">Lumo · everything local, everywhere remote</div>
            <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mt-4 leading-none">
              One hub for<br />
              <span className="text-red-600">deliveries</span>,{" "}
              <span className="text-blue-600">services</span>,<br />
              <span className="text-amber-600">digital</span> &{" "}
              <span className="text-teal-700">remote</span> work.
            </h1>
            <p className="text-lg text-slate-600 mt-6 max-w-xl leading-relaxed">
              Hire a courier, book a handyman, order from your favourite cafe, or pick up remote contracts. Lumo runs the marketplace, the map, and the money.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/register"><Button size="lg" className="bg-slate-900 hover:bg-slate-800" data-testid="hero-cta-register">Get started <ArrowUpRight className="ml-1 w-4 h-4" /></Button></Link>
              <Link to="/map"><Button size="lg" variant="outline" data-testid="hero-cta-map">Explore the map</Button></Link>
            </div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            {[
              { c: "#DC2626", k: "Delivery & P2P", v: "Items, courier, moving" },
              { c: "#2563EB", k: "Local Services", v: "Handyman, cleaning, pets" },
              { c: "#D97706", k: "Digital & Tech", v: "Dev, design, marketing" },
              { c: "#0F766E", k: "Remote Jobs", v: "Anywhere, anytime" },
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
        <div className="overline">How people use Lumo</div>
        <div className="mt-6 grid md:grid-cols-3 gap-px bg-slate-200">
          {[
            { icon: ShoppingBag, t: "Need something moved?", d: "Post a delivery request. Get matched with a courier nearby in minutes.", to: "/customer" },
            { icon: Store, t: "Shop your block.", d: "Browse local boutiques and restaurants. One checkout, 10% deposit, delivery handled.", to: "/stores" },
            { icon: Briefcase, t: "Get paid for what you do.", d: "Pick up local work or remote contracts. Set your rate by hour, day, week or flat.", to: "/provider" },
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
          <div className="overline">Payments, transparent.</div>
          <h2 className="font-display text-3xl font-bold mt-3 leading-tight">10% bundled deposit holds the deal.</h2>
          <p className="text-slate-600 mt-4 text-sm leading-relaxed">
            On every P2P order we collect a 10% deposit on the item and 10% of the delivery fee in one checkout. The deposit is held until the job ships. The remaining balance is paid via the app, card, or cash — whatever you and the provider agree to.
          </p>
        </div>
        <div className="md:col-span-8 grid grid-cols-2 gap-px bg-slate-200">
          {[
            { t: "Item deposit", v: "10%", d: "Held in escrow by Lumo until delivered." },
            { t: "Delivery deposit", v: "10%", d: "Bundled with item deposit, one checkout." },
            { t: "Remaining balance", v: "90%", d: "App, card, or cash — your terms." },
            { t: "Provider wallet", v: "$", d: "Credited on completion. Withdraw anytime.", icon: Wallet },
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
