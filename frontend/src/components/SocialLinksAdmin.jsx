import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PLATFORM_META } from "@/components/SiteFooter";
import { ExternalLink, Loader2, CheckCircle2, X } from "lucide-react";

/**
 * Admin tab — edit the footer social media URLs.
 *
 * Saves on input blur (one platform at a time) so admins can paste and tab
 * through without hunting for a save button. Shows live preview at the
 * bottom so they can sanity-check colors/icons before publishing.
 */
export default function SocialLinksAdmin() {
  const [doc, setDoc] = useState(null);
  const [draft, setDraft] = useState({});
  const [tagline, setTagline] = useState("");
  const [adsense, setAdsense] = useState("");
  const [apps, setApps] = useState({ ios_app_url: "", android_app_url: "" });
  const [savingKey, setSavingKey] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/site/social");
      setDoc(data);
      setDraft(data.links || {});
      setTagline(data.tagline || "");
      setAdsense(data.adsense_client || "");
      setApps({ ios_app_url: data.ios_app_url || "", android_app_url: data.android_app_url || "" });
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const saveLink = async (key, value) => {
    if ((doc?.links?.[key] || "") === (value || "")) return; // no-op
    setSavingKey(key);
    try {
      const { data } = await api.put("/admin/site/social", { links: { [key]: value || "" } });
      setDoc(data);
      setDraft(data.links || {});
      if (value) toast.success(`${PLATFORM_META[key]?.label || key} saved`);
      else toast(`${PLATFORM_META[key]?.label || key} cleared`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSavingKey(null);
    }
  };

  const saveTagline = async () => {
    if ((doc?.tagline || "") === tagline) return;
    try {
      const { data } = await api.put("/admin/site/social", { tagline });
      setDoc(data);
      toast.success("Tagline saved");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const saveAdsense = async () => {
    if ((doc?.adsense_client || "") === adsense) return;
    try {
      const { data } = await api.put("/admin/site/social", { adsense_client: adsense });
      setDoc(data);
      toast.success(adsense ? "AdSense client saved — ads will appear on visitor pages" : "AdSense disabled");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const saveApp = async (key) => {
    if ((doc?.[key] || "") === apps[key]) return;
    try {
      const { data } = await api.put("/admin/site/social", { [key]: apps[key] });
      setDoc(data);
      setApps({ ios_app_url: data.ios_app_url || "", android_app_url: data.android_app_url || "" });
      toast.success("Download link saved — the homepage button is live");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500 flex items-center gap-2" data-testid="social-admin-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading social links…
      </div>
    );
  }

  const platforms = doc?.platforms_supported || [];

  return (
    <div data-testid="social-admin-page">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-black tracking-tighter">Social media links</h2>
        <p className="text-sm text-slate-500 mt-1">
          These appear in the footer of every page. Leave a field empty to hide that icon.
          Changes save automatically when you tab away from a field.
        </p>
      </div>

      {/* Tagline */}
      <div className="mb-6 border border-slate-200 p-4">
        <label className="overline block mb-2">Footer tagline</label>
        <Input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          onBlur={saveTagline}
          maxLength={200}
          placeholder="Built for everyday hustle. Find work, hire help, sell stuff — all in one place."
          className="rounded-none"
          data-testid="social-admin-tagline"
        />
        <div className="text-[10px] font-mono text-slate-400 mt-1 text-right">{tagline.length}/200</div>
      </div>

      {/* Google AdSense */}
      <div className="mb-6 border border-slate-200 p-4" data-testid="admin-adsense-block">
        <label className="overline block mb-2">Google AdSense publisher ID</label>
        <Input
          value={adsense}
          onChange={(e) => setAdsense(e.target.value.trim())}
          onBlur={saveAdsense}
          maxLength={64}
          placeholder="ca-pub-1234567890123456"
          className="rounded-none font-mono text-sm"
          data-testid="admin-adsense-input"
        />
        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
          Paste your AdSense publisher ID (starts with <span className="font-mono">ca-pub-</span>).
          Once saved, banner + in-feed ads render on visitor pages (home, shop, blog list, blog post, city recruit).
          Leave empty to disable ads entirely. You'll need an approved AdSense account from{" "}
          <a href="https://adsense.google.com/start" target="_blank" rel="noopener noreferrer" className="underline">adsense.google.com</a>.
        </p>
      </div>

      {/* App store download links */}
      <div className="mb-6 border border-slate-200 p-4 space-y-3" data-testid="admin-app-links-block">
        <label className="overline block">App download links (homepage buttons)</label>
        {[["ios_app_url", "App Store link", "https://apps.apple.com/app/lumo/id1234567890"], ["android_app_url", "Google Play link", "https://play.google.com/store/apps/details?id=app.golumo.mobile"]].map(([key, label, ph]) => (
          <div key={key}>
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <Input value={apps[key]} onChange={(e) => setApps((a) => ({ ...a, [key]: e.target.value.trim() }))} onBlur={() => saveApp(key)}
              placeholder={ph} className="rounded-none font-mono text-sm" data-testid={`admin-${key.replace(/_/g, "-")}`} />
          </div>
        ))}
        <p className="text-[11px] text-slate-500">Find your App Store link in App Store Connect → your app → App Information → "View on App Store". Leave empty to show the button as coming soon.</p>
      </div>

      {/* Links grid */}
      <div className="border border-slate-200 divide-y divide-slate-200" data-testid="social-admin-links">
        {platforms.map((key) => {
          const meta = PLATFORM_META[key];
          if (!meta) return null;
          const { Icon, label, color } = meta;
          const value = draft[key] ?? "";
          const saved = doc?.links?.[key] ?? "";
          const isDirty = value !== saved;
          const isFilled = !!saved;
          return (
            <div key={key} className="grid grid-cols-12 gap-3 p-3 items-center" data-testid={`social-row-${key}`}>
              <div className="col-span-3 flex items-center gap-2">
                <div className="w-8 h-8 grid place-items-center text-white" style={{ background: color }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="font-display font-bold text-sm">{label}</div>
              </div>
              <div className="col-span-7">
                <Input
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  onBlur={(e) => saveLink(key, e.target.value)}
                  placeholder={`https://${key}.com/golumo`}
                  className="rounded-none text-sm"
                  data-testid={`social-input-${key}`}
                />
              </div>
              <div className="col-span-2 flex items-center justify-end gap-1">
                {savingKey === key && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                {!isDirty && isFilled && <CheckCircle2 className="w-4 h-4 text-teal-600" data-testid={`social-saved-${key}`} />}
                {value && (
                  <a
                    href={value.startsWith("http") ? value : `https://${value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open link"
                    className="w-7 h-7 grid place-items-center border border-slate-200 text-slate-600 hover:text-teal-700 hover:border-teal-700"
                    data-testid={`social-open-${key}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {isFilled && (
                  <button
                    onClick={() => { setDraft((d) => ({ ...d, [key]: "" })); saveLink(key, ""); }}
                    title="Clear"
                    className="w-7 h-7 grid place-items-center border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-600"
                    data-testid={`social-clear-${key}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live preview */}
      <div className="mt-8">
        <div className="overline text-slate-500 mb-2">Footer preview</div>
        <div className="border border-slate-200 p-6 bg-slate-50">
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(doc?.links || {}).filter(([, u]) => !!u).map(([key, url]) => {
              const meta = PLATFORM_META[key];
              if (!meta) return null;
              const { Icon, label, color } = meta;
              return (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  className="w-9 h-9 grid place-items-center border border-slate-300 text-slate-700 hover:text-white transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  <Icon className="w-4 h-4" />
                </a>
              );
            })}
            {Object.values(doc?.links || {}).every((u) => !u) && (
              <div className="text-xs text-slate-400 italic">No social links set yet — fill any field above to see icons appear here.</div>
            )}
          </div>
          {doc?.tagline && (
            <p className="text-xs text-slate-500 mt-4 max-w-md">{doc.tagline}</p>
          )}
        </div>
      </div>
    </div>
  );
}
