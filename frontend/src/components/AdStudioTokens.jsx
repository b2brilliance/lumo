import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Facebook, Instagram, Twitter, Linkedin, MessageSquare,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, KeyRound, Send, Loader2,
} from "lucide-react";
import { toast } from "sonner";

/*
 * AdStudioTokens — a self-contained "paste your tokens here" panel for Ad Studio.
 * Reuses the backend /api/admin/social/config endpoints so Ad Studio and the
 * Auto-post tab share the exact same credentials. Admin-only (parent gates it).
 */

const ICONS = {
  facebook:  Facebook,
  instagram: Instagram,
  twitter:   Twitter,
  reddit:    MessageSquare,
  linkedin:  Linkedin,
};

// Field labels + where to grab the token (helps the user, not for logic).
const FIELD_META = {
  facebook: [
    { key: "page_id",       label: "Page ID",       hint: "numeric Facebook Page ID" },
    { key: "access_token",  label: "Page access token", hint: "long-lived page token", secret: true },
  ],
  instagram: [
    { key: "ig_user_id",    label: "IG User ID",    hint: "IG Business account ID" },
    { key: "access_token",  label: "Access token",  hint: "Graph API token with ig_content_publish", secret: true },
  ],
  twitter: [
    { key: "bearer_token",  label: "Bearer token",  hint: "X / Twitter v2 bearer token", secret: true },
  ],
  linkedin: [
    { key: "access_token",  label: "Access token",  hint: "LinkedIn OAuth token with w_member_social", secret: true },
    { key: "author_urn",    label: "Author URN",    hint: "e.g. urn:li:person:XXXX or urn:li:organization:XXXX" },
  ],
  reddit: [
    { key: "client_id",     label: "Client ID",     hint: "from reddit.com/prefs/apps" },
    { key: "client_secret", label: "Client secret", hint: "", secret: true },
    { key: "username",      label: "Username",      hint: "bot account" },
    { key: "password",      label: "Password",      hint: "", secret: true },
    { key: "subreddit",     label: "Subreddit",     hint: "where to post, no r/" },
    { key: "user_agent",    label: "User agent",    hint: "e.g. lumo-bot/1.0 by u/you" },
  ],
};

export default function AdStudioTokens() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [savingFor, setSavingFor] = useState(null); // platform key
  const [open, setOpen]         = useState(true);
  const [drafts, setDrafts]     = useState({});    // { [platform]: { [field]: value } }

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/social/config");
      setItems(data.items || []);
      // seed drafts with current masked/plain config
      const seed = {};
      (data.items || []).forEach((it) => { seed[it.platform] = { ...(it.config || {}) }; });
      setDrafts(seed);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setField = (platform, field, value) => {
    setDrafts((d) => ({ ...d, [platform]: { ...(d[platform] || {}), [field]: value } }));
  };

  const saveRow = async (platform, patch = {}) => {
    const it = items.find((i) => i.platform === platform);
    if (!it) return;
    const nextConfig = { ...(it.config || {}), ...(drafts[platform] || {}), ...(patch.config || {}) };
    const nextEnabled = patch.enabled === undefined ? it.enabled : patch.enabled;
    setSavingFor(platform);
    try {
      await api.put(`/admin/social/config/${platform}`, {
        platform,
        enabled: nextEnabled,
        config: nextConfig,
      });
      toast.success(`${it.label} saved`);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSavingFor(null); }
  };

  const sendTest = async (platform) => {
    try {
      const { data } = await api.post("/admin/social/test", {
        platform, title: "Lumo test", body: "Ignore — testing tokens from Ad Studio.", url: "https://lumo.com",
      });
      if (data.ok) toast.success("Test post successful");
      else toast.error(data.error || "Test failed");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="col-span-12 border border-slate-200 bg-white" data-testid="ad-studio-tokens">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50"
        data-testid="ad-studio-tokens-toggle"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="overline text-slate-500">Publishing tokens</div>
            <div className="font-display font-black text-lg tracking-tight">Paste your social API keys here.</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Needed so Ad Studio can post ads to Facebook, Instagram, X, Reddit and LinkedIn. Admin-only — never shown to other roles.
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading tokens…</div>
          ) : (
            <div className="grid gap-4">
              {items.map((it) => {
                const Icon = ICONS[it.platform] || MessageSquare;
                const fields = FIELD_META[it.platform] || [];
                const isSaving = savingFor === it.platform;
                return (
                  <div
                    key={it.platform}
                    className="border border-slate-200 p-4"
                    data-testid={`ad-studio-tokens-row-${it.platform}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-slate-900" />
                        </div>
                        <div>
                          <div className="font-display font-bold text-slate-900">{it.label}</div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                            {it.enabled ? "enabled" : "off"}
                            {it.last_test_result && (
                              <span className={`ml-2 inline-flex items-center gap-1 ${it.last_test_result.ok ? "text-teal-700" : "text-red-600"}`}>
                                {it.last_test_result.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {it.last_test_result.ok ? "ok" : "failed"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs cursor-pointer font-mono">
                        <input
                          type="checkbox"
                          checked={it.enabled}
                          onChange={(e) => saveRow(it.platform, { enabled: e.target.checked })}
                          className="w-4 h-4 accent-slate-900"
                          data-testid={`ad-studio-tokens-enabled-${it.platform}`}
                          disabled={isSaving}
                        />
                        Enable
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {fields.map((f) => (
                        <div key={f.key}>
                          <Label className="text-[10px] overline">{f.label}</Label>
                          <Input
                            type={f.secret ? "password" : "text"}
                            value={drafts[it.platform]?.[f.key] ?? ""}
                            onChange={(e) => setField(it.platform, f.key, e.target.value)}
                            placeholder={f.hint}
                            className="font-mono text-xs"
                            data-testid={`ad-studio-tokens-field-${it.platform}-${f.key}`}
                            autoComplete="off"
                          />
                          {f.hint && <div className="text-[10px] font-mono text-slate-400 mt-1">{f.hint}</div>}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveRow(it.platform)}
                        disabled={isSaving}
                        className="bg-slate-900 hover:bg-slate-800 h-8"
                        data-testid={`ad-studio-tokens-save-${it.platform}`}
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                        Save tokens
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendTest(it.platform)}
                        disabled={!it.enabled || isSaving}
                        className="h-8"
                        data-testid={`ad-studio-tokens-test-${it.platform}`}
                      >
                        <Send className="w-3.5 h-3.5 mr-1" /> Send test
                      </Button>
                      {it.last_test_result?.error && !it.last_test_result?.ok && (
                        <span className="text-[10px] font-mono text-red-600 truncate max-w-[320px]">
                          {it.last_test_result.error.slice(0, 120)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
