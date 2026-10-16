import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, ClipboardList, MessageCircle, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const HOME_FOR_ROLE = { provider: "/provider", admin: "/admin", retailer: "/retailer", restaurant: "/restaurant" };

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

export default function MobileTabBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const unread = useUnreadMessages(user, pathname);
  const home = (user && HOME_FOR_ROLE[user.role]) || "/";
  const gate = (to) => (user ? to : "/signin");

  const tabs = [
    { key: "home", label: "Home", to: home, Icon: Home, active: pathname === "/" || pathname === home },
    { key: "orders", label: "Orders", to: gate("/orders"), Icon: ClipboardList, active: pathname.startsWith("/orders") },
    { key: "messages", label: "Messages", to: gate("/messages"), Icon: MessageCircle, active: ["/messages", "/chats", "/inquiries"].some((p) => pathname.startsWith(p)), badge: unread },
    { key: "profile", label: "Profile", to: gate("/settings"), Icon: User, active: pathname.startsWith("/settings") },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1100] bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]" data-testid="mobile-tab-bar">
      <div className="grid grid-cols-4">
        {tabs.map(({ key, label, to, Icon, active, badge }) => (
          <Link
            key={key}
            to={to}
            className={`relative flex flex-col items-center justify-center py-2 text-[10px] font-mono uppercase tracking-wider transition-colors active:bg-slate-100 ${active ? "text-slate-900" : "text-slate-500"}`}
            data-testid={`tabbar-${key}`}
          >
            <span className="relative">
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center" data-testid="tabbar-messages-badge">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className="mt-0.5">{label}</span>
            {active && <span className="absolute top-0 inset-x-6 h-0.5 bg-slate-900" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}
