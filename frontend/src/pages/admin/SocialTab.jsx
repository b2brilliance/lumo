import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Facebook, Instagram, Twitter, Linkedin, MessageSquare, CheckCircle2, XCircle, Send, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { FacebookConnectCard } from "@/components/admin/FacebookConnectCard";

/* SocialTab — configure Facebook / Instagram / X / Reddit auto-publishing
 * for blog posts + city recruit broadcasts. */

const ICONS = {
  facebook:  Facebook,
  instagram: Instagram,
  twitter:   Twitter,
  reddit:    MessageSquare,
  linkedin:  Linkedin,
};

const FIELD_HINTS = {
  facebook:  ["page_id", "access_token"],
  instagram: ["ig_user_id", "access_token"],
  twitter:   ["bearer_token"],
  reddit:    ["client_id", "client_secret", "username", "password", "subreddit", "user_agent"],
  linkedin:  ["access_token", "author_urn"],
};

const TONE_LABELS = {
  hype:  "Hype / energetic",
  clean: "Professional / clean",
};

function AiCopyRotatorCard() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/ai-copy/config");
      setCfg(data);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleEnabled = async (enabled) => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/ai-copy/config", { enabled });
      setCfg(data);
      toast.success(enabled ? "AI copy rotator ON — daily posts will rewrite themselves" : "AI copy rotator OFF");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const toggleTone = async (tone) => {
    const current = new Set(cfg?.tones || []);
    if (current.has(tone)) current.delete(tone);
    else current.add(tone);
    const tones = Array.from(current);
    if (tones.length === 0) {
      toast.error("Pick at least one tone");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put("/admin/ai-copy/config", { tones });
      setCfg(data);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const { data } = await api.post("/admin/ai-copy/preview", {
        source_type: "recruit",
        source_id: "los-angeles-ca",
        base_title: "Drive with Lumo in Los Angeles — 90% take-home, same-day pay",
        base_body: "Lumo is hiring 300 providers in Los Angeles, California. First 100 sign-ups earn a $100 bonus at job #100. No lead fees, cash out today.",
        context: { city: "Los Angeles", milestone_jobs: 100, bonus_usd: 100 },
      });
      setPreview(data);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setPreviewing(false); }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading AI copy config…</div>;

  return (
    <div className="border border-slate-200 p-5 bg-white" data-testid="admin-ai-copy-card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display font-bold text-lg text-slate-900">AI Copy Rotator</div>
            <div className="text-xs text-slate-500">Rewrites recruit + blog captions every run so followers don't see yesterday's post</div>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!cfg?.enabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
            className="w-4 h-4 accent-slate-900"
            data-testid="admin-ai-copy-enabled"
            disabled={saving}
          />
          Enable
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4" data-testid="admin-ai-copy-tones">
        {(cfg?.available_tones || ["hype", "clean"]).map((tone) => {
          const active = (cfg?.tones || []).includes(tone);
          return (
            <button
              key={tone}
              type="button"
              onClick={() => toggleTone(tone)}
              className={`text-left border p-3 text-sm transition-colors ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"}`}
              data-testid={`admin-ai-copy-tone-${tone}`}
              disabled={saving}
            >
              <div className="font-display font-bold">{TONE_LABELS[tone] || tone}</div>
              <div className={`text-xs mt-0.5 ${active ? "text-white/70" : "text-slate-500"}`}>
                {tone === "hype" ? "Punchy, driver-culture, emoji ok" : "Benefits-first, no jargon, founder-tone"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
        <span>Rewrites so far: <b className="text-slate-900">{cfg?.total_rewrites ?? 0}</b></span>
        {cfg?.last_run_at && <span>· Last run: {new Date(cfg.last_run_at).toLocaleString()}</span>}
        {cfg?.last_tone && cfg.last_tone !== "off" && <span>· Last tone: {TONE_LABELS[cfg.last_tone] || cfg.last_tone}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={runPreview} disabled={previewing} className="bg-slate-900 hover:bg-slate-800 h-8" data-testid="admin-ai-copy-preview-btn">
          <Wand2 className="w-3.5 h-3.5 mr-1" /> {previewing ? "Rewriting…" : "Preview next recruit copy"}
        </Button>
      </div>

      {preview && (
        <div className="mt-4 p-3 border border-dashed border-slate-300 bg-slate-50" data-testid="admin-ai-copy-preview-result">
          <div className="overline text-slate-500 mb-1">Preview · tone: {TONE_LABELS[preview.tone] || preview.tone}</div>
          <div className="font-display font-bold text-slate-900">{preview.title}</div>
          <div className="text-sm text-slate-700 mt-1 whitespace-pre-line">{preview.body}</div>
        </div>
      )}
    </div>
  );
}

export default function SocialTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [cfg, hist] = await Promise.all([
        api.get("/admin/social/config"),
        api.get("/admin/social/history?limit=25"),
      ]);
      setItems(cfg.data.items || []);
      setHistory(hist.data.items || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (platform, patch) => {
    const it = items.find((i) => i.platform === platform);
    const next = { ...it, ...patch, config: { ...it.config, ...(patch.config || {}) } };
    setSaving(platform);
    try {
      await api.put(`/admin/social/config/${platform}`, { platform, enabled: next.enabled, config: next.config });
      toast.success(`${it.label} saved`);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(null); }
  };

  const test = async (platform) => {
    try {
      const { data } = await api.post("/admin/social/test", { platform, title: "Lumo test", body: "Ignore — testing.", url: "https://lumo.com" });
      if (data.ok) toast.success("Test post successful");
      else toast.error(data.error || "Test failed");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="space-y-6" data-testid="admin-social-tab">
      <div>
        <div className="overline">Social auto-publisher</div>
        <h2 className="font-display text-2xl font-black tracking-tight">Blog + recruit broadcasts</h2>
        <p className="text-sm text-slate-500 mt-1">Every published blog post and every daily recruit broadcast fans out to whichever platforms are enabled below.</p>
      </div>

      <FacebookConnectCard onChange={load} />

      <AiCopyRotatorCard />

      {loading ? (
        <div className="p-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="grid gap-4">
          {items.map((it) => {
            const Icon = ICONS[it.platform] || MessageSquare;
            const isSaving = saving === it.platform;
            return (
              <div key={it.platform} className="border border-slate-200 p-5 bg-white" data-testid={`admin-social-row-${it.platform}`}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-slate-900" />
                    </div>
                    <div>
                      <div className="font-display font-bold text-lg text-slate-900">{it.label}</div>
                      <div className="text-xs text-slate-500 font-mono">{it.enabled ? "enabled" : "off"}</div>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={it.enabled}
                      onChange={(e) => save(it.platform, { enabled: e.target.checked })}
                      className="w-4 h-4 accent-slate-900"
                      data-testid={`admin-social-enabled-${it.platform}`}
                      disabled={isSaving}
                    />
                    Enable
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FIELD_HINTS[it.platform].map((f) => (
                    <div key={f}>
                      <Label className="text-xs overline">{f}</Label>
                      <Input
                        type={/password|secret|token/.test(f) ? "password" : "text"}
                        defaultValue={it.config?.[f] || ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (it.config?.[f] || "")) save(it.platform, { config: { [f]: v } });
                        }}
                        placeholder={f}
                        className="font-mono text-xs"
                        data-testid={`admin-social-field-${it.platform}-${f}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => test(it.platform)} disabled={!it.enabled} className="bg-slate-900 hover:bg-slate-800 h-8" data-testid={`admin-social-test-${it.platform}`}>
                    <Send className="w-3.5 h-3.5 mr-1" /> Send test
                  </Button>
                  {it.last_test_result && (
                    <span className={`inline-flex items-center gap-1 text-xs font-mono ${it.last_test_result.ok ? "text-teal-700" : "text-red-600"}`} data-testid={`admin-social-status-${it.platform}`}>
                      {it.last_test_result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {it.last_test_result.ok ? "OK" : it.last_test_result.error?.slice(0, 60) || "failed"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Broadcast history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="overline">Recent auto-posts</h3>
          <Button size="sm" variant="ghost" onClick={load} className="h-7 text-slate-500"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
        </div>
        <div className="border border-slate-200 divide-y divide-slate-100" data-testid="admin-social-history">
          {history.length === 0 && <div className="p-4 text-sm text-slate-500">Nothing published yet.</div>}
          {history.map((p, i) => (
            <div key={p.id || i} className="p-3 flex items-center gap-3 text-sm" data-testid={`admin-social-history-${i}`}>
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500 min-w-[70px]">{p.platform}</div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold truncate">{p.title}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {p.source_type} · {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
              {p.result?.ok ? (
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              ) : (
                <span className="text-xs text-red-600 truncate max-w-[240px]">{p.result?.error?.slice(0, 60) || "failed"}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
