import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/locale";
import { Languages } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
 * Centered language picker at the top of the homepage. Single dropdown
 * select (not side-by-side pills) — opens to reveal every supported
 * language. The user's auto-detected language is shown as the active
 * value and pinned at the top of the list; the rest follow alphabetically.
 */
export default function LanguageBar() {
  const { lang, setLangOverride, profile } = useLocale();
  const [langs, setLangs] = useState([]);

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

  // Sort alphabetically by short code, then pin the user's currently-applied
  // language to the very top so the dropdown opens with their default first.
  const sortedLangs = (() => {
    const out = [...langs];
    out.sort((a, b) => {
      const ca = (LANG_META[a.code]?.code || a.code).toUpperCase();
      const cb = (LANG_META[b.code]?.code || b.code).toUpperCase();
      return ca.localeCompare(cb);
    });
    const assumed = lang || profile?.lang || "en";
    const idx = out.findIndex((l) => l.code === assumed);
    if (idx > 0) {
      const [first] = out.splice(idx, 1);
      out.unshift(first);
    }
    return out;
  })();

  const current = LANG_META[lang] || { flag: "🌐", code: (lang || "en").toUpperCase() };

  return (
    <div
      className="border-b border-slate-200 bg-slate-50/60"
      data-testid="language-bar"
      data-no-i18n="true"
    >
      <div className="max-w-screen-2xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-center gap-3 text-[12px]">
          <div className="flex items-center gap-1.5 text-slate-500 font-mono uppercase tracking-widest text-[10px]">
            <Languages className="w-3.5 h-3.5" />
            <span>Read Lumo in</span>
          </div>
          <Select
            value={lang}
            onValueChange={(v) => setLangOverride(v === (profile?.lang || "en") ? null : v)}
          >
            <SelectTrigger
              className="h-8 min-w-[180px] w-auto bg-white border-slate-300 font-mono uppercase tracking-widest text-[11px] focus:ring-teal-700"
              data-testid="lang-dropdown-trigger"
              data-no-i18n="true"
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none" data-no-i18n="true">{current.flag}</span>
                <SelectValue placeholder="Choose language" />
              </span>
            </SelectTrigger>
            <SelectContent
              className="max-h-[60vh]"
              data-testid="lang-dropdown-menu"
              data-no-i18n="true"
            >
              {sortedLangs.map((l) => {
                const meta = LANG_META[l.code] || { flag: "🌐", code: l.code.toUpperCase() };
                return (
                  <SelectItem
                    key={l.code}
                    value={l.code}
                    className="font-mono"
                    data-testid={`lang-option-${l.code}`}
                    data-no-i18n="true"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none" data-no-i18n="true">{meta.flag}</span>
                      <span className="font-bold uppercase tracking-widest text-[10px]">{meta.code}</span>
                      <span className="text-slate-500 text-[11px]">{l.label}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
