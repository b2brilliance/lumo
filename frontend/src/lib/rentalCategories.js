// Rental category taxonomy (kept in sync with backend RENTAL_TAXONOMY).
// Mirrors the per-category filter fields so we can render the right UI on
// the browse + listing-create pages.
import {
  Home, Building, Car, Wrench, Camera, Tent, Sofa, HeartPulse, PartyPopper, Package, Construction,
} from "lucide-react";

export const RENTAL_CATEGORIES = {
  property:              { label: "Property & Stays",                icon: Home,         color: "bg-rose-100 text-rose-900 border-rose-200",       accent: "rose",    blurb: "Vacation homes, apartments, commercial space, workspaces, parking" },
  venues:                { label: "Venues",                          icon: Building,     color: "bg-violet-100 text-violet-900 border-violet-200", accent: "violet",  blurb: "Banquet halls, wedding venues, studios, galleries, rooftops" },
  vehicles:              { label: "Vehicles",                        icon: Car,          color: "bg-blue-100 text-blue-900 border-blue-200",       accent: "blue",    blurb: "Cars, RVs, boats, motorcycles, bikes" },
  tools_equipment:       { label: "Tools & Equipment",               icon: Wrench,       color: "bg-amber-100 text-amber-900 border-amber-200",    accent: "amber",   blurb: "Hand tools, power tools, construction, generators, farm machinery" },
  photo_av:              { label: "Photo, Video & AV",               icon: Camera,       color: "bg-indigo-100 text-indigo-900 border-indigo-200", accent: "indigo",  blurb: "Cameras, lenses, lighting, audio, projectors, drones" },
  outdoor_sports:        { label: "Outdoor & Sports",                icon: Tent,         color: "bg-emerald-100 text-emerald-900 border-emerald-200", accent: "emerald", blurb: "Camping, water sports, ski/snowboard, bikes, sports gear" },
  furniture_appliances:  { label: "Furniture, Appliances & Electronics", icon: Sofa,     color: "bg-slate-100 text-slate-900 border-slate-200",     accent: "slate",   blurb: "Sofas, dining sets, appliances, TVs, gaming consoles" },
  medical_mobility:      { label: "Medical, Mobility & Baby",        icon: HeartPulse,   color: "bg-red-100 text-red-900 border-red-200",          accent: "red",     blurb: "Wheelchairs, hospital beds, mobility scooters, baby gear" },
  events_weddings:       { label: "Events, Parties & Weddings",      icon: PartyPopper,  color: "bg-pink-100 text-pink-900 border-pink-200",       accent: "pink",    blurb: "Tents, chairs, linens, lighting, formal wear, costumes" },
  storage_containers:    { label: "Storage & Containers",            icon: Package,      color: "bg-stone-100 text-stone-900 border-stone-200",    accent: "stone",   blurb: "Self-storage, shipping containers, dumpsters" },
  site_services:         { label: "Site Services",                   icon: Construction, color: "bg-yellow-100 text-yellow-900 border-yellow-200", accent: "yellow",  blurb: "Portable toilets, on-site generators, fencing, light towers" },
};

export const RENTAL_PRICING_UNITS = ["hourly", "daily", "weekly", "monthly", "weekend"];
export const RENTAL_PRICING_LABEL = { hourly: "/hr", daily: "/day", weekly: "/wk", monthly: "/mo", weekend: "/weekend" };
