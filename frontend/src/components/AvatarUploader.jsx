import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Camera, X, Loader2 } from "lucide-react";

/**
 * Compact circular avatar uploader. Uses POST /api/media/upload-avatar when
 * `anonymous` (sign-up flow, no JWT yet); otherwise the authenticated
 * /api/media/upload endpoint.
 *
 * Props:
 *   value: current avatar_url string (or null)
 *   onChange: (newUrl: string | null) => void
 *   size: pixels for the circular avatar (default 96)
 *   anonymous: true → use the public endpoint
 *   required: true → render a red asterisk in the label
 */
export default function AvatarUploader({
  value,
  onChange,
  size = 96,
  anonymous = false,
  required = false,
  testid = "avatar-uploader",
}) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const displayUrl = value && (value.startsWith("http") ? value : `${BACKEND_URL}${value}`);

  const handle = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large — must be under 5MB");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const endpoint = anonymous ? "/media/upload-avatar" : "/media/upload";
      const { data } = await api.post(endpoint, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.media_url);
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error("Upload failed — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4" data-testid={testid}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="relative group rounded-full overflow-hidden border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center hover:border-teal-700 transition-colors flex-shrink-0"
        style={{ width: size, height: size }}
        data-testid={`${testid}-trigger`}
      >
        {displayUrl ? (
          <>
            <img src={displayUrl} alt="" className="w-full h-full object-cover" data-testid={`${testid}-preview`} />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </>
        ) : busy ? (
          <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
        ) : (
          <Camera className="w-5 h-5 text-slate-500" />
        )}
      </button>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">
          Profile photo {required && <span className="text-red-600">*</span>}
        </span>
        <span className="text-[11px] text-slate-400">JPG · PNG · WebP · up to 5MB</span>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="text-xs font-mono uppercase tracking-wider border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
            data-testid={`${testid}-pick`}
          >
            {busy ? "Uploading…" : displayUrl ? "Change" : "Upload"}
          </button>
          {displayUrl && !busy && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs font-mono uppercase tracking-wider border border-slate-300 px-2 py-1 hover:bg-red-50 hover:border-red-300 hover:text-red-700 inline-flex items-center gap-1"
              data-testid={`${testid}-remove`}
            >
              <X className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
        data-testid={`${testid}-input`}
      />
    </div>
  );
}
