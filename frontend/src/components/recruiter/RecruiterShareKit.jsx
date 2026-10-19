import React, { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Copy, Download, MapPin, Share2, Search } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const copy = async (text, label = "Copied") => {
  try { await navigator.clipboard.writeText(text); toast.success(label); } catch { toast.error("Copy failed"); }
};

const CityPicker = ({ value, onPick }) => {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return undefined; }
    const t = setTimeout(() => api.get(`/recruit/cities?q=${encodeURIComponent(q)}&limit=8`).then((r) => setHits(r.data.items || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative" data-testid="share-kit-city-picker">
      <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Recruiting in ${value || "…"}? Change city`}
        className="w-full h-10 pl-9 pr-3 border border-slate-300 focus:border-slate-900 focus:outline-none text-sm" data-testid="share-kit-city-input" />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 shadow-xl">
          {hits.map((c) => (
            <button key={c.slug} onClick={() => { onPick(c.slug); setQ(""); setHits([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between" data-testid={`share-kit-city-${c.slug}`}>
              <span>{c.city}</span><span className="text-xs text-slate-500">{c.country === "US" ? c.state : c.country_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PostCard = ({ p, url }) => {
  const enc = encodeURIComponent;
  const links = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(p.text)}`,
    whatsapp: `https://wa.me/?text=${enc(p.text)}`,
    x: `https://twitter.com/intent/tweet?text=${enc(p.text)}`,
  };
  return (
    <div className="border border-slate-200 p-4 flex flex-col" data-testid={`share-kit-post-${p.key}`}>
      <div className="overline">{p.label}</div>
      <p className="text-sm text-slate-700 mt-2 whitespace-pre-line flex-1" data-no-i18n="true">{p.text}</p>
      <div className="flex gap-2 mt-3">
        <button onClick={() => copy(p.text, "Post copied")} className="px-3 py-1.5 text-xs border border-slate-300 hover:border-slate-900 flex items-center gap-1.5 transition-colors" data-testid={`share-kit-copy-${p.key}`}>
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
        {links[p.key] && (
          <a href={links[p.key]} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1.5 transition-colors" data-testid={`share-kit-open-${p.key}`}>
            <Share2 className="w-3.5 h-3.5" /> Share
          </a>
        )}
      </div>
    </div>
  );
};

export const RecruiterShareKit = () => {
  const [city, setCity] = useState(null);
  const [kit, setKit] = useState(null);
  const qrRef = useRef(null);
  useEffect(() => {
    api.get(`/referrals/share-kit${city ? `?city=${city}` : ""}`).then((r) => setKit(r.data)).catch(() => {});
  }, [city]);
  if (!kit) return null;
  const photo = `${BACKEND}/api/img/city/${kit.city.slug}.jpg`;
  const downloadQr = () => {
    const a = document.createElement("a");
    a.href = qrRef.current.querySelector("canvas").toDataURL("image/png");
    a.download = `lumo-recruit-${kit.city.slug}.png`;
    a.click();
  };

  return (
    <section className="mt-12 border border-slate-200" data-testid="recruiter-share-kit">
      <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="overline">Your share kit</div>
          <div className="font-display text-2xl font-black mt-1 flex items-center gap-2" data-testid="share-kit-city-name">
            <MapPin className="w-5 h-5 text-teal-700" />{kit.city.name}
          </div>
        </div>
        <div className="w-full sm:w-80"><CityPicker value={kit.city.name} onPick={setCity} /></div>
      </div>
      <div className="grid md:grid-cols-[1fr_220px] gap-px bg-slate-200">
        <div className="bg-white p-5">
          <img src={photo} alt={kit.city.name} className="w-full aspect-[16/9] object-cover" data-testid="share-kit-photo" />
          <div className="flex flex-wrap gap-2 mt-3">
            <a href={photo} download={`lumo-${kit.city.slug}.jpg`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs border border-slate-300 hover:border-slate-900 flex items-center gap-1.5 transition-colors" data-testid="share-kit-photo-download">
              <Download className="w-3.5 h-3.5" /> City photo
            </a>
            <button onClick={() => copy(kit.share_url, "Link copied")} className="px-3 py-1.5 text-xs bg-teal-700 text-white hover:bg-teal-800 flex items-center gap-1.5 transition-colors" data-testid="share-kit-copy-link">
              <Copy className="w-3.5 h-3.5" /> Copy my {kit.city.name} link
            </button>
          </div>
          <div className="font-mono text-[11px] text-slate-500 mt-2 break-all" data-testid="share-kit-link" data-no-i18n="true">{kit.share_url}</div>
        </div>
        <div className="bg-white p-5 flex flex-col items-center justify-center gap-3" ref={qrRef} data-testid="share-kit-qr">
          <QRCodeCanvas value={kit.share_url} size={168} includeMargin level="M" />
          <button onClick={downloadQr} className="px-3 py-1.5 text-xs border border-slate-300 hover:border-slate-900 flex items-center gap-1.5 transition-colors" data-testid="share-kit-qr-download">
            <Download className="w-3.5 h-3.5" /> Download QR
          </button>
          <p className="text-[11px] text-slate-500 text-center">Print it on flyers or show it from your phone.</p>
        </div>
      </div>
      <div className="p-5 grid sm:grid-cols-2 gap-3" data-testid="share-kit-posts">
        {kit.posts.map((p) => <PostCard key={p.key} p={p} url={kit.share_url} />)}
      </div>
    </section>
  );
};
