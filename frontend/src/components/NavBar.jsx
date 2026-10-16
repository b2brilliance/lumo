import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import {
  LogOut, MapPin, Sparkles, ShoppingBag, Briefcase, User,
  Wallet, Settings, MessageSquare, ShoppingCart, HardHat, ShieldCheck, Store, LifeBuoy,
} from "lucide-react";
const HELP_LINK = { to: "/help", label: "Help", icon: LifeBuoy, testId: "nav-help" };
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
    { to: "/shop",       label: "Shop",       icon: Store, testId: "nav-shop" },
    { to: "/for-providers", label: "Earn",    icon: HardHat, testId: "nav-earn" },
    HELP_LINK,
  ],
  customer: [
    { to: "/services",   label: "Services",   icon: Sparkles, testId: "nav-services" },
    { to: "/marketplace",label: "Marketplace",icon: ShoppingBag, testId: "nav-marketplace" },
    { to: "/shop",       label: "Shop",       icon: Store, testId: "nav-shop" },
    { to: "/orders",     label: "My orders",  icon: User,     testId: "nav-customer" },
    HELP_LINK,
  ],
  provider: [
    { to: "/map",        label: "Jobs near you", icon: MapPin, testId: "nav-map" },
    { to: "/provider",   label: "My dashboard",  icon: Briefcase, testId: "nav-provider" },
    HELP_LINK,
  ],
  admin: [
    { to: "/admin",      label: "Admin",      icon: ShieldCheck, testId: "nav-admin" },
    HELP_LINK,
  ],
};

function linkClass({ isActive }) {
  return `px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "text-black"
      : "text-neutral-500 hover:text-black"
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
    <header className="sticky top-0 z-40 nav-glass border-b border-neutral-200" data-testid="nav-bar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-6 h-16">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0" data-testid="nav-logo">
          <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-display font-bold text-base rounded-full">L</div>
          <span className="font-display font-bold text-xl tracking-tight text-black">Lumo</span>
        </Link>

        {/* Language / currency selector — subtle in the new palette */}
        <div className="flex-shrink-0 hidden lg:block" data-testid="nav-locale-left"><LocaleSwitcher /></div>

        {/* Role-siloed primary nav */}
        <nav className="hidden md:flex items-center gap-1 h-full min-w-0 overflow-hidden" data-testid={`nav-links-${roleForNav}`}>
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} className={linkClass} data-testid={l.testId}>
                <Icon className="inline w-4 h-4 mr-1.5" strokeWidth={2} />{l.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Right side — session controls */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {user && user !== false ? (
            <>
              {role === "provider" && (
                <NavLink to="/wallet" className="text-xs sm:text-sm text-neutral-700 hover:text-black px-3 py-1.5 border border-neutral-200 rounded-full whitespace-nowrap font-medium hover:border-black transition-colors" data-testid="nav-wallet">
                  <Wallet className="inline w-3.5 h-3.5 mr-1" /> ${Number(user.wallet_balance || 0).toFixed(2)}
                </NavLink>
              )}
              {(role === "customer" || role === "provider") && (
                <NavLink to="/chats" className="text-neutral-500 hover:text-black p-2 hidden lg:inline-flex rounded-full hover:bg-neutral-100 transition-colors" data-testid="nav-chats" title="Messages">
                  <MessageSquare className="w-4 h-4" />
                </NavLink>
              )}
              {role === "customer" && (
                <NavLink to="/cart" className="relative text-neutral-500 hover:text-black p-2 rounded-full hover:bg-neutral-100 transition-colors" data-testid="nav-cart" title="Cart">
                  <ShoppingCart className="w-4 h-4" />
                  {cart && cart.total_items > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-[#276EF1] text-white text-[9px] font-mono px-1 py-0 rounded-full min-w-[16px] text-center font-semibold">
                      {cart.total_items}
                    </span>
                  )}
                </NavLink>
              )}
              <NavLink to="/settings" className="text-neutral-500 hover:text-black p-2 rounded-full hover:bg-neutral-100 transition-colors" data-testid="nav-settings"><Settings className="w-4 h-4" /></NavLink>
              <button onClick={() => { logout(); nav("/"); }} data-testid="nav-logout" className="btn-lumo btn-lumo-ghost">
                <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="btn-lumo btn-lumo-ghost">Sign in</Link>
              <Link to="/register" className="hidden sm:block" data-testid="nav-register">
                <span className="btn-lumo btn-lumo-primary btn-lumo-sm">Get started</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile sub-nav — same role-siloed links wrapped in tiles */}
      <div className="md:hidden border-t border-neutral-200 bg-white" data-testid="mobile-subnav">
        <div className="grid grid-cols-3 divide-x divide-neutral-200">
          {links.slice(0, 3).map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="flex flex-col items-center justify-center py-3 px-2 text-center hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                data-testid={`mobile-${l.testId}`}
              >
                <Icon className="w-5 h-5 mb-1 text-black" strokeWidth={2} />
                <div className="font-display font-semibold text-xs text-black leading-tight">{l.label}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
