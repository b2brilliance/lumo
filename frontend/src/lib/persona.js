import { useEffect, useState } from "react";
import {
  Home, Search, ClipboardList, MessageCircle, User, Briefcase, Map, Wallet,
  LayoutDashboard, UtensilsCrossed, Package, Compass, Heart, Building2, LifeBuoy,
} from "lucide-react";

export const PERSONAS = {
  customer: {
    key: "customer", label: "Customer", tagline: "Order food, shop and book local services.",
    roles: ["customer"], home: "/home", tint: "from-fuchsia-500 via-rose-500 to-amber-500",
    tabs: [
      { key: "home", label: "Home", to: "/home", Icon: Home, auth: true },
      { key: "search", label: "Search", to: "/app/search", Icon: Search },
      { key: "orders", label: "Orders", to: "/orders", Icon: ClipboardList, auth: true },
      { key: "messages", label: "Messages", to: "/messages", Icon: MessageCircle, auth: true },
      { key: "profile", label: "Profile", to: "/settings", Icon: User, auth: true },
    ],
  },
  provider: {
    key: "provider", label: "Worker", tagline: "Deliveries and service jobs near you. Keep 90%.",
    roles: ["provider"], home: "/provider", tint: "from-emerald-500 via-teal-600 to-cyan-700",
    tabs: [
      { key: "jobs", label: "Jobs", to: "/provider", Icon: Briefcase, auth: true },
      { key: "map", label: "Map", to: "/map", Icon: Map },
      { key: "earnings", label: "Earnings", to: "/wallet", Icon: Wallet, auth: true },
      { key: "messages", label: "Messages", to: "/messages", Icon: MessageCircle, auth: true },
      { key: "profile", label: "Profile", to: "/settings", Icon: User, auth: true },
    ],
  },
  seller: {
    key: "seller", label: "Seller", tagline: "Restaurants, food trucks, stores and personal shops.",
    roles: ["retailer", "restaurant"], home: "/seller", tint: "from-amber-500 via-orange-600 to-red-700",
    tabs: [
      { key: "dashboard", label: "Dashboard", to: "/seller", Icon: LayoutDashboard, auth: true },
      { key: "products", label: "Products", to: "/seller/products", Icon: Package, auth: true, restaurantLabel: "Menu", RestaurantIcon: UtensilsCrossed },
      { key: "orders", label: "Orders", to: "/seller/orders", Icon: ClipboardList, auth: true },
      { key: "messages", label: "Messages", to: "/messages", Icon: MessageCircle, auth: true },
      { key: "profile", label: "Profile", to: "/settings", Icon: User, auth: true },
    ],
  },
  real_estate: {
    key: "real_estate", label: "Real estate", tagline: "Buy, rent, sell or rent out a place.",
    roles: ["real_estate"], home: "/real-estate", tint: "from-indigo-600 via-blue-700 to-slate-900",
    tabs: [
      { key: "explore", label: "Explore", to: "/real-estate", Icon: Compass },
      { key: "saved", label: "Saved", to: "/real-estate/saved", Icon: Heart },
      { key: "listings", label: "My Listings", to: "/real-estate/mine", Icon: Building2, auth: true },
      { key: "messages", label: "Messages", to: "/inquiries", Icon: MessageCircle, auth: true },
      { key: "profile", label: "Profile", to: "/settings", Icon: User, auth: true },
    ],
  },
  admin: {
    key: "admin", label: "Admin", roles: ["admin"], home: "/admin",
    tabs: [
      { key: "home", label: "Admin", to: "/admin", Icon: LayoutDashboard, auth: true },
      { key: "orders", label: "Orders", to: "/orders", Icon: ClipboardList, auth: true },
      { key: "messages", label: "Messages", to: "/messages", Icon: MessageCircle, auth: true },
      { key: "help", label: "Help", to: "/help", Icon: LifeBuoy },
      { key: "profile", label: "Profile", to: "/settings", Icon: User, auth: true },
    ],
  },
};

export const SIGNUP_PERSONAS = ["customer", "provider", "seller", "real_estate"];
const KEY = "lumo_persona";

export function getChosenPersona() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setChosenPersona(key, sellerType) {
  try {
    localStorage.setItem(KEY, key);
    if (sellerType) localStorage.setItem("lumo_seller_type", sellerType);
  } catch { /* private mode */ }
}

// Role to send for brand-new Google/SMS sign-ups (providers sign up through the full wizard).
export function signupRole() {
  const p = getChosenPersona();
  if (p === "seller") {
    try { return localStorage.getItem("lumo_seller_type") === "restaurant" ? "restaurant" : "retailer"; } catch { return "retailer"; }
  }
  return p === "real_estate" ? "real_estate" : p === "customer" ? "customer" : null;
}

export function personaFor(user) {
  if (user && user !== false) {
    return Object.values(PERSONAS).find((p) => p.roles.includes(user.role)) || PERSONAS.customer;
  }
  return PERSONAS[getChosenPersona()] || PERSONAS.customer;
}

export function homeForRole(role) {
  return (Object.values(PERSONAS).find((p) => p.roles.includes(role)) || PERSONAS.customer).home;
}

// App layout = inside the native shell, or on a phone-sized browser.
export function useAppMode() {
  const query = "(max-width: 767px)";
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  const native = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return native || mobile;
}
