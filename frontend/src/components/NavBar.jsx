import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LogOut, MapPin, Sparkles, Store, UtensilsCrossed, ShoppingBag, Briefcase, User, Wallet, Settings, MessageSquare, ShoppingCart, ChevronDown, KeyRound, Inbox, Home, Car, HardHat, Handshake } from "lucide-react";
import LocaleSwitcher from "@/components/LocaleSwitcher";

const MARKETPLACE_LINKS = [
  { to: "/marketplace",  label: "Marketplace",  icon: ShoppingBag,      blurb: "P2P listings, used goods, gear", testId: "nav-mp-marketplace" },
  { to: "/stores",       label: "Stores",       icon: Store,            blurb: "Retailers with inventory & delivery", testId: "nav-mp-stores" },
  { to: "/restaurants",  label: "Restaurants",  icon: UtensilsCrossed,  blurb: "Order food for delivery", testId: "nav-mp-restaurants" },
  { to: "/rentals",      label: "Rentals",      icon: KeyRound,         blurb: "Rent anything — homes, cars, venues, gear", testId: "nav-mp-rentals" },
  { to: "/real-estate",  label: "Real Estate",  icon: Home,             blurb: "Homes for sale and for rent", testId: "nav-mp-real-estate" },
  { to: "/autos",        label: "Auto Sales",   icon: Car,              blurb: "Cars, trucks, SUVs and EVs", testId: "nav-mp-autos" },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const { cart } = useCart() || { cart: { total_items: 0 } };
  const nav = useNavigate();
  const [mpOpen, setMpOpen] = useState(false);
  const mpRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (mpRef.current && !mpRef.current.contains(e.target)) setMpOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const roleLink = () => {
    if (!user || user === false) return null;
    if (user.role === "customer") return { to: "/customer", label: "Customer Hub", icon: User };
    if (user.role === "provider") return { to: "/provider", label: "Provider Hub", icon: Briefcase };
    if (user.role === "retailer") return { to: "/retailer", label: "Retailer Hub", icon: Store };
    if (user.role === "restaurant") return { to: "/restaurant", label: "Restaurant Hub", icon: UtensilsCrossed };
    return null;
  };
  const rl = roleLink();

  const linkClass = ({ isActive }) =>
    `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? "border-teal-700 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200" data-testid="nav-bar">
      <div className="max-w-screen-2xl mx-auto px-6 flex items-center gap-6 h-14">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
          <div className="w-7 h-7 bg-slate-900 text-white flex items-center justify-center font-display font-black text-sm">L</div>
          <span className="font-display font-bold text-lg tracking-tight">Lumo</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 h-full">
          <NavLink to="/map" className={linkClass} data-testid="nav-map"><MapPin className="inline w-3.5 h-3.5 mr-1" />Map</NavLink>
          {/* Marketplaces dropdown */}
          <div ref={mpRef} className="relative h-full flex items-center">
            <button
              onClick={() => setMpOpen((v) => !v)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${mpOpen ? "border-teal-700 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
              data-testid="nav-marketplaces-toggle"
              aria-expanded={mpOpen}
            >
              Marketplaces <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mpOpen ? "rotate-180" : ""}`} />
            </button>
            {mpOpen && (
              <div
                className="absolute left-0 top-full mt-0.5 w-80 bg-white border border-slate-200 shadow-2xl divide-y divide-slate-100 z-50"
                data-testid="nav-marketplaces-menu"
              >
                {MARKETPLACE_LINKS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link
                      key={m.to}
                      to={m.to}
                      onClick={() => setMpOpen(false)}
                      className="flex items-start gap-3 p-3 hover:bg-slate-50 transition-colors"
                      data-testid={m.testId}
                    >
                      <Icon className="w-5 h-5 text-teal-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-display font-bold text-slate-900">{m.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{m.blurb}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          {rl && <NavLink to={rl.to} className={linkClass} data-testid="nav-hub"><rl.icon className="inline w-3.5 h-3.5 mr-1" />{rl.label}</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          {user && user !== false ? (
            <>
              {user.role === "provider" && (
                <NavLink to="/wallet" className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1 border border-slate-200" data-testid="nav-wallet">
                  <Wallet className="inline w-3.5 h-3.5 mr-1" /> ${Number(user.wallet_balance || 0).toFixed(2)}
                </NavLink>
              )}
              <NavLink to="/chats" className="text-slate-500 hover:text-slate-900" data-testid="nav-chats" title="Messages"><MessageSquare className="w-4 h-4" /></NavLink>
              <NavLink to="/inquiries" className="text-slate-500 hover:text-slate-900" data-testid="nav-inquiries" title="Marketplace inquiries"><Home className="w-4 h-4" /></NavLink>
              <NavLink to="/rentals/inbox" className="text-slate-500 hover:text-slate-900" data-testid="nav-rental-inbox" title="Rental booking inbox"><Inbox className="w-4 h-4" /></NavLink>
              <NavLink to="/cart" className="relative text-slate-500 hover:text-slate-900" data-testid="nav-cart" title="Cart">
                <ShoppingCart className="w-4 h-4" />
                {cart && cart.total_items > 0 && (
                  <span data-no-i18n="true" data-testid="nav-cart-count" className="absolute -top-2 -right-2 bg-teal-700 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 leading-none rounded-full">
                    {cart.total_items}
                  </span>
                )}
              </NavLink>
              <NavLink to="/settings" className="text-slate-500 hover:text-slate-900" data-testid="nav-settings"><Settings className="w-4 h-4" /></NavLink>
              <span className="text-sm text-slate-700 hidden md:inline" data-testid="nav-user-name">{user.name}</span>
              <Button variant="ghost" size="sm" onClick={() => { logout(); nav("/"); }} data-testid="nav-logout">
                <LogOut className="w-3.5 h-3.5 mr-1" /> Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/signin"><Button variant="outline" size="sm" data-testid="nav-login">Sign in</Button></Link>
              <Link to="/signin"><Button size="sm" className="bg-slate-900 hover:bg-slate-800" data-testid="nav-register">Get started <Sparkles className="ml-1 w-3.5 h-3.5" /></Button></Link>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile sub-nav — three big sections explaining what each offers ── */}
      <div className="md:hidden border-t border-slate-200 bg-slate-50" data-testid="mobile-subnav">
        <div className="grid grid-cols-3 divide-x divide-slate-200">
          <MobileNavTile
            to="/provider"
            icon={HardHat}
            title="Find work"
            subtitle="Provider Hub"
            tint="amber"
            testId="mobile-nav-work"
          />
          <MarketplacesSheet />
          <MobileNavTile
            to="/customer"
            icon={Handshake}
            title="Hire & order"
            subtitle="Customer Hub"
            tint="teal"
            testId="mobile-nav-hire"
          />
        </div>
      </div>
    </header>
  );
}

// ── Mobile-only sub-nav helpers ─────────────────────────────────────────────
function MobileNavTile({ to, icon: Icon, title, subtitle, tint, testId }) {
  const tintColors = {
    amber: { bg: "hover:bg-amber-50", icon: "text-amber-700" },
    teal:  { bg: "hover:bg-teal-50",  icon: "text-teal-700" },
    blue:  { bg: "hover:bg-blue-50",  icon: "text-blue-700" },
  }[tint] || { bg: "hover:bg-slate-100", icon: "text-slate-700" };
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center py-3 px-2 text-center ${tintColors.bg} active:bg-slate-200 transition-colors`}
      data-testid={testId}
    >
      <Icon className={`w-5 h-5 mb-1 ${tintColors.icon}`} />
      <div className="font-display font-bold text-xs text-slate-900 leading-tight">{title}</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">{subtitle}</div>
    </Link>
  );
}

function MarketplacesSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex flex-col items-center justify-center py-3 px-2 text-center hover:bg-blue-50 active:bg-slate-200 transition-colors"
          data-testid="mobile-nav-shop"
        >
          <ShoppingBag className="w-5 h-5 mb-1 text-blue-700" />
          <div className="font-display font-bold text-xs text-slate-900 leading-tight">Shop &amp; browse</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">Marketplaces</div>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl overflow-y-auto" data-testid="mobile-marketplaces-sheet">
        <SheetHeader>
          <SheetTitle className="font-display tracking-tighter text-2xl">Marketplaces</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <Link
            to="/map"
            onClick={() => setOpen(false)}
            className="flex items-start gap-3 p-3 border border-slate-200 hover:border-teal-700 hover:bg-slate-50"
            data-testid="mobile-mp-map"
          >
            <MapPin className="w-5 h-5 text-teal-700 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-display font-bold text-slate-900">Live map</div>
              <div className="text-xs text-slate-500 mt-0.5">Every open job, pinned by category</div>
            </div>
          </Link>
          {MARKETPLACE_LINKS.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.to}
                to={m.to}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 p-3 border border-slate-200 hover:border-teal-700 hover:bg-slate-50"
                data-testid={`mobile-${m.testId}`}
              >
                <Icon className="w-5 h-5 text-teal-700 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-display font-bold text-slate-900">{m.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.blurb}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
