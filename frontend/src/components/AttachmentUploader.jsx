/**
 * <AttachmentUploader />
 *
 * Reusable image + video uploader used in two places:
 *   1. Order wizard (customer attaches reference photos/videos of what
 *      they need — hairstyle ref, roadside issue video, pet photo, etc.)
 *   2. Provider profile (portfolio pieces — work photos + demo reels).
 *
 * Props:
 *   value       — controlled array of { id, url, type } entries
 *   onChange    — receives the new array
 *   max         — max number of attachments (default 6)
 *   maxSizeMB   — per-file size cap (default 25 for auth, 5 for public)
 *   endpoint    — POST endpoint (default "/media/upload" for authed)
 *   accept      — file input accept string (default images + videos)
 *   dense       — compact styling for small screens
 *   testId      — root data-testid
 */
import React, { useRef, useState } from "react";
import { Loader2, Upload, X, Image as ImageIcon, Film } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function AttachmentUploader({
  value = [],
  onChange,
  max = 6,
  maxSizeMB = 25,
  endpoint = "/media/upload",
  accept = "image/*,video/*",
  dense = false,
  testId = "attachment-uploader",
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const remaining = Math.max(0, max - value.length);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    if (remaining === 0) {
      toast.error(`Max ${max} attachments`);
      return;
    }
    setUploading(true);
    const next = [...value];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`${file.name} is over ${maxSizeMB} MB`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const { data } = await api.post(endpoint, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        next.push({
          id: data.id,
          url: data.media_url,
          type: data.media_type || file.type || "application/octet-stream",
          name: file.name,
        });
      } catch (e) {
        toast.error(formatApiError(e));
      }
    }
    onChange?.(next);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (i) => {
    const next = value.filter((_, idx) => idx !== i);
    onChange?.(next);
  };

  return (
    <div className={`space-y-3 ${dense ? "text-sm" : ""}`} data-testid={testId}>
      <div
        className={`grid ${dense ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"} gap-2`}
        data-testid={`${testId}-grid`}
      >
        {value.map((att, i) => {
          const isVideo = (att.type || "").startsWith("video/");
          return (
            <div
              key={att.id || i}
              className="relative aspect-square border border-neutral-200 bg-neutral-50 overflow-hidden group"
              data-testid={`${testId}-item-${i}`}
            >
              {isVideo ? (
                <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                  <Film className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-mono px-1 truncate max-w-full">{att.name || "video"}</span>
                </div>
              ) : (
                <img
                  src={att.url}
                  alt={att.name || "attachment"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white hover:bg-black flex items-center justify-center opacity-90 group-hover:opacity-100"
                data-testid={`${testId}-remove-${i}`}
                aria-label="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-square border border-dashed border-neutral-300 hover:border-black text-neutral-500 hover:text-black flex flex-col items-center justify-center gap-1 text-xs transition-colors"
            data-testid={`${testId}-add`}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span className="font-mono">Add photo / video</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid={`${testId}-input`}
      />

      <p className="text-[11px] text-neutral-500 font-mono">
        <ImageIcon className="inline w-3 h-3 mr-1 -mt-0.5" />
        {value.length}/{max} attached · up to {maxSizeMB} MB each · JPG, PNG, MP4, MOV
      </p>
    </div>
  );
}
