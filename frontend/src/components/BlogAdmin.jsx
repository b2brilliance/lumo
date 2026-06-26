import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Pause, Play, RefreshCw, Trash2, Eye, ExternalLink, Mail, Calendar } from "lucide-react";
import { toast } from "sonner";

const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const fmtNum = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);

export default function BlogAdmin() {
  const [sub, setSub] = useState("blog"); // "blog" | "newsletter"
  return (
    <div data-testid="blog-admin-page">
      <div className="flex gap-2 border-b border-slate-200 mb-4">
        {[{k: "blog", l: "Auto-blog"}, {k: "newsletter", l: "Newsletter & subscribers"}].map((s) => (
          <button
            key={s.k}
            onClick={() => setSub(s.k)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest border-b-2 ${sub === s.k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            data-testid={`blog-admin-sub-${s.k}`}
          >
            {s.l}
          </button>
        ))}
      </div>
      {sub === "blog" && <BlogSection />}
      {sub === "newsletter" && <NewsletterSection />}
    </div>
  );
}

// ── Blog auto-publish controls + post list ──────────────────────────────────
function BlogSection() {
  const [config, setConfig] = useState(null);
  const [posts, setPosts] = useState({ total: 0, items: [] });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [c, p] = await Promise.all([
        api.get("/admin/blog/config"),
        api.get("/admin/blog?limit=50"),
      ]);
      setConfig(c.data); setPosts(p.data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const togglePause = async () => {
    try {
      const { data } = await api.put("/admin/blog/config", { paused: !config.paused });
      setConfig(data);
      toast.success(data.paused ? "Auto-blog paused." : "Auto-blog resumed.");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/blog/run-now");
      toast.success(`Published: ${data.post?.title?.slice(0, 50) || "new post"}`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this post permanently?")) return;
    try {
      await api.delete(`/admin/blog/${id}`);
      toast.success("Deleted.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleStatus = async (post) => {
    const next = post.status === "published" ? "draft" : "published";
    try {
      await api.put(`/admin/blog/${post.id}`, { status: next });
      toast.success(next === "published" ? "Published." : "Unpublished.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (loading || !config) return <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div>
      {/* Status panel */}
      <div className={`border-2 p-4 mb-6 ${config.paused ? "border-amber-300 bg-amber-50" : "border-teal-300 bg-teal-50"}`} data-testid="blog-status-panel">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-display text-lg font-bold">
                {config.paused ? "Auto-pilot paused" : "Auto-pilot active"}
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-slate-900 text-white">
                {(config.schedule_hours_utc || []).map((h) => `${h.toString().padStart(2, "0")}:00`).join(" · ")} UTC
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-slate-200 text-slate-700">
                Auto-share: {config.auto_share ? "ON" : "OFF"}
              </span>
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Last post: <span className="font-mono">{fmtDate(config.last_run_at)}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={runNow} disabled={busy} className="bg-slate-900 hover:bg-slate-800 rounded-none" data-testid="blog-run-now">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Generate now
            </Button>
            <Button onClick={togglePause} variant="outline" className="rounded-none" data-testid="blog-toggle-pause">
              {config.paused ? <><Play className="w-4 h-4 mr-1" /> Resume</> : <><Pause className="w-4 h-4 mr-1" /> Pause</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Post list */}
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-xl font-black tracking-tighter">Posts</h3>
        <div className="text-xs font-mono text-slate-500">{fmtNum(posts.total)} total</div>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-200" data-testid="blog-post-list">
        {posts.items.length === 0 && <div className="p-8 text-sm text-slate-400 text-center">No posts yet. Click &quot;Generate now&quot; to publish your first one.</div>}
        {posts.items.map((p) => (
          <div key={p.id} className="grid grid-cols-12 gap-3 p-3 items-center" data-testid={`blog-post-row-${p.slug}`}>
            <div className="col-span-1">
              {p.hero_image_url ? (
                <img src={p.hero_image_url} alt="" className="w-12 h-12 object-cover" loading="lazy" />
              ) : (
                <div className="w-12 h-12 bg-slate-100" />
              )}
            </div>
            <div className="col-span-7 min-w-0">
              <div className="font-display font-bold truncate">{p.title}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 truncate">{p.topic_label} · {fmtDate(p.published_at || p.created_at)}</div>
            </div>
            <div className="col-span-1 text-xs">
              <span className={`font-mono uppercase px-1.5 py-0.5 text-[10px] ${p.status === "published" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                {p.status || "published"}
              </span>
            </div>
            <div className="col-span-1 text-xs font-mono text-slate-500 text-right">{fmtNum(p.view_count || 0)} views</div>
            <div className="col-span-2 flex justify-end gap-1">
              <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="w-7 h-7 grid place-items-center border border-slate-200 text-slate-600 hover:text-teal-700 hover:border-teal-700" title="View"><Eye className="w-3 h-3" /></a>
              <button onClick={() => toggleStatus(p)} className="w-7 h-7 grid place-items-center border border-slate-200 text-slate-600 hover:text-amber-700 hover:border-amber-700" title={p.status === "published" ? "Unpublish" : "Publish"} data-testid={`blog-toggle-${p.slug}`}>
                {p.status === "published" ? "•" : "↑"}
              </button>
              <button onClick={() => del(p.id)} className="w-7 h-7 grid place-items-center border border-slate-200 text-slate-600 hover:text-red-700 hover:border-red-700" title="Delete" data-testid={`blog-delete-${p.slug}`}><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Newsletter + subscribers ────────────────────────────────────────────────
function NewsletterSection() {
  const [stats, setStats] = useState(null);
  const [subs, setSubs] = useState({ total: 0, items: [] });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [s, l] = await Promise.all([
        api.get("/admin/subscribers/stats"),
        api.get(`/admin/subscribers?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`),
      ]);
      setStats(s.data); setSubs(l.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const sendNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/subscribers/send-now");
      const sentMsg = data.sent > 0 ? `${data.sent} sent` : null;
      const queuedMsg = data.queued > 0 ? `${data.queued} queued (no email key)` : null;
      toast.success([sentMsg, queuedMsg, data.failed > 0 ? `${data.failed} failed` : null].filter(Boolean).join(" · ") || "Batch complete.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const removeSub = async (id) => {
    if (!window.confirm("Remove this subscriber?")) return;
    try {
      await api.delete(`/admin/subscribers/${id}`);
      toast.success("Removed.");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!stats) return <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div data-testid="newsletter-section">
      {!stats.resend_configured && (
        <div className="border-2 border-amber-300 bg-amber-50 p-4 mb-6 text-sm">
          <div className="font-display font-bold flex items-center gap-2 text-amber-800"><Mail className="w-4 h-4" /> No email provider configured</div>
          <p className="text-amber-900 text-xs mt-1">
            Add <code className="font-mono bg-white px-1">RESEND_API_KEY</code> + <code className="font-mono bg-white px-1">RESEND_FROM</code> to <code className="font-mono bg-white px-1">/app/backend/.env</code> to actually send. Until then, all outgoing emails are <strong>queued + logged</strong> so you don&apos;t lose any subscribers.
          </p>
        </div>
      )}

      {/* Stats tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="newsletter-tiles">
        <Tile label="Active subscribers" value={fmtNum(stats.active)} />
        <Tile label="Unsubscribed" value={fmtNum(stats.unsubscribed)} />
        <Tile label="Emails sent" value={fmtNum(stats.total_sends)} />
        <Tile label="Last send" value={fmtDate(stats.last_send_at)} small />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Button onClick={sendNow} disabled={busy || stats.active === 0} className="bg-slate-900 hover:bg-slate-800 rounded-none" data-testid="newsletter-send-now">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />} Send batch now
        </Button>
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
                 placeholder="Search email" className="rounded-none text-sm" data-testid="newsletter-search" />
        </div>
        <div className="text-xs font-mono text-slate-500 ml-auto">{fmtNum(subs.total)} subscribers</div>
      </div>

      <div className="border border-slate-200 divide-y divide-slate-200" data-testid="subscribers-list">
        {subs.items.length === 0 && <div className="p-8 text-sm text-slate-400 text-center">No subscribers yet — the homepage form will populate this.</div>}
        {subs.items.map((s) => (
          <div key={s.id} className="grid grid-cols-12 gap-3 p-3 items-center text-sm" data-testid={`sub-row-${s.email}`}>
            <div className="col-span-5 font-mono truncate">{s.email}</div>
            <div className="col-span-2 text-xs">
              <span className={`font-mono uppercase tracking-wider px-1.5 py-0.5 text-[10px] ${s.status === "active" ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-600"}`}>
                {s.status}
              </span>
            </div>
            <div className="col-span-2 text-xs font-mono text-slate-500 truncate">{s.source || "—"}</div>
            <div className="col-span-2 text-xs font-mono text-slate-500"><Calendar className="w-3 h-3 inline mr-1" />{fmtDate(s.subscribed_at)}</div>
            <div className="col-span-1 text-right">
              <button onClick={() => removeSub(s.id)} className="w-7 h-7 grid place-items-center border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-700" title="Remove" data-testid={`sub-delete-${s.email}`}><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, small }) {
  return (
    <div className="border border-slate-200 p-4">
      <div className="overline text-slate-500">{label}</div>
      <div className={`font-display ${small ? "text-base font-bold" : "text-3xl font-black tracking-tighter"} mt-1`}>{value}</div>
    </div>
  );
}
