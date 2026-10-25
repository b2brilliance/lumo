import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, UtensilsCrossed, ShoppingBag, Wrench, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

const TILES = [
  { key: "food", to: "/app/market/food", title: "Order food", sub: "Restaurants and food trucks near you", Icon: UtensilsCrossed, tint: "from-orange-500 to-rose-600" },
  { key: "shop", to: "/app/market/products", title: "Shop products", sub: "Stores and personal shops, delivered", Icon: ShoppingBag, tint: "from-indigo-500 to-violet-700" },
  { key: "services", to: "/services", title: "Book a service", sub: "Cleaning, repairs, moving, delivery and more", Icon: Wrench, tint: "from-emerald-500 to-teal-700" },
];

export default function CustomerHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const first = (user?.name || "").split(" ")[0];

  return (
    <div className="px-4 pt-5 pb-6 max-w-xl mx-auto" data-testid="customer-home">
      <h1 className="font-display text-3xl font-black tracking-tight">{first ? `Hi ${first}.` : "Hi there."}</h1>
      <p className="text-slate-500 mt-1">What do you need today?</p>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/app/search?q=${encodeURIComponent(q.trim())}`); }} className="mt-5 relative" data-testid="customer-home-search">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search food, products, stores" className="w-full h-12 pl-12 pr-4 rounded-2xl bg-slate-100 text-[15px] focus:outline-none focus:ring-2 focus:ring-slate-900" data-testid="customer-home-search-input" />
      </form>
      <div className="mt-6 space-y-3">
        {TILES.map(({ key, to, title, sub, Icon, tint }, i) => (
          <motion.div key={key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Link to={to} className={`flex items-center gap-4 p-5 rounded-3xl bg-gradient-to-br ${tint} text-white active:scale-[0.98] transition-transform`} data-testid={`customer-tile-${key}`}>
              <span className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center"><Icon className="w-6 h-6" /></span>
              <span className="flex-1">
                <span className="block font-display font-bold text-xl leading-tight">{title}</span>
                <span className="block text-sm text-white/85 mt-0.5">{sub}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-white/80" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
