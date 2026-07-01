// Locale + currency context for Lumo.
// - Auto-detects language from navigator.language and timezone.
// - Fetches live USD-based FX rates from the backend.
// - Exposes useLocale() and formatPrice(usdAmount) helpers.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { api } from "./api";

const LocaleContext = createContext(null);

// Country → { lang, currency, currencySymbol, name, flag, locale, taxRate, taxLabel }
// Languages MUST match SUPPORTED_LANGS in backend (server.py).
// Tax rates MUST mirror backend TAX_PROFILES — kept here for quick UI display
// before /i18n/tax responds.
export const COUNTRY_PROFILES = {
  US: { lang: "en",    currency: "USD", symbol: "$",   name: "United States",        flag: "🇺🇸", locale: "en-US",  taxRate: 0.08,  taxLabel: "Sales Tax" },
  GB: { lang: "en",    currency: "GBP", symbol: "£",   name: "United Kingdom",       flag: "🇬🇧", locale: "en-GB",  taxRate: 0.20,  taxLabel: "VAT" },
  CA: { lang: "en",    currency: "CAD", symbol: "CA$", name: "Canada",               flag: "🇨🇦", locale: "en-CA",  taxRate: 0.13,  taxLabel: "HST" },
  AU: { lang: "en",    currency: "AUD", symbol: "A$",  name: "Australia",            flag: "🇦🇺", locale: "en-AU",  taxRate: 0.10,  taxLabel: "GST" },
  IN: { lang: "hi",    currency: "INR", symbol: "₹",   name: "India",                flag: "🇮🇳", locale: "hi-IN",  taxRate: 0.18,  taxLabel: "GST" },
  DE: { lang: "de",    currency: "EUR", symbol: "€",   name: "Germany",              flag: "🇩🇪", locale: "de-DE",  taxRate: 0.19,  taxLabel: "MwSt." },
  FR: { lang: "fr",    currency: "EUR", symbol: "€",   name: "France",               flag: "🇫🇷", locale: "fr-FR",  taxRate: 0.20,  taxLabel: "TVA" },
  JP: { lang: "ja",    currency: "JPY", symbol: "¥",   name: "Japan",                flag: "🇯🇵", locale: "ja-JP",  taxRate: 0.10,  taxLabel: "消費税" },
  BR: { lang: "pt-BR", currency: "BRL", symbol: "R$",  name: "Brasil",               flag: "🇧🇷", locale: "pt-BR",  taxRate: 0.17,  taxLabel: "ICMS" },
  MX: { lang: "es",    currency: "MXN", symbol: "MX$", name: "México",               flag: "🇲🇽", locale: "es-MX",  taxRate: 0.16,  taxLabel: "IVA" },
  ES: { lang: "es",    currency: "EUR", symbol: "€",   name: "España",               flag: "🇪🇸", locale: "es-ES",  taxRate: 0.21,  taxLabel: "IVA" },
  NG: { lang: "en",    currency: "NGN", symbol: "₦",   name: "Nigeria",              flag: "🇳🇬", locale: "en-NG",  taxRate: 0.075, taxLabel: "VAT" },
  AE: { lang: "ar",    currency: "AED", symbol: "د.إ", name: "United Arab Emirates", flag: "🇦🇪", locale: "ar-AE",  taxRate: 0.05,  taxLabel: "VAT" },
  SG: { lang: "en",    currency: "SGD", symbol: "S$",  name: "Singapore",            flag: "🇸🇬", locale: "en-SG",  taxRate: 0.09,  taxLabel: "GST" },
  ZA: { lang: "en",    currency: "ZAR", symbol: "R",   name: "South Africa",         flag: "🇿🇦", locale: "en-ZA",  taxRate: 0.15,  taxLabel: "VAT" },
};

const TIMEZONE_TO_COUNTRY = {
  "America/Los_Angeles": "US", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Phoenix": "US",
  "Europe/London": "GB",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU", "Australia/Brisbane": "AU",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "Europe/Berlin": "DE", "Europe/Munich": "DE",
  "Europe/Paris": "FR",
  "Asia/Tokyo": "JP",
  "America/Sao_Paulo": "BR", "America/Recife": "BR", "America/Bahia": "BR", "America/Fortaleza": "BR",
  "America/Mexico_City": "MX", "America/Cancun": "MX", "America/Monterrey": "MX",
  "Europe/Madrid": "ES",
  "Africa/Lagos": "NG",
  "Asia/Dubai": "AE",
  "Asia/Singapore": "SG",
  "Africa/Johannesburg": "ZA",
};

function detectCountry() {
  // 1. Saved override
  const saved = localStorage.getItem("lumo_country_override");
  if (saved && COUNTRY_PROFILES[saved]) return { country: saved, source: "override" };
  // 2. Navigator language region (e.g. en-GB → GB)
  const navLang = (navigator.language || navigator.userLanguage || "").trim();
  if (navLang) {
    const parts = navLang.split("-");
    if (parts.length >= 2) {
      const c = parts[parts.length - 1].toUpperCase();
      if (COUNTRY_PROFILES[c]) return { country: c, source: "navigator" };
    }
  }
  // 3. Timezone heuristic
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_TO_COUNTRY[tz]) return { country: TIMEZONE_TO_COUNTRY[tz], source: "timezone" };
  } catch { /* ignore */ }
  return { country: "US", source: "default" };
}

export function LocaleProvider({ children }) {
  const initial = useMemo(() => detectCountry(), []);
  const [country, setCountry] = useState(initial.country);
  const profile = COUNTRY_PROFILES[country] || COUNTRY_PROFILES.US;
  const [rates, setRates] = useState({ USD: 1.0 });
  const [ratesLoaded, setRatesLoaded] = useState(false);
  // Independent language override. Lets a user pick (e.g.) Italian while
  // keeping USD pricing — decouples language from country.
  const [langOverride, setLangOverride] = useState(() => {
    return localStorage.getItem("lumo_lang_override") || null;
  });

  // Fetch live FX rates on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/i18n/fx");
        if (!cancelled) {
          setRates(data.rates || { USD: 1.0 });
          setRatesLoaded(true);
        }
      } catch {
        if (!cancelled) setRatesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setCountryOverride = useCallback((next) => {
    if (next && COUNTRY_PROFILES[next]) {
      localStorage.setItem("lumo_country_override", next);
      setCountry(next);
    } else {
      localStorage.removeItem("lumo_country_override");
      const fresh = detectCountry();
      setCountry(fresh.country);
    }
  }, []);

  const setLangOverrideValue = useCallback((next) => {
    if (next) {
      localStorage.setItem("lumo_lang_override", next);
      setLangOverride(next);
    } else {
      localStorage.removeItem("lumo_lang_override");
      setLangOverride(null);
    }
  }, []);

  // Convert USD → local currency
  const convert = useCallback((usdAmount) => {
    const rate = rates[profile.currency];
    if (!rate || !Number.isFinite(rate)) return null;
    return usdAmount * rate;
  }, [rates, profile.currency]);

  // Format a USD amount into a localized currency string (e.g. "₹2,083" or "$25.00")
  const formatPrice = useCallback((usdAmount, opts = {}) => {
    if (usdAmount == null || !Number.isFinite(Number(usdAmount))) return "";
    const usd = Number(usdAmount);
    const converted = convert(usd);
    if (converted == null) return `$${usd.toFixed(2)}`;
    // JPY/INR/NGN have no decimals in casual display
    const noDecimal = ["JPY", "INR", "NGN", "MXN"].includes(profile.currency) || opts.noDecimal;
    try {
      return new Intl.NumberFormat(profile.locale, {
        style: "currency",
        currency: profile.currency,
        maximumFractionDigits: noDecimal ? 0 : 2,
        minimumFractionDigits: noDecimal ? 0 : 2,
      }).format(converted);
    } catch {
      return `${profile.symbol}${noDecimal ? Math.round(converted) : converted.toFixed(2)}`;
    }
  }, [convert, profile.currency, profile.locale, profile.symbol]);

  const value = useMemo(() => ({
    country,
    profile,
    lang: langOverride || profile.lang,
    langOverride,
    isLangOverridden: !!langOverride,
    setLangOverride: setLangOverrideValue,
    currency: profile.currency,
    symbol: profile.symbol,
    locale: profile.locale,
    taxRate: profile.taxRate,
    taxLabel: profile.taxLabel,
    /**
     * Returns a breakdown for a checkout total (all amounts in USD).
     * Tax is computed on (item + delivery) and is collected 100% upfront
     * as part of the deposit, so Lumo never under-collects tax.
     */
    computeBreakdown: (itemUsd, deliveryUsd = 0) => {
      const subtotal = +(itemUsd + deliveryUsd).toFixed(2);
      const tax = +(subtotal * profile.taxRate).toFixed(2);
      const total = +(subtotal + tax).toFixed(2);
      const itemDeposit = +(itemUsd * 0.10).toFixed(2);
      const deliveryDeposit = +(deliveryUsd * 0.10).toFixed(2);
      const depositTotal = +(itemDeposit + deliveryDeposit + tax).toFixed(2);
      const remaining = +(subtotal - itemDeposit - deliveryDeposit).toFixed(2);
      return { subtotal, tax, total, itemDeposit, deliveryDeposit, depositTotal, remaining };
    },
    rates,
    ratesLoaded,
    setCountryOverride,
    convert,
    formatPrice,
    isAutoDetected: !localStorage.getItem("lumo_country_override"),
  }), [country, profile, rates, ratesLoaded, setCountryOverride, convert, formatPrice, langOverride, setLangOverrideValue]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
