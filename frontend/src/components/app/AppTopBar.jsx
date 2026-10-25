import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, UserCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { personaFor } from "@/lib/persona";

const TITLES = {
  "/for-you": "Home", "/home": "Home", "/app/search": "Search", "/services": "Services", "/orders": "Orders", "/messages": "Messages", "/chats": "Messages",
  "/provider/setup": "Worker profile", "/seller/setup": "Set up your store",
  "/settings": "Profile", "/provider": "Jobs", "/map": "Map", "/wallet": "Earnings", "/seller": "Dashboard",
  "/seller/products": "Products", "/seller/orders": "Orders", "/real-estate": "Explore", "/real-estate/saved": "Saved",
  "/real-estate/mine": "My Listings", "/inquiries": "Messages", "/admin": "Admin", "/help": "Help",
  "/signin": "Sign in", "/register": "Create account", "/cart": "Cart",
};

export default function AppTopBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  const persona = personaFor(user);
  const isTabRoot = !!persona?.tabs.some((t) => t.to === pathname);
  const isRestaurant = user?.role === "restaurant";
  const title = pathname === "/seller/products" && isRestaurant ? "Menu" : TITLES[pathname] || "Lumo";
  if (pathname === "/" || pathname.startsWith("/start")) return null;

  return (
    <header className="md:hidden sticky top-0 z-[1090] bg-white/90 backdrop-blur-xl border-b border-slate-100 pt-[env(safe-area-inset-top)]" data-testid="app-top-bar">
      <div className="h-12 px-2 grid grid-cols-[48px_1fr_48px] items-center">
        {isTabRoot ? (
          <Link to="/" className="font-display font-black text-lg tracking-tight pl-2" data-testid="app-top-logo">Lumo</Link>
        ) : (
          <button onClick={() => (window.history.length > 1 ? nav(-1) : nav(persona?.home || "/"))} className="w-10 h-10 flex items-center justify-center rounded-full active:bg-slate-100" aria-label="Back" data-testid="app-top-back">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="text-center font-semibold text-[15px] truncate" data-testid="app-top-title">{title}</div>
        <Link to={user ? "/settings" : "/signin"} className="w-10 h-10 justify-self-end flex items-center justify-center rounded-full active:bg-slate-100" data-testid="app-top-account">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" /> : <UserCircle2 className="w-6 h-6 text-slate-500" />}
        </Link>
      </div>
    </header>
  );
}
