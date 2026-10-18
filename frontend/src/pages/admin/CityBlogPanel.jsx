import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Newspaper, Trash2, ExternalLink, Facebook, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function CityBlogPanel() {
  const [cfg, setCfg] = useState(null);
  const [posts, setPosts] = useState([]);
  const [fbJob, setFbJob] = useState(null);
  const pollFb = () => api.get("/admin/city-blog/publish-facebook").then((r) => setFbJob(r.data)).catch(() => {});
  useEffect(() => {
    pollFb();
  }, []);
  useEffect(() => {
    if (fbJob?.state !== "running") return undefined;
    const t = setInterval(pollFb, 4000);
    return () => clearInterval(t);
  }, [fbJob?.state]);
  const publishFb = async () => {
    if (!window.confirm("Publish the first 10 recruiting posts to your Facebook Page?")) return;
    try { await api.post("/admin/city-blog/publish-facebook?count=10"); setFbJob({ state: "running", results: [] }); toast.success("Publishing to Facebook…"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const load = () => {
    api.get("/admin/city-blog/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/admin/city-blog/posts?limit=20").then((r) => setPosts(r.data || [])).catch(() => {});
  };
  useEffect(load, []);

  const save = async (patch) => {
    try {
      const { data } = await api.put("/admin/city-blog/config", patch);
      setCfg((c) => ({ ...c, ...data }));
      toast.success("City blog settings saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const runNow = async () => {
    try { await api.post("/admin/city-blog/run?count=3"); toast.success("Writing 3 posts — refresh in a minute"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (p) => {
    if (!window.confirm(`Delete "${p.title_en || p.title}"?`)) return;
    try { await api.delete(`/admin/city-blog/posts/${p.id}`); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  if (!cfg) return null;
  return (
    <section className="border border-slate-200" data-testid="admin-city-blog">
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="overline flex items-center gap-2"><Newspaper className="w-4 h-4" /> City recruiting blog</div>
          <div className="text-xs text-slate-500 mt-1" data-testid="admin-city-blog-stats">
            {cfg.total_posts} posts total · {cfg.posts_24h} in last 24h · top {cfg.daily_top_n} cities daily, the rest weekly
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">Auto-publish
            <Switch checked={!!cfg.enabled} onCheckedChange={(v) => save({ enabled: v })} data-testid="admin-city-blog-enabled" />
          </label>
          <label className="flex items-center gap-2">Share to social
            <Switch checked={!!cfg.share_social} onCheckedChange={(v) => save({ share_social: v })} data-testid="admin-city-blog-share" />
          </label>
        </div>
      </div>
      <div className="p-4 flex flex-wrap items-end gap-3 border-b border-slate-200">
        <label className="text-xs">Daily cities (top N)
          <Input type="number" className="h-9 w-28 mt-1" value={cfg.daily_top_n} onChange={(e) => setCfg({ ...cfg, daily_top_n: e.target.value })} data-testid="admin-city-blog-topn" />
        </label>
        <Button size="sm" variant="outline" onClick={() => save({ daily_top_n: Number(cfg.daily_top_n) })} data-testid="admin-city-blog-save">Save</Button>
        <Button size="sm" onClick={runNow} className="bg-slate-900" data-testid="admin-city-blog-run">Write 3 posts now</Button>
        <Button size="sm" onClick={publishFb} disabled={fbJob?.state === "running"} className="bg-[#1877F2] hover:bg-[#166FE5]" data-testid="admin-city-blog-fb-publish">
          {fbJob?.state === "running" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Facebook className="w-4 h-4 mr-1" />}
          Publish first 10 to Facebook
        </Button>
      </div>
      {fbJob && fbJob.state !== "idle" && (
        <div className="p-4 border-b border-slate-200 text-sm" data-testid="admin-city-blog-fb-status">
          <div className="font-semibold">
            {fbJob.state === "running" ? `Publishing… ${(fbJob.results || []).length}/${fbJob.count || 10}` :
              fbJob.state === "error" ? `Failed: ${fbJob.error}` : `Done: ${fbJob.published} of ${(fbJob.results || []).length} posted to Facebook`}
          </div>
          <ul className="mt-2 space-y-1">
            {(fbJob.results || []).map((r) => (
              <li key={r.slug} className="flex items-center gap-2 text-xs" data-testid={`admin-city-blog-fb-result-${r.slug}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                <span className="font-mono">{r.city}</span>
                {r.error && <span className="text-red-600 truncate">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="divide-y divide-slate-100 max-h-96 overflow-auto" data-testid="admin-city-blog-posts">
        {posts.map((p) => (
          <li key={p.id} className="p-3 flex items-center gap-3 text-sm" data-testid={`admin-city-blog-post-${p.id}`}>
            <span className="font-mono text-xs text-slate-500 w-28 shrink-0">{p.city}</span>
            <span className="flex-1 truncate" data-no-i18n="true">{p.title_en || p.title}</span>
            <span className="font-mono text-[10px] uppercase text-slate-400">{p.lang}</span>
            <a href={`/join/${p.city_slug}/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-slate-100"><ExternalLink className="w-3.5 h-3.5" /></a>
            <button onClick={() => del(p)} className="p-1 text-red-600 hover:bg-red-50" data-testid={`admin-city-blog-del-${p.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
