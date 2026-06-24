import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Upload, X, FileVideo, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function MediaUpload({ value, onChange, label = "Attach photo or video (optional)" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange({ media_url: data.media_url, media_type: data.media_type, id: data.id });
      toast.success("Media attached");
    } catch (e) {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) handle(e.dataTransfer.files[0]);
  };

  if (value?.media_url) {
    const url = value.media_url.startsWith("http") ? value.media_url : `${BACKEND_URL}${value.media_url}`;
    const isVideo = value.media_type?.startsWith("video");
    return (
      <div className="relative border border-slate-300 p-2" data-testid="media-preview">
        {isVideo ? (
          <video src={url} className="w-full max-h-48 object-cover" controls />
        ) : (
          <img src={url} alt="" className="w-full max-h-48 object-cover" />
        )}
        <button
          onClick={() => onChange({ media_url: null, media_type: null })}
          className="absolute top-2 right-2 bg-white border border-slate-300 p-1 hover:bg-slate-50"
          data-testid="media-clear-btn"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="overline mb-2">{label}</div>
      <div
        className="border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center cursor-pointer hover:border-teal-700 transition-colors"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        data-testid="media-dropzone"
      >
        <Upload className="w-5 h-5 mx-auto mb-2 text-slate-500" />
        <div className="text-sm text-slate-600">{busy ? "Uploading…" : "Click or drop to upload"}</div>
        <div className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-2">
          <ImageIcon className="w-3 h-3" /> JPG · PNG · WebP
          <FileVideo className="w-3 h-3 ml-2" /> MP4 (max 25MB)
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
          data-testid="media-file-input"
        />
      </div>
    </div>
  );
}
