import React, { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Globe2, Rss, Trash2, Wand2, Download } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useGlobalMarkets, flagOf } from "@/lib/useGlobalMarkets";

const SUBJECTS = [
  ["platform", "Lumo (whole app)"], ["recruit", "Recruit workers"], ["services", "Local services"],
  ["rentals", "Rentals"], ["homes", "Homes & real estate"], ["listing", "A marketplace listing"],
  ["real_estate", "A property"], ["auto", "A car"],
];

const copy = async (text, msg = "Copied") => { await navigator.clipboard.writeText(text); toast.success(msg); };

function FeedsPanel() {
  const [feeds, setFeeds] = useState([]);
  useEffect(() => { api.get("/admin/feeds").then(({ data }) => setFeeds(data)).catch(() => {}); }, []);
  return (
    <div className="border border-slate-200 p-5" data-testid="global-feeds-panel">
      <div className="flex items-center gap-2"><Rss className="w-4 h-4" /><div className="overline">Marketplace feeds (auto-sync)</div></div>
      <div className="mt-3 divide-y divide-slate-100">
        {feeds.map((f) => (
          <div key={f.key} className="py-3 flex flex-wrap items-center gap-3" data-testid={`feed-${f.key}`}>
            <div className="flex-1 min-w-[220px]">
              <div className="font-display font-bold text-sm">{f.name} <span className="font-mono text-xs text-slate-500">· {f.items} items</span></div>
              <div className="text-xs text-slate-500">{f.setup}</div>
              <div className="text-[11px] font-mono text-slate-700 truncate">{f.url}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => copy(f.url, "Feed URL copied")} data-testid={`feed-copy-${f.key}`}><Copy className="w-3.5 h-3.5 mr-1" />Copy URL</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function KitCard({ kit, onDelete }) {
  const full = `${kit.title}\n\n${kit.body}${kit.tags?.length ? `\n\n${kit.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")}` : ""}`;
  const post = async () => { await copy(full, "Ad copied — paste it into the post form"); window.open(kit.post_url, "_blank", "noopener"); };
  return (
    <div className="border border-slate-200 p-4 flex gap-4" data-testid={`ad-kit-${kit.id}`}>
      <img src={kit.image} alt="" className="w-24 h-24 object-cover bg-slate-100 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{flagOf(kit.country)} {kit.marketplace_name} · {kit.city} · {kit.lang}</div>
        <div className="font-display font-bold mt-1" dir="auto">{kit.title}</div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1 line-clamp-4" dir="auto" data-no-i18n="true">{kit.body}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={post} data-testid={`ad-kit-post-${kit.id}`}><ExternalLink className="w-3.5 h-3.5 mr-1" />Copy & open {kit.marketplace_name}</Button>
          <Button size="sm" variant="outline" onClick={() => copy(full)} data-testid={`ad-kit-copy-${kit.id}`}><Copy className="w-3.5 h-3.5 mr-1" />Copy text</Button>
          <a href={kit.image} download target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Download className="w-3.5 h-3.5 mr-1" />Image</Button></a>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDelete(kit.id)} data-testid={`ad-kit-delete-${kit.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

function AdKitComposer({ onCreated }) {
  const data = useGlobalMarkets();
  const [f, setF] = useState({ country: "NG", marketplace: "jiji_ng", subject: "platform", city: "", item_id: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const country = data?.countries.find((c) => c.code === f.country);
  const mkts = useMemo(() => (data && country ? data.marketplaces.filter((m) => country.marketplaces.includes(m.key)) : []), [data, country]);
  const needsItem = ["listing", "real_estate", "auto"].includes(f.subject);
  const setCountry = (code) => {
    const c = data.countries.find((x) => x.code === code);
    setF({ ...f, country: code, city: "", marketplace: c.marketplaces.find((k) => !["fb_marketplace", "fb_groups", "reddit", "locanto"].includes(k)) || c.marketplaces[0] });
  };
  const gen = async () => {
    setBusy(true);
    try {
      const { data: kit } = await api.post("/admin/ad-kits/generate", { ...f, city: f.city || null, item_id: f.item_id || null, notes: f.notes || null });
      toast.success("Ad kit ready");
      onCreated(kit);
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };
  if (!data) return <div className="text-sm text-slate-500">Loading markets…</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end" data-testid="ad-kit-composer">
      <Select value={f.country} onValueChange={setCountry}>
        <SelectTrigger data-testid="ad-kit-country"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-80">{data.countries.map((c) => <SelectItem key={c.code} value={c.code}>{flagOf(c.code)} {c.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={f.marketplace} onValueChange={(v) => setF({ ...f, marketplace: v })}>
        <SelectTrigger data-testid="ad-kit-marketplace"><SelectValue /></SelectTrigger>
        <SelectContent>{mkts.map((m) => <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={f.city || country?.cities[0]?.name} onValueChange={(v) => setF({ ...f, city: v })}>
        <SelectTrigger data-testid="ad-kit-city"><SelectValue /></SelectTrigger>
        <SelectContent>{country?.cities.map((c) => <SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v })}>
        <SelectTrigger data-testid="ad-kit-subject"><SelectValue /></SelectTrigger>
        <SelectContent>{SUBJECTS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      {needsItem
        ? <Input placeholder="Item ID" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })} data-testid="ad-kit-item" />
        : <Input placeholder="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="ad-kit-notes" />}
      <Button onClick={gen} disabled={busy} className="bg-slate-900 hover:bg-slate-800" data-testid="ad-kit-generate"><Wand2 className="w-4 h-4 mr-1" />{busy ? "Writing…" : "Generate ad"}</Button>
    </div>
  );
}

export default function GlobalAdKits() {
  const [kits, setKits] = useState([]);
  useEffect(() => { api.get("/admin/ad-kits").then(({ data }) => setKits(data)).catch(() => {}); }, []);
  const del = async (id) => { await api.delete(`/admin/ad-kits/${id}`); setKits((k) => k.filter((x) => x.id !== id)); };
  return (
    <div className="col-span-12 space-y-4" data-testid="global-ad-kits">
      <FeedsPanel />
      <div className="border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3"><Globe2 className="w-4 h-4" /><div className="overline">Global ad kits — 50 countries, 50+ marketplaces</div></div>
        <AdKitComposer onCreated={(k) => setKits((all) => [k, ...all])} />
        <div className="mt-4 space-y-2">{kits.map((k) => <KitCard key={k.id} kit={k} onDelete={del} />)}</div>
      </div>
    </div>
  );
}
