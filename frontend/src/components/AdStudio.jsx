import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Download, Trash2, Loader2, Copy as CopyIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const SIZE_ORDER = ["square", "story", "landscape"];

export default function AdStudio() {
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const [presets, setPresets] = useState(null);
  const [ads, setAds] = useState([]);
  const [audience, setAudience] = useState("flex_worker");
  const [category, setCategory] = useState("delivery");
  const [size, setSize] = useState("square");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewAd, setPreviewAd] = useState(null);

  useEffect(() => {
    api.get("/admin/ads/presets").then(({ data }) => setPresets(data)).catch(() => {});
    refreshAds();
  }, []);

  const refreshAds = () => api.get("/admin/ads").then(({ data }) => setAds(data || [])).catch(() => {});

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/ads/generate", { audience, category, size, city: city || null });
      toast.success("Ad generated");
      setPreviewAd(data);
      refreshAds();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeAd = async (id) => {
    if (!window.confirm("Delete this ad?")) return;
    try { await api.delete(`/admin/ads/${id}`); toast.success("Deleted"); refreshAds(); if (previewAd?.id === id) setPreviewAd(null); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const copyToClipboard = (text) => {
    try { navigator.clipboard.writeText(text); toast.success("Copied"); } catch { /* ignore */ }
  };

  const imgUrl = (ad) => {
    if (!ad?.image_url) return null;
    return ad.image_url.startsWith("http") ? ad.image_url : `${BACKEND_URL}${ad.image_url}`;
  };

  const audiences = useMemo(() => presets ? Object.entries(presets.audiences || {}) : [], [presets]);
  const categories = useMemo(() => presets ? Object.entries(presets.categories || {}) : [], [presets]);
  const sizes = useMemo(() => presets ? SIZE_ORDER.filter((k) => presets.sizes?.[k]).map((k) => [k, presets.sizes[k]]) : [], [presets]);

  if (!presets) return <div className="p-12 text-sm text-slate-500">Loading Ad Studio…</div>;

  return (
    <div className="grid grid-cols-12 gap-6" data-testid="ad-studio">
      {/* Composer */}
      <div className="col-span-12 lg:col-span-4 border border-slate-200 p-5 self-start">
        <div className="overline">New ad</div>
        <h3 className="font-display text-2xl font-black tracking-tight mt-1">Compose.</h3>
        <p className="text-xs text-slate-500 mt-2">AI generates copy (3 variants) + a photoreal image. Workers see pay+flexibility; customers see instant on-demand.</p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="overline text-slate-500">Audience</label>
            <select className="mt-1 w-full border border-slate-200 px-2 py-2 text-sm font-mono" value={audience} onChange={(e) => setAudience(e.target.value)} data-testid="ad-audience">
              {audiences.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <p className="text-[10px] font-mono text-slate-500 mt-1">{presets.audiences[audience]?.hook}</p>
          </div>
          <div>
            <label className="overline text-slate-500">Category</label>
            <select className="mt-1 w-full border border-slate-200 px-2 py-2 text-sm font-mono" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="ad-category">
              {categories.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="overline text-slate-500">Size</label>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {sizes.map(([k, v]) => (
                <button key={k} type="button" onClick={() => setSize(k)} data-testid={`ad-size-${k}`}
                  className={`text-[10px] font-mono uppercase tracking-widest border px-1 py-2 ${size === k ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {k}<br /><span className="opacity-60 normal-case">{v.width}×{v.height}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="overline text-slate-500">City (optional — for localized ads)</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Lagos, Tokyo, Austin" className="mt-1 font-mono text-sm" data-testid="ad-city" />
          </div>
          <Button onClick={generate} disabled={busy} className="w-full bg-slate-900 hover:bg-slate-800 text-white" data-testid="ad-generate">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4 mr-2" />Generate ad</>}
          </Button>
          <p className="text-[10px] font-mono text-slate-400 mt-1">Each generation uses the Emergent LLM Key (Claude + Nano Banana). ~10–25 seconds.</p>
        </div>
      </div>

      {/* Library + Preview */}
      <div className="col-span-12 lg:col-span-8">
        {previewAd && (
          <div className="border border-slate-200 p-5 mb-6" data-testid="ad-preview">
            <div className="flex items-center justify-between">
              <div>
                <div className="overline text-teal-700">Latest</div>
                <h3 className="font-display text-2xl font-black tracking-tight mt-1">{previewAd.headline}</h3>
              </div>
              <Button variant="outline" size="sm" onClick={generate} disabled={busy} data-testid="ad-regenerate"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate</Button>
            </div>
            <div className="grid grid-cols-12 gap-4 mt-4">
              <div className="col-span-12 md:col-span-5">
                {imgUrl(previewAd) ? (
                  <img src={imgUrl(previewAd)} alt={previewAd.headline} className="w-full border border-slate-200" data-testid="ad-preview-image" />
                ) : (
                  <div className="aspect-square bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">No image</div>
                )}
              </div>
              <div className="col-span-12 md:col-span-7 space-y-3">
                <div>
                  <div className="overline text-slate-500">Body</div>
                  <p className="text-sm mt-1">{previewAd.body}</p>
                </div>
                <div>
                  <div className="overline text-slate-500">CTA</div>
                  <p className="font-mono text-sm mt-1">{previewAd.cta}</p>
                </div>
                {previewAd.hashtags?.length > 0 && (
                  <div>
                    <div className="overline text-slate-500">Hashtags</div>
                    <p className="font-mono text-xs mt-1">{previewAd.hashtags.map((h) => `#${h}`).join(" ")}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(`${previewAd.headline}\n\n${previewAd.body}\n\n${previewAd.cta}\n\n${(previewAd.hashtags || []).map((h) => `#${h}`).join(" ")}`)} data-testid="ad-copy-all"><CopyIcon className="w-3.5 h-3.5 mr-1" /> Copy text</Button>
                  {imgUrl(previewAd) && <a href={imgUrl(previewAd)} target="_blank" rel="noreferrer" download className="inline-flex items-center text-xs font-mono uppercase tracking-widest border border-slate-200 px-3 py-1.5 hover:border-slate-400"><Download className="w-3.5 h-3.5 mr-1" /> Download image</a>}
                </div>
                {previewAd.variants?.length > 0 && (
                  <details className="pt-2">
                    <summary className="cursor-pointer text-xs font-mono uppercase tracking-widest text-slate-500">Alt variants ({previewAd.variants.length})</summary>
                    <div className="mt-2 space-y-2">
                      {previewAd.variants.map((v, i) => (
                        <div key={i} className="border border-slate-100 p-2 text-xs">
                          <div className="font-bold">{v.headline}</div>
                          <div className="text-slate-600 mt-1">{v.body}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="overline">Library</div>
        <h3 className="font-display text-2xl font-black tracking-tight mt-1">All ads ({ads.length}).</h3>
        {ads.length === 0 ? (
          <div className="mt-4 p-12 border-2 border-dashed border-slate-200 text-center text-sm text-slate-500" data-testid="ad-empty">
            No ads yet. Generate your first one on the left.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="ad-library">
            {ads.map((ad) => (
              <div key={ad.id} className="border border-slate-200 group" data-testid={`ad-card-${ad.id}`}>
                <div className="aspect-square bg-slate-50 relative">
                  {imgUrl(ad) ? <img src={imgUrl(ad)} alt={ad.headline} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">No image</div>}
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => setPreviewAd(ad)} className="bg-white border border-slate-200 p-1 text-xs hover:border-slate-400" data-testid={`ad-view-${ad.id}`}>View</button>
                    <button onClick={() => removeAd(ad.id)} className="bg-white border border-red-200 text-red-600 p-1 hover:bg-red-50" data-testid={`ad-delete-${ad.id}`}><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 truncate">{ad.audience_label} · {ad.category_label}</div>
                  <div className="text-xs font-bold mt-1 line-clamp-2">{ad.headline}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
