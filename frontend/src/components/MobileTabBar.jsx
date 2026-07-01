import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Briefcase, ShoppingBag, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

/* Uber-style persistent bottom bar on mobile — always visible so the four
 * primary actions are one tap away. Hidden on desktop (md+) where the
 * top NavBar covers everything.                                          */
const TABS = [
  { key: "search",     label: "Search",    to: "/",           Icon: Search },
  { key: "jobs",       label: "Jobs",      to: "/map",        Icon: Briefcase },
  { key: "market",     label: "Market",    to: "/stores",     Icon: ShoppingBag },
  { key: "me",         label: "Me",        to: "/customer",   Icon: User },
];

export default function MobileTabBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const meTarget = user
    ? ({
        provider:   "/provider",
        retailer:   "/retailer",
        restaurant: "/restaurant",
        admin:      "/admin",
      }[user.role] || "/customer")
    : "/signin";

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
      data-testid="mobile-tab-bar"
    >
      <div className="grid grid-cols-4">
        {TABS.map((t) => {
          const to = t.key === "me" ? meTarget : t.to;
          const isActive =
            (t.to === "/" && pathname === "/") ||
            (t.to !== "/" && pathname.startsWith(t.to)) ||
            (t.key === "me" && pathname.startsWith(meTarget));
          return (
            <Link
              key={t.key}
              to={to}
              className={`flex flex-col items-center justify-center py-2 text-[10px] font-mono uppercase tracking-wider ${
                isActive ? "text-teal-700" : "text-slate-500"
              } active:bg-slate-100`}
              data-testid={`tabbar-${t.key}`}
            >
              <t.Icon className={`w-5 h-5 ${isActive ? "text-teal-700" : "text-slate-500"}`} />
              <span className="mt-0.5">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
