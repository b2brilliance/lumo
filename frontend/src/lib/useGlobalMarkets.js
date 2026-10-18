import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { COUNTRY_PROFILES } from "@/lib/locale";

let cache = null;

export function useGlobalMarkets() {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (cache) return;
    api.get("/global/markets").then(({ data: d }) => { cache = d; setData(d); }).catch(() => {});
  }, []);
  return data;
}

export const flagOf = (code) => COUNTRY_PROFILES[code]?.flag || "";

export const VERTICAL_LINKS = {
  services: (city) => [{ label: "Book a service", to: "/for-you" }, { label: "Browse pros", to: "/providers" }],
  jobs: (city) => [{ label: "Jobs near you", to: "/map" }, { label: "Start earning", to: "/become-a-provider" }, { label: "Remote jobs", to: "/remote-jobs" }],
  rentals: (city) => [{ label: `Rentals in ${city}`, to: `/real-estate?kind=rent&q=${encodeURIComponent(city)}&place=${encodeURIComponent(city)}` }, { label: "Rent gear & vehicles", to: "/rentals" }, { label: "Short stays", to: `/real-estate?kind=short_stay&q=${encodeURIComponent(city)}&place=${encodeURIComponent(city)}` }],
  homes: (city) => [{ label: `Homes in ${city}`, to: `/real-estate?kind=sale&q=${encodeURIComponent(city)}&place=${encodeURIComponent(city)}` }, { label: "List a property", to: "/real-estate/list" }],
  marketplace: (city) => [{ label: "Shop the market", to: "/marketplace" }, { label: "Sell something", to: "/marketplace" }, { label: "Cars for sale", to: "/autos" }],
};

export const VERTICAL_TITLE = {
  services: (c) => `Local services in ${c}`,
  jobs: (c) => `Jobs & gigs in ${c}`,
  rentals: (c) => `Rentals in ${c}`,
  homes: (c) => `Homes for sale in ${c}`,
  marketplace: (c) => `Buy & sell in ${c}`,
};
