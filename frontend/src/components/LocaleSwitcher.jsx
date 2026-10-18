import React, { useState, useRef, useEffect } from "react";
import { useLocale, COUNTRY_PROFILES } from "@/lib/locale";
import { ChevronDown, Globe, Check } from "lucide-react";

// Display ordering: keep US first, then English-first regions, then alphabetical
const COUNTRY_ORDER = Object.keys(COUNTRY_PROFILES).sort((a, b) => COUNTRY_PROFILES[a].name.localeCompare(COUNTRY_PROFILES[b].name));

export default function LocaleSwitcher() {
  const { country, profile, setCountryOverride, isAutoDetected } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (code) => {
    setCountryOverride(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative" data-testid="locale-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 border border-transparent hover:border-slate-200 text-sm font-mono text-slate-600 hover:text-slate-900 transition-colors"
        data-testid="locale-switcher-trigger"
        title={`${profile.name} · ${profile.currency}`}
      >
        <span className="text-base leading-none" data-no-i18n="true">{profile.flag}</span>
        <span className="hidden md:inline uppercase tracking-widest text-[11px]" data-no-i18n="true">{country}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="fixed left-2 right-2 top-14 mt-0 md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-72 bg-white border border-slate-200 shadow-xl z-50"
          data-testid="locale-switcher-menu"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="overline text-slate-500 flex items-center gap-1.5"><Globe className="w-3 h-3" />Language & currency</div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed" data-no-i18n="true">
              Prices auto-convert to your selected country&apos;s currency. Translations apply across the app.
            </p>
            {isAutoDetected && (
              <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-teal-700">Auto-detected</div>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {COUNTRY_ORDER.map((code) => {
              const p = COUNTRY_PROFILES[code];
              if (!p) return null;
              const active = code === country;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => pick(code)}
                  className={`w-full px-4 py-2 flex items-center gap-3 text-sm text-left hover:bg-slate-50 ${active ? "bg-slate-50" : ""}`}
                  data-testid={`locale-option-${code}`}
                >
                  <span className="text-lg leading-none" data-no-i18n="true">{p.flag}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-display font-bold text-slate-900 truncate" data-no-i18n="true">{p.name}</span>
                    <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-500" data-no-i18n="true">
                      {p.currency} · {p.lang}
                    </span>
                  </span>
                  {active && <Check className="w-4 h-4 text-teal-700 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          {!isAutoDetected && (
            <div className="border-t border-slate-100 px-4 py-2">
              <button
                type="button"
                onClick={() => { setCountryOverride(null); setOpen(false); }}
                className="text-[11px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-900"
                data-testid="locale-reset"
              >
                ↺ Reset to auto-detect
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
