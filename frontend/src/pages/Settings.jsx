import React from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

export default function Settings() {
  return (
    <div className="max-w-screen-md mx-auto px-6 py-10">
      <div className="overline">Settings</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Operator notes.</h1>

      <section className="mt-10 border border-slate-200 p-6">
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
