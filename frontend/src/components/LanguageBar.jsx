import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/locale";
import { Languages, Check } from "lucide-react";

// Flag + short uppercase code per language. Flag picks the most-recognized
// country for that language; code is the iso-639 root upper-cased so the
// pill stays compact (3-4 chars max).
const LANG_META = {
  "en":    { flag: "🇺🇸", code: "EN" },
  "es":    { flag: "🇪🇸", code: "ES" },
  "fr":    { flag: "🇫🇷", code: "FR" },
  "fr-CA": { flag: "🇨🇦", code: "FR-CA" },
  "de":    { flag: "🇩🇪", code: "DE" },
  "pt":    { flag: "🇵🇹", code: "PT" },
  "pt-BR": { flag: "🇧🇷", code: "PT-BR" },
  "it":    { flag: "🇮🇹", code: "IT" },
  "nl":    { flag: "🇳🇱", code: "NL" },
  "pl":    { flag: "🇵🇱", code: "PL" },
  "ru":    { flag: "🇷🇺", code: "RU" },
  "uk":    { flag: "🇺🇦", code: "UK" },
  "tr":    { flag: "🇹🇷", code: "TR" },
  "sv":    { flag: "🇸🇪", code: "SV" },
  "ja":    { flag: "🇯🇵", code: "JA" },
  "ko":    { flag: "🇰🇷", code: "KO" },
  "zh":    { flag: "🇨🇳", code: "ZH" },
  "zh-TW": { flag: "🇹🇼", code: "ZH-TW" },
  "hi":    { flag: "🇮🇳", code: "HI" },
  "bn":    { flag: "🇧🇩", code: "BN" },
  "ur":    { flag: "🇵🇰", code: "UR" },
  "ar":    { flag: "🇸🇦", code: "AR" },
  "he":    { flag: "🇮🇱", code: "HE" },
  "fa":    { flag: "🇮🇷", code: "FA" },
  "vi":    { flag: "🇻🇳", code: "VI" },
  "th":    { flag: "🇹🇭", code: "TH" },
  "id":    { flag: "🇮🇩", code: "ID" },
  "ms":    { flag: "🇲🇾", code: "MS" },
  "tl":    { flag: "🇵🇭", code: "TL" },
  "sw":    { flag: "🇰🇪", code: "SW" },
  "ha":    { flag: "🇳🇬", code: "HA" },
  "yo":    { flag: "🇳🇬", code: "YO" },
  "am":    { flag: "🇪🇹", code: "AM" },
  "el":    { flag: "🇬🇷", code: "EL" },
};

/**
 * Centered horizontal "Read Lumo in your language" pill bar.
 * Renders at the top of the homepage. Lets a visitor switch the entire
 * site into one of the supported languages independently of their country
 * (so an Italian customer in the US can keep USD pricing).
 *
 * Languages are fetched live from /api/i18n/languages so the bar always
 * matches the backend's SUPPORTED_LANGS.
 */
export default function LanguageBar() {
  const { lang, setLangOverride, isLangOverridden } = useLocale();
  const [langs, setLangs] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/i18n/languages");
        if (!cancelled && Array.isArray(data)) setLangs(data);
      } catch (_) { /* silent — fall back to empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (langs.length === 0) return null;

  const PREVIEW_COUNT = 8;
  const visible = expanded ? langs : langs.slice(0, PREVIEW_COUNT);

  return (
    <div
      className="border-b border-slate-200 bg-slate-50/60"
      data-testid="language-bar"
      data-no-i18n="true"
    >
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-center gap-1.5 flex-wrap text-[12px]">
          <div className="flex items-center gap-1.5 text-slate-500 font-mono uppercase tracking-widest text-[10px] pr-2 mr-1 border-r border-slate-300">
            <Languages className="w-3.5 h-3.5" />
            <span>Read Lumo in</span>
          </div>

          {visible.map((l) => {
            const meta = LANG_META[l.code] || { flag: "🌐", code: l.code.toUpperCase() };
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => setLangOverride(active ? null : l.code)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-full font-mono transition-colors ${
                  active
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
                }`}
                data-testid={`lang-pill-${l.code}`}
                data-no-i18n="true"
                title={l.label}
              >
                <span className="text-sm leading-none" data-no-i18n="true">{meta.flag}</span>
                <span className="text-[10px] uppercase tracking-widest font-bold">{meta.code}</span>
                {active && <Check className="w-3 h-3" />}
              </button>
            );
          })}

          {langs.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center px-2.5 py-1 border border-dashed border-slate-300 rounded-full text-slate-500 hover:text-slate-900 hover:border-slate-500 font-mono text-[10px] uppercase tracking-widest"
              data-testid="lang-pill-more"
              data-no-i18n="true"
            >
              {expanded ? "− Less" : `+ ${langs.length - PREVIEW_COUNT} more`}
            </button>
          )}

          {isLangOverridden && (
            <button
              type="button"
              onClick={() => setLangOverride(null)}
              className="ml-2 text-[10px] font-mono uppercase tracking-widest text-slate-400 hover:text-slate-900"
              data-testid="lang-reset"
              data-no-i18n="true"
            >
              ↺ Auto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
