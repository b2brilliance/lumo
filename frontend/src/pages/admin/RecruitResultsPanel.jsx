import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BarChart3, MousePointerClick, UserPlus, Share2, Loader2 } from "lucide-react";

const SOURCES = [["facebook", "Facebook"], ["instagram", "Instagram"], ["all", "All sources"]];
const DAYS = [7, 30, 90];

const Stat = ({ icon: Icon, label, value, testid }) => (
  <div className="p-4 border border-slate-200" data-testid={testid}>
    <div className="text-xs text-slate-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</div>
    <div className="font-display text-2xl font-black mt-1">{value}</div>
  </div>
);

const Table = ({ title, head, rows, testid }) => (
  <div className="border border-slate-200" data-testid={testid}>
    <div className="p-3 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">{title}</div>
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-slate-500"><tr>{head.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={head.length} className="p-6 text-center text-slate-400">No data yet</td></tr>}
        {rows}
      </tbody>
    </table>
  </div>
);

export default function RecruitResultsPanel() {
  const [source, setSource] = useState("facebook");
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setData(null); setErr(false);
    api.get(`/admin/attribution/report?source=${source}&days=${days}`).then((r) => setData(r.data)).catch(() => setErr(true));
  }, [source, days]);
  const conv = (s, c) => (c ? `${Math.round((s / c) * 100)}%` : "—");

  return (
    <section className="border border-slate-200 p-4 space-y-4" data-testid="admin-recruit-results">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="overline flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Sign-up tracking</div>
        <div className="flex gap-2">
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-8 border border-slate-300 px-2 text-sm" data-testid="recruit-results-source">
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 border border-slate-300 px-2 text-sm" data-testid="recruit-results-days">
            {DAYS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
      </div>
      {!data && !err && <div className="text-sm text-slate-500 flex items-center gap-2" data-testid="recruit-results-loading"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
      {err && <div className="text-sm text-red-600" data-testid="recruit-results-error">Couldn't load tracking data. Try again.</div>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={Share2} label="Posts shared to FB" value={data.totals.posts_shared} testid="recruit-results-shared" />
            <Stat icon={MousePointerClick} label="Clicks" value={data.totals.clicks} testid="recruit-results-clicks" />
            <Stat icon={UserPlus} label="Contractor sign-ups" value={data.totals.signups} testid="recruit-results-signups" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Table title="Top posts" testid="recruit-results-posts" head={["Post", "Clicks", "Sign-ups", "Conv."]}
              rows={data.posts.map((p) => (
                <tr key={p.key} className="border-t border-slate-100" data-testid={`recruit-results-post-${p.key}`}>
                  <td className="p-2 max-w-[260px]"><div className="truncate font-medium" data-no-i18n="true">{p.title}</div><div className="text-xs text-slate-500">{p.city}</div></td>
                  <td className="p-2">{p.clicks}</td><td className="p-2 font-bold">{p.signups}</td><td className="p-2">{conv(p.signups, p.clicks)}</td>
                </tr>
              ))} />
            <Table title="Top cities" testid="recruit-results-cities" head={["City", "Clicks", `From ${source === "all" ? "social" : source}`, "All sign-ups"]}
              rows={data.cities.map((c) => (
                <tr key={c.slug} className="border-t border-slate-100" data-testid={`recruit-results-city-${c.slug}`}>
                  <td className="p-2"><div className="font-medium">{c.city}</div><div className="text-xs text-slate-500">{c.where}</div></td>
                  <td className="p-2">{c.clicks}</td><td className="p-2 font-bold">{c.from_source}</td><td className="p-2">{c.signups}</td>
                </tr>
              ))} />
          </div>
        </>
      )}
    </section>
  );
}
