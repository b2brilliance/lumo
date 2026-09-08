import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import {
  LogOut, MapPin, Sparkles, ShoppingBag, Briefcase, User,
  Wallet, Settings, MessageSquare, ShoppingCart, HardHat, ShieldCheck,
} from "lucide-react";
import LocaleSwitcher from "@/components/LocaleSwitcher";

/* NavBar — role-siloed navigation.
 *
 * After the Feb 2026 P2P-only pivot, every login type gets its OWN nav:
 *   • Guest      : browse services + market, sign in, get started
 *   • Customer   : services + market + orders + wallet
 *   • Provider   : jobs near you + provider hub + wallet
 *   • Admin      : admin console only
 *
 * A customer never sees provider links; a provider never sees customer
 * links. That intentional isolation keeps each user's experience simple
 * and prevents accidental role-crossing.
 */

// Nav-link definitions per role. Keys must match the `user.role` values.
const NAV_BY_ROLE = {
  guest: [
    { to: "/services",   label: "Services",   icon: Sparkles, testId: "nav-services" },
    { to: "/marketplace",label: "Marketplace",icon: ShoppingBag, testId: "nav-marketplace" },
    { to: "/for-providers", label: "Earn",    icon: HardHat, testId: "nav-earn" },
  ],
  customer: [
    { to: "/services",   label: "Services",   icon: Sparkles, testId: "nav-services" },
    { to: "/marketplace",label: "Marketplace",icon: ShoppingBag, testId: "nav-marketplace" },
    { to: "/customer",   label: "My orders",  icon: User,     testId: "nav-customer" },
  ],
  provider: [
    { to: "/map",        label: "Jobs near you", icon: MapPin, testId: "nav-map" },
    { to: "/provider",   label: "My dashboard",  icon: Briefcase, testId: "nav-provider" },
  ],
  admin: [
    { to: "/admin",      label: "Admin",      icon: ShieldCheck, testId: "nav-admin" },
  ],
};

function linkClass({ isActive }) {
  return `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
    isActive
      ? "border-teal-700 text-slate-900"
      : "border-transparent text-slate-500 hover:text-slate-900"
  }`;
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { cart } = useCart() || { cart: { total_items: 0 } };
  const nav = useNavigate();

  const role = user && user !== false ? user.role : "guest";
  // Legacy business roles map to a "read-only" nav (services only). They
  // still see a banner reminding them to re-register as a provider.
  const roleForNav = ["retailer", "restaurant"].includes(role) ? "guest" : role;
  const links = NAV_BY_ROLE[roleForNav] || NAV_BY_ROLE.guest;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200" data-testid="nav-bar">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-center gap-3 sm:gap-6 h-14">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0" data-testid="nav-logo">
          <div className="w-7 h-7 bg-slate-900 text-white flex items-center justify-center font-display font-black text-sm">L</div>
          <span className="font-display font-bold text-lg tracking-tight">Lumo</span>
        </Link>

        {/* Language / currency selector */}
        <div className="flex-shrink-0" data-testid="nav-locale-left"><LocaleSwitcher /></div>

        {/* Role-siloed primary nav */}
        <nav className="hidden md:flex items-center gap-1 h-full min-w-0 overflow-hidden" data-testid={`nav-${roleForNav}`}>
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} className={linkClass} data-testid={l.testId}>
                <Icon className="inline w-3.5 h-3.5 mr-1" />{l.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Right side — session controls */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {user && user !== false ? (
            <>
              {role === "provider" && (
                <NavLink to="/wallet" className="text-xs sm:text-sm text-slate-600 hover:text-slate-900 px-2 sm:px-3 py-1 border border-slate-200 whitespace-nowrap" data-testid="nav-wallet">
                  <Wallet className="inline w-3.5 h-3.5 mr-1" /> ${Number(user.wallet_balance || 0).toFixed(2)}
                </NavLink>
              )}
              {(role === "customer" || role === "provider") && (
                <NavLink to="/chats" className="text-slate-500 hover:text-slate-900 hidden lg:inline-flex" data-testid="nav-chats" title="Messages">
                  <MessageSquare className="w-4 h-4" />
                </NavLink>
              )}
              {role === "customer" && (
                <NavLink to="/cart" className="relative text-slate-500 hover:text-slate-900" data-testid="nav-cart" title="Cart">
                  <ShoppingCart className="w-4 h-4" />
                  {cart && cart.total_items > 0 && (
                    <span className="absolute -top-1 -right-1 bg-teal-700 text-white text-[9px] font-mono px-1 py-0 rounded-full min-w-[14px] text-center">
                      {cart.total_items}
                    </span>
                  )}
                </NavLink>
              )}
              <NavLink to="/settings" className="text-slate-500 hover:text-slate-900" data-testid="nav-settings"><Settings className="w-4 h-4" /></NavLink>
              <span className="text-sm text-slate-700 hidden xl:inline" data-testid="nav-user-name">{user.name}</span>
              <Button variant="ghost" size="sm" onClick={() => { logout(); nav("/"); }} data-testid="nav-logout" className="whitespace-nowrap">
                <LogOut className="w-3.5 h-3.5 mr-1" /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <>
              <Link to="/login"><Button variant="outline" size="sm" data-testid="nav-login" className="whitespace-nowrap">Sign in</Button></Link>
              <Link to="/register" className="hidden sm:block"><Button size="sm" className="bg-slate-900 hover:bg-slate-800 whitespace-nowrap" data-testid="nav-register">Get started <Sparkles className="ml-1 w-3.5 h-3.5" /></Button></Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile sub-nav — same role-siloed links but wrapped in tiles */}
      <div className="md:hidden border-t border-slate-200 bg-slate-50" data-testid="mobile-subnav">
        <div className="grid grid-cols-3 divide-x divide-slate-200">
          {links.slice(0, 3).map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="flex flex-col items-center justify-center py-3 px-2 text-center hover:bg-teal-50 active:bg-slate-200 transition-colors"
                data-testid={`mobile-${l.testId}`}
              >
                <Icon className="w-5 h-5 mb-1 text-teal-700" />
                <div className="font-display font-bold text-xs text-slate-900 leading-tight">{l.label}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
