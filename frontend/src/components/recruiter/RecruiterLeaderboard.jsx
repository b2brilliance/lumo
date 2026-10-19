import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Trophy, Medal } from "lucide-react";

const monthLabel = (m) => {
  try { return new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }); } catch { return m; }
};
const prevMonth = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};
const RANK_STYLE = ["bg-amber-400 text-black", "bg-slate-300 text-black", "bg-orange-300 text-black"];

export const RecruiterLeaderboard = () => {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(null);
  useEffect(() => {
    api.get(`/referrals/leaderboard${month ? `?month=${month}` : ""}`).then((r) => setData(r.data)).catch(() => setData({ rows: [] }));
  }, [month]);
  const current = data?.month;

  return (
    <section className="mt-12 border border-slate-900" data-testid="recruiter-leaderboard-public">
      <div className="p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="overline text-amber-300 flex items-center gap-2"><Trophy className="w-4 h-4" /> Top recruiters</div>
          <div className="font-display text-2xl font-black mt-1" data-testid="leaderboard-month">{current ? monthLabel(current) : "…"}</div>
        </div>
        {current && (
          <div className="flex gap-2 text-xs">
            <button onClick={() => setMonth(prevMonth(current))} className="px-3 py-1.5 rounded-full border border-white/30 hover:bg-white/10 transition-colors" data-testid="leaderboard-prev">← Previous month</button>
            {month && <button onClick={() => setMonth(null)} className="px-3 py-1.5 rounded-full bg-white text-black" data-testid="leaderboard-current">This month</button>}
          </div>
        )}
      </div>
      <ol className="divide-y divide-slate-200" data-testid="leaderboard-rows">
        {data && data.rows.length === 0 && (
          <li className="p-8 text-center text-slate-500" data-testid="leaderboard-empty">
            No one is on the board yet this month. Share your link and claim the #1 spot.
          </li>
        )}
        {(data?.rows || []).map((r) => (
          <li key={r.rank} className="p-4 flex items-center gap-4" data-testid={`leaderboard-row-${r.rank}`}>
            <span className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-black text-sm ${RANK_STYLE[r.rank - 1] || "bg-slate-100 text-slate-600"}`}>
              {r.rank <= 3 ? <Medal className="w-4 h-4" /> : r.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate" data-no-i18n="true">{r.name}</div>
              {r.city && <div className="text-xs text-slate-500">{r.city}</div>}
            </div>
            <div className="text-right">
              <div className="font-display text-xl font-black">{r.jobs.toLocaleString()}</div>
              <div className="text-[11px] text-slate-500 font-mono">crew jobs</div>
            </div>
            <div className="text-right w-20">
              <div className="font-display text-xl font-black">{r.recruits}</div>
              <div className="text-[11px] text-slate-500 font-mono">new recruits</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};
