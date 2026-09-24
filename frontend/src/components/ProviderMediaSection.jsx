/**
 * <ProviderMediaSection />
 *
 * Provider-only profile block for:
 *   - Profile picture (avatar upload)
 *   - Résumé / CV (PDF or DOCX, single file)
 *   - Portfolio (mixed: images, videos, external URLs)
 *   - Social profiles (X, Facebook, Instagram, TikTok, YouTube)
 *
 * All fields persist via PATCH /api/auth/me. Media files upload to
 * /api/media/upload (already authed). Portfolio items are stored as
 * an array of { type: 'image'|'video'|'link', url, title? }.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  User, FileText, Link as LinkIcon, Upload, Trash2, Loader2, Plus,
  Twitter, Facebook, Instagram, Music2, Youtube,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AttachmentUploader from "@/components/AttachmentUploader";

const SOCIAL_FIELDS = [
  { key: "x",         label: "X (Twitter)", Icon: Twitter,   placeholder: "https://x.com/yourhandle" },
  { key: "facebook",  label: "Facebook",    Icon: Facebook,  placeholder: "https://facebook.com/yourprofile" },
  { key: "instagram", label: "Instagram",   Icon: Instagram, placeholder: "https://instagram.com/yourhandle" },
  { key: "tiktok",    label: "TikTok",      Icon: Music2,    placeholder: "https://tiktok.com/@yourhandle" },
  { key: "youtube",   label: "YouTube",     Icon: Youtube,   placeholder: "https://youtube.com/@yourchannel" },
];

export default function ProviderMediaSection() {
  const { user, updateMe } = useAuth();
  const initial = useMemo(() => ({
    avatar_url: user?.avatar_url || "",
    resume_url: user?.resume_url || "",
    portfolio: user?.portfolio || [],
    social_links: {
      x:         user?.social_links?.x || "",
      facebook:  user?.social_links?.facebook || "",
      instagram: user?.social_links?.instagram || "",
      tiktok:    user?.social_links?.tiktok || "",
      youtube:   user?.social_links?.youtube || "",
    },
  }), [user]);
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [portfolioLink, setPortfolioLink] = useState("");
  const avatarRef = useRef(null);
  const resumeRef = useRef(null);

  useEffect(() => { setState(initial); }, [initial]);

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  const uploadAvatar = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Avatar must be an image");
    if (file.size > 5 * 1024 * 1024) return toast.error("Avatar must be under 5 MB");
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setState((s) => ({ ...s, avatar_url: data.media_url }));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setAvatarUploading(false); if (avatarRef.current) avatarRef.current.value = ""; }
  };

  const uploadResume = async (file) => {
    if (!file) return;
    const ok = /pdf|document|msword|officedocument/i.test(file.type) || /\.(pdf|docx?|rtf)$/i.test(file.name);
    if (!ok) return toast.error("Résumé must be PDF, DOC or DOCX");
    if (file.size > 10 * 1024 * 1024) return toast.error("Résumé must be under 10 MB");
    setResumeUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setState((s) => ({ ...s, resume_url: data.media_url }));
      toast.success("Résumé uploaded");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setResumeUploading(false); if (resumeRef.current) resumeRef.current.value = ""; }
  };

  const addPortfolioLink = () => {
    const url = portfolioLink.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) return toast.error("Include https:// in the URL");
    setState((s) => ({
      ...s,
      portfolio: [...s.portfolio, { type: "link", url, title: url.replace(/^https?:\/\//, "").split("/")[0] }],
    }));
    setPortfolioLink("");
  };

  const removePortfolio = (i) =>
    setState((s) => ({ ...s, portfolio: s.portfolio.filter((_, idx) => idx !== i) }));

  const setSocial = (k, v) =>
    setState((s) => ({ ...s, social_links: { ...s.social_links, [k]: v } }));

  const save = async () => {
    setBusy(true);
    try {
      await updateMe(state);
      toast.success("Profile media saved");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  if (!user || user.role !== "provider") return null;

  const linkItems = (state.portfolio || []).filter((p) => p.type === "link");
  const mediaItems = (state.portfolio || []).filter((p) => p.type !== "link");

  return (
    <section className="mt-8 border border-slate-200 p-6 bg-white" data-testid="section-provider-media">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-amber-700" />
        <div className="font-display text-xl font-bold">Portfolio &amp; media</div>
      </div>
      <p className="text-slate-600 text-sm mb-6">
        A photo, a résumé, a few work samples and your socials make you 3× more likely to get accepted for high-paying jobs.
      </p>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-8" data-testid="ppm-avatar-block">
        <div className="w-20 h-20 rounded-full bg-neutral-100 border border-neutral-200 overflow-hidden flex items-center justify-center">
          {state.avatar_url ? (
            <img src={state.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-neutral-400" />
          )}
        </div>
        <div>
          <div className="overline mb-1">Profile picture</div>
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => uploadAvatar(e.target.files?.[0])}
            data-testid="ppm-avatar-input"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => avatarRef.current?.click()}
            disabled={avatarUploading}
            data-testid="ppm-avatar-btn"
          >
            {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
            {state.avatar_url ? "Replace photo" : "Upload photo"}
          </Button>
        </div>
      </div>

      {/* Résumé */}
      <div className="mb-8" data-testid="ppm-resume-block">
        <div className="overline mb-2">Résumé / CV</div>
        <input
          ref={resumeRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => uploadResume(e.target.files?.[0])}
          data-testid="ppm-resume-input"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resumeRef.current?.click()}
            disabled={resumeUploading}
            data-testid="ppm-resume-btn"
          >
            {resumeUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
            {state.resume_url ? "Replace résumé" : "Upload résumé (PDF or DOCX)"}
          </Button>
          {state.resume_url && (
            <>
              <a
                href={state.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-700 underline"
                data-testid="ppm-resume-link"
              >
                View current
              </a>
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, resume_url: "" }))}
                className="text-sm text-red-600 hover:underline flex items-center gap-1"
                data-testid="ppm-resume-remove"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* Portfolio media */}
      <div className="mb-8" data-testid="ppm-portfolio-media">
        <div className="overline mb-2">Portfolio media (images &amp; videos)</div>
        <AttachmentUploader
          value={mediaItems}
          onChange={(items) => setState((s) => ({ ...s, portfolio: [...items.map((m) => ({ ...m, type: (m.type || "").startsWith("video/") ? "video" : "image" })), ...linkItems] }))}
          max={12}
          maxSizeMB={25}
          testId="ppm-portfolio-uploader"
        />
      </div>

      {/* Portfolio links */}
      <div className="mb-8" data-testid="ppm-portfolio-links">
        <div className="overline mb-2">Portfolio links</div>
        <div className="flex gap-2 mb-3">
          <Input
            value={portfolioLink}
            onChange={(e) => setPortfolioLink(e.target.value)}
            placeholder="https://your-portfolio-site.com"
            className="rounded-none"
            data-testid="ppm-link-input"
          />
          <Button
            variant="outline"
            onClick={addPortfolioLink}
            className="rounded-none"
            data-testid="ppm-link-add"
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
        {linkItems.length > 0 && (
          <ul className="space-y-1 text-sm">
            {linkItems.map((p, i) => {
              const globalIdx = (state.portfolio || []).indexOf(p);
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 py-2 border-b border-neutral-100"
                  data-testid={`ppm-link-item-${i}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <LinkIcon className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-700 hover:underline">
                      {p.url}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePortfolio(globalIdx)}
                    className="text-neutral-400 hover:text-red-600"
                    aria-label="Remove portfolio link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Social profiles */}
      <div className="mb-6" data-testid="ppm-socials">
        <div className="overline mb-3">Social profiles</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {SOCIAL_FIELDS.map(({ key, label, Icon, placeholder }) => (
            <div key={key} className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-neutral-500 flex-shrink-0" aria-hidden />
              <Input
                value={state.social_links?.[key] || ""}
                onChange={(e) => setSocial(key, e.target.value)}
                placeholder={placeholder}
                className="rounded-none text-sm"
                aria-label={label}
                data-testid={`ppm-social-${key}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 flex items-center gap-3">
        <Button
          onClick={save}
          disabled={!dirty || busy}
          className="bg-black hover:bg-neutral-800 text-white"
          data-testid="ppm-save"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Save portfolio &amp; media
        </Button>
        {!dirty && <span className="text-xs text-neutral-500 font-mono">All saved</span>}
      </div>
    </section>
  );
}
