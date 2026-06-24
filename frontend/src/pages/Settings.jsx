import React from "react";
import { ExternalLink, ShieldCheck, Globe } from "lucide-react";
import { useLocale, COUNTRY_PROFILES } from "@/lib/locale";

export default function Settings() {
  const { country, profile, setCountryOverride, isAutoDetected, formatPrice } = useLocale();

  return (
    <div className="max-w-screen-md mx-auto px-6 py-10">
      <div className="overline">Settings</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Operator notes.</h1>

      <section className="mt-10 border border-slate-200 p-6" data-no-i18n="true">
        <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-teal-700" /><div className="font-display text-xl font-bold">Country & language preview</div></div>
        <p className="text-slate-600 text-sm mt-3">
          Lumo auto-detects each visitor's country from their browser locale and timezone, then translates the entire app into their native language and converts prices to their local currency using live FX rates. Use the picker below to preview any country.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="text-xs font-mono uppercase tracking-wider text-slate-500" htmlFor="country-picker">Preview country</label>
          <select
            id="country-picker"
            value={country}
            onChange={(e) => setCountryOverride(e.target.value)}
            className="px-3 py-2 border border-slate-300 bg-white text-sm font-medium min-w-[260px]"
            data-testid="settings-country-picker"
          >
            {Object.entries(COUNTRY_PROFILES).map(([code, p]) => (
              <option key={code} value={code}>
                {p.flag}  {p.name} — {p.lang.toUpperCase()} · {p.currency}
              </option>
            ))}
          </select>
          {!isAutoDetected && (
            <button
              type="button"
              onClick={() => setCountryOverride(null)}
              className="text-xs text-slate-500 underline hover:text-slate-900"
              data-testid="settings-country-reset"
            >
              Reset to auto-detect
            </button>
          )}
        </div>

        <div className="mt-4 bg-slate-50 border border-slate-200 p-4 grid grid-cols-3 gap-3 text-xs font-mono">
          <div>
            <div className="text-slate-500 uppercase">Country</div>
            <div className="text-slate-900 mt-1">{profile.flag} {profile.name}</div>
          </div>
          <div>
            <div className="text-slate-500 uppercase">Language</div>
            <div className="text-slate-900 mt-1">{profile.lang.toUpperCase()}</div>
          </div>
          <div>
            <div className="text-slate-500 uppercase">Currency</div>
            <div className="text-slate-900 mt-1">{profile.currency} ({profile.symbol})</div>
          </div>
          <div>
            <div className="text-slate-500 uppercase">{profile.taxLabel}</div>
            <div className="text-slate-900 mt-1">{(profile.taxRate * 100).toFixed(profile.taxRate * 100 % 1 ? 1 : 0)}%</div>
          </div>
          <div className="col-span-2">
            <div className="text-slate-500 uppercase">$25 example, tax-inclusive</div>
            <div className="text-slate-900 mt-1 text-sm">{formatPrice(25 * (1 + profile.taxRate))}</div>
          </div>
          <div className="col-span-3 pt-2 border-t border-slate-200 mt-1">
            <div className="text-slate-500 uppercase">Pre-tax price ($25 USD → local)</div>
            <div className="text-slate-900 mt-1 text-base">{formatPrice(25)}</div>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-4">
          Tip: {profile.taxLabel} of {(profile.taxRate * 100).toFixed(profile.taxRate * 100 % 1 ? 1 : 0)}% is added at checkout and collected 100% upfront in the deposit so Lumo always covers tax remittance — no matter how the remaining balance is paid. Demo jobs are seeded in major cities across <strong>15 countries</strong> (US, UK, Canada, Australia, India, Germany, France, Japan, Brazil, Mexico, Spain, Nigeria, UAE, Singapore, South Africa). Visit the <a className="text-teal-700 underline" href="/map">Map</a> or the <a className="text-teal-700 underline" href="/customer">Customer Hub</a> to see them.
        </p>
      </section>

      <section className="mt-10 border border-slate-200 p-6" data-no-i18n="true">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-teal-700" /><div className="font-display text-xl font-bold">Restrict your Google Maps API key</div></div>
        <p className="text-slate-600 text-sm mt-3">
          You are using Google Maps in production — lock your API key down before going live so nobody else can run up your billing.
        </p>
        <ol className="mt-5 space-y-3 text-sm text-slate-700 list-decimal pl-5">
          <li>Go to <a className="text-teal-700 underline inline-flex items-center gap-1" href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console → APIs &amp; Services → Credentials <ExternalLink className="w-3 h-3" /></a>.</li>
          <li>Click the pencil icon next to your Maps API key.</li>
          <li>Under <span className="font-mono">Application restrictions</span> select <strong>HTTP referrers (websites)</strong> and add:
            <pre className="bg-slate-50 border border-slate-200 px-3 py-2 mt-2 font-mono text-xs">https://yourdomain.com/*{"\n"}https://*.yourdomain.com/*{"\n"}https://*.preview.emergentagent.com/*</pre>
          </li>
          <li>Under <span className="font-mono">API restrictions</span> select <strong>Restrict key</strong> and enable only:
            <ul className="list-disc pl-5 mt-1 text-slate-600">
              <li>Maps JavaScript API</li>
              <li>Places API (if you use autocomplete)</li>
              <li>Geocoding API (if you geocode addresses server-side)</li>
            </ul>
          </li>
          <li>Click <strong>Save</strong>. Allow ~5 minutes for restrictions to propagate.</li>
          <li>(Optional, recommended) In <span className="font-mono">Billing → Budgets & alerts</span>, set a monthly budget alert (e.g. $50) so you get an email if usage spikes.</li>
        </ol>
        <p className="text-xs text-slate-500 mt-5 font-mono">
          Tip: For backend-only calls (Geocoding, Directions), create a second key with <strong>IP address</strong> restrictions instead of HTTP referrer — restrict it to your server outbound IPs.
        </p>
      </section>
    </div>
  );
}
