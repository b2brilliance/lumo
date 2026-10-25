import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { personaFor } from "@/lib/persona";

function useUnreadMessages(user, pathname) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) { setN(0); return undefined; }
    let alive = true;
    const load = () => api.get("/me/badges").then(({ data }) => alive && setN(data.messages || 0)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [user, pathname]);
  return n;
}

function isActive(tab, pathname, tabs) {
  if (pathname === tab.to) return true;
  // Longest matching prefix wins so /seller/orders doesn't light up /seller too.
  const matches = tabs.filter((t) => t.to !== "/" && pathname.startsWith(t.to + "/"));
  const best = matches.sort((a, b) => b.to.length - a.to.length)[0];
  return best?.key === tab.key && !tabs.some((t) => t.to === pathname);
}

export default function MobileTabBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const unread = useUnreadMessages(user, pathname);
  const persona = personaFor(user);
  if (!user && (pathname === "/" || pathname.startsWith("/start") || pathname === "/signin" || pathname === "/register")) return null;
  const isRestaurant = user?.role === "restaurant";

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1100] bg-white/90 backdrop-blur-xl border-t border-slate-200 pb-[env(safe-area-inset-bottom)]" data-testid="mobile-tab-bar">
      <div className="grid grid-cols-5">
        {persona.tabs.map((tab) => {
          const active = isActive(tab, pathname, persona.tabs);
          const Icon = (isRestaurant && tab.RestaurantIcon) || tab.Icon;
          const label = (isRestaurant && tab.restaurantLabel) || tab.label;
          const to = tab.auth && !user ? `/signin?next=${encodeURIComponent(tab.to)}` : tab.to;
          const badge = tab.key === "messages" ? unread : 0;
          return (
            <Link
              key={tab.key}
              to={to}
              className={`relative flex flex-col items-center justify-center pt-2 pb-1.5 text-[10px] font-medium transition-colors active:scale-95 ${active ? "text-slate-900" : "text-slate-400"}`}
              data-testid={`tabbar-${tab.key}`}
            >
              <span className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors ${active ? "bg-slate-900/10" : ""}`}>
                <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
                {badge > 0 && (
                  <span className="absolute -top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center" data-testid="tabbar-messages-badge">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="mt-0.5 leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
