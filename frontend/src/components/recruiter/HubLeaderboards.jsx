import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { RecruiterLeaderboard } from "@/components/recruiter/RecruiterLeaderboard";
import { Medal } from "lucide-react";

const TABS = [
  { key: "month", label: "This month" },
  { key: "alltime", label: "All-time" },
  { key: "city", label: "My city" },
];
const RANK = ["bg-amber-400", "bg-slate-300", "bg-orange-300"];

const Board = ({ scope }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/recruiter-hub/leaderboard?scope=${scope}`).then((r) => setData(r.data)).catch(() => setData({ rows: [] }));
  }, [scope]);
  if (!data) return <div className="h-40 bg-slate-50 animate-pulse" />;
  if (scope === "city" && !data.city) {
    return <p className="p-10 text-center text-sm text-slate-500" data-testid="hub-board-no-city">Add your address in Settings to see recruiters in your city.</p>;
  }
  return (
    <div data-testid={`hub-board-${scope}`}>
      {scope === "city" && <div className="px-5 pt-4 overline text-teal-700" data-testid="hub-board-city-name">{data.city}</div>}
      <ol className="divide-y divide-slate-200">
        {data.rows.length === 0 && <li className="p-10 text-center text-sm text-slate-500" data-testid={`hub-board-${scope}-empty`}>No recruiters here yet. Be the first.</li>}
        {data.rows.map((r) => (
          <li key={`${r.rank}-${r.name}`} className={`px-5 py-4 flex items-center gap-4 ${r.is_me ? "bg-teal-50" : ""}`} data-testid={`hub-board-${scope}-row-${r.rank}`}>
            <span className={`h-9 min-w-9 px-2 rounded-full flex items-center justify-center gap-1 font-display font-black text-sm ${RANK[r.rank - 1] || "bg-slate-100 text-slate-600"}`}>
              {r.rank <= 3 && <Medal className="w-3.5 h-3.5" />}{r.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate" data-no-i18n="true">{r.name}{r.is_me && <span className="ml-2 text-[11px] font-mono text-teal-700">YOU</span>}</div>
              {r.city && <div className="text-xs text-slate-500">{r.city}</div>}
            </div>
            {[["active_recruits", "active recruits"], ["jobs", "crew jobs"], ["recruits", "recruited"]].map(([k, l]) => (
              <div key={k} className={`text-right w-28 ${k === "recruits" ? "hidden sm:block" : ""}`}>
                <div className="font-display text-xl font-black">{r[k]}</div>
                <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap">{l}</div>
              </div>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
};

export const HubLeaderboards = () => {
  const [tab, setTab] = useState("month");
  return (
    <section className="mt-12" data-testid="hub-leaderboards">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base md:text-lg font-black">Leaderboards</h2>
        <div className="inline-flex rounded-full border border-slate-200 p-1 bg-white">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} data-testid={`hub-tab-${t.key}`}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t.key ? "bg-slate-950 text-white" : "text-slate-600 hover:text-black"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "month" ? <RecruiterLeaderboard /> : <div className="mt-6 border border-slate-900"><Board scope={tab} /></div>}
    </section>
  );
};
