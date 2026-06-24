import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

export default function Directory({ role }) {
  const [stores, setStores] = useState([]);
  const isRestaurant = role === "restaurant";

  useEffect(() => {
    const url = isRestaurant ? "/restaurants" : "/stores";
    api.get(url).then(({ data }) => setStores(data));
  }, [isRestaurant]);

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="overline">{isRestaurant ? "Restaurants" : "Stores"} directory</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">
        {isRestaurant ? "Eat local." : "Shop local."}
      </h1>
      <p className="text-slate-600 mt-3 max-w-xl">
        {isRestaurant
          ? "Cafes, restaurants and food trucks on the Lumo network. One checkout. Delivery handled."
          : "Boutiques, shops, and storefronts on Lumo. Order, pay deposit, get it delivered."}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 mt-8 border border-slate-200" data-testid="store-grid">
        {stores.length === 0 && <div className="bg-white p-10 text-sm text-slate-500 col-span-full">No {isRestaurant ? "restaurants" : "stores"} yet.</div>}
        {stores.map((s) => {
          const sf = s.storefront || {};
          return (
            <Link
              key={s.id}
              to={`/${isRestaurant ? "restaurants" : "stores"}/${s.id}`}
              className="group bg-white hover:bg-slate-50 transition-colors flex flex-col"
              data-testid={`store-card-${s.id}`}
            >
              <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                {sf.logo_url && <img src={sf.logo_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
              </div>
              <div className="p-5 flex-1">
                <div className="overline">{isRestaurant ? sf.cuisine || "Food" : sf.category || "Retail"}</div>
                <div className="font-display text-xl font-bold mt-1">{sf.name || s.name}</div>
                <div className="text-xs text-slate-500 mt-2 font-mono">{sf.address}</div>
                {sf.hours && <div className="text-xs text-slate-500 font-mono">{sf.hours}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
