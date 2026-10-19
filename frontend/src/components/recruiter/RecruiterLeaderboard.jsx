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
const TIER = {
  gold: { cls: "bg-amber-400 text-black", label: "Gold" },
  silver: { cls: "bg-slate-300 text-black", label: "Silver" },
  bronze: { cls: "bg-orange-300 text-black", label: "Bronze" },
};

export const BadgePill = ({ tier, count, testid }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${TIER[tier].cls}`} data-testid={testid}>
    <Medal className="w-3 h-3" />{TIER[tier].label}{count > 1 ? ` ×${count}` : ""}
  </span>
);

const HallOfFame = ({ rows }) => {
  if (!rows?.length) return null;
  return (
    <div className="p-4 border-t border-slate-200 bg-slate-50" data-testid="leaderboard-hall-of-fame">
      <div className="overline mb-2">Badge winners</div>
      <div className="flex flex-wrap gap-2">
        {rows.map((h) => (
          <span key={`${h.month}-${h.rank}`} className="inline-flex items-center gap-1.5 text-xs border border-slate-200 bg-white rounded-full pl-1 pr-3 py-0.5" data-testid={`hall-${h.month}-${h.rank}`}>
            <BadgePill tier={h.tier} count={1} /> <span data-no-i18n="true">{h.name}</span> <span className="text-slate-400">{monthLabel(h.month)}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

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
          <div className="overline !text-amber-300 flex items-center gap-2"><Trophy className="w-4 h-4" /> Top recruiters</div>
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
              <div className="font-bold truncate flex items-center gap-2" data-no-i18n="true">
                {r.name}
                {r.month_badge && <BadgePill tier={r.month_badge} count={1} testid={`leaderboard-month-badge-${r.rank}`} />}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {r.city && <span className="text-xs text-slate-500 mr-1">{r.city}</span>}
                {["gold", "silver", "bronze"].map((t) => [t, (r.badges?.[t] || 0) - (r.month_badge === t ? 1 : 0)])
                  .filter(([, n]) => n > 0).map(([t, n]) => (
                    <BadgePill key={t} tier={t} count={n} testid={`leaderboard-badges-${r.rank}-${t}`} />
                  ))}
              </div>
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
      <p className="px-4 pb-3 text-[11px] text-slate-500">The top 3 each month earn a Gold, Silver or Bronze recruiter badge.</p>
      <HallOfFame rows={data?.hall_of_fame} />
    </section>
  );
};

export const MyBadges = () => {
  const [badges, setBadges] = useState(null);
  useEffect(() => { api.get("/referrals/my-badges").then((r) => setBadges(r.data)).catch(() => setBadges([])); }, []);
  if (!badges) return null;
  return (
    <div className="mt-6 border border-slate-200 p-4" data-testid="my-recruiter-badges">
      <div className="overline mb-2">My badges</div>
      {badges.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="my-badges-empty">Finish in the top 3 this month to earn your first badge.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 text-xs" data-testid={`my-badge-${b.month}`}>
              <BadgePill tier={b.tier} count={1} /> #{b.rank} · {monthLabel(b.month)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
