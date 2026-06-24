import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { LogOut, MapPin, Sparkles, Store, UtensilsCrossed, ShoppingBag, Briefcase, User, Wallet, Settings, MessageSquare, ShoppingCart } from "lucide-react";

export default function NavBar() {
  const { user, logout } = useAuth();
  const { cart } = useCart() || { cart: { total_items: 0 } };
  const nav = useNavigate();

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
      <div className="max-w-screen-2xl mx-auto px-6 flex items-center gap-8 h-14">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
          <div className="w-7 h-7 bg-slate-900 text-white flex items-center justify-center font-display font-black text-sm">L</div>
          <span className="font-display font-bold text-lg tracking-tight">Lumo</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 h-full">
          <NavLink to="/map" className={linkClass} data-testid="nav-map"><MapPin className="inline w-3.5 h-3.5 mr-1" />Map</NavLink>
          <NavLink to="/marketplace" className={linkClass} data-testid="nav-marketplace"><ShoppingBag className="inline w-3.5 h-3.5 mr-1" />Marketplace</NavLink>
          <NavLink to="/stores" className={linkClass} data-testid="nav-stores"><Store className="inline w-3.5 h-3.5 mr-1" />Stores</NavLink>
          <NavLink to="/restaurants" className={linkClass} data-testid="nav-restaurants"><UtensilsCrossed className="inline w-3.5 h-3.5 mr-1" />Restaurants</NavLink>
          {rl && <NavLink to={rl.to} className={linkClass} data-testid="nav-hub"><rl.icon className="inline w-3.5 h-3.5 mr-1" />{rl.label}</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user && user !== false ? (
            <>
              {user.role === "provider" && (
                <NavLink to="/wallet" className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1 border border-slate-200" data-testid="nav-wallet">
                  <Wallet className="inline w-3.5 h-3.5 mr-1" /> ${Number(user.wallet_balance || 0).toFixed(2)}
                </NavLink>
              )}
              <NavLink to="/chats" className="text-slate-500 hover:text-slate-900" data-testid="nav-chats" title="Messages"><MessageSquare className="w-4 h-4" /></NavLink>
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
              <Link to="/login"><Button variant="outline" size="sm" data-testid="nav-login">Sign in</Button></Link>
              <Link to="/register"><Button size="sm" className="bg-slate-900 hover:bg-slate-800" data-testid="nav-register">Get started <Sparkles className="ml-1 w-3.5 h-3.5" /></Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
