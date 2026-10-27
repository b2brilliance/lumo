import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const ROLE = { customer: "Customer", provider: "Worker", retailer: "Seller", restaurant: "Seller", real_estate: "Real estate" };
const date = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

const JobList = ({ jobs, id }) => (
  <ul className="bg-slate-50 border-t border-slate-200 divide-y divide-slate-200" data-testid={`hub-recruit-jobs-${id}`}>
    {jobs.length === 0 && <li className="px-5 py-4 text-xs text-slate-500">No completed jobs yet.</li>}
    {jobs.map((j) => (
      <li key={j.id} className="px-5 py-3 flex items-center gap-4 text-sm" data-testid={`hub-job-${j.id}`}>
        <span className="flex-1 min-w-0 truncate font-medium" data-no-i18n="true">{j.title}</span>
        <span className="font-mono text-xs text-slate-500 w-28 text-right">{date(j.completed_at)}</span>
        <span className="font-mono text-xs w-20 text-right">${Number(j.gross || 0).toFixed(2)}</span>
        <span className="font-mono text-xs w-24 text-right text-teal-700 font-bold">+${Number(j.you_earned || 0).toFixed(2)}</span>
      </li>
    ))}
  </ul>
);

const Row = ({ r }) => {
  const [open, setOpen] = useState(false);
  return (
    <li data-testid={`hub-recruit-${r.id}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors" data-testid={`hub-recruit-toggle-${r.id}`}>
        {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" /> : (
          <span className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-display font-bold">{(r.name || "?")[0].toUpperCase()}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold truncate" data-no-i18n="true" data-testid={`hub-recruit-name-${r.id}`}>{r.name}</div>
          <div className="text-xs text-slate-500">{ROLE[r.role] || "Member"} · joined {date(r.joined_at)}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-black" data-testid={`hub-recruit-jobcount-${r.id}`}>{r.jobs_completed}</div>
          <div className="text-[11px] font-mono text-slate-500">jobs done</div>
        </div>
        <div className="text-right w-24 hidden sm:block">
          <div className="font-display text-xl font-black text-teal-700">${r.you_earned.toFixed(2)}</div>
          <div className="text-[11px] font-mono text-slate-500">you earned</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <JobList jobs={r.jobs} id={r.id} />}
    </li>
  );
};

export const HubRecruits = ({ rows }) => (
  <section className="mt-12 border border-slate-200" data-testid="hub-recruits">
    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <div className="overline">People you recruited</div>
      <span className="font-mono text-xs text-slate-500">{rows.length} total · tap a name to see their jobs</span>
    </div>
    {rows.length === 0 ? (
      <p className="p-10 text-center text-sm text-slate-500" data-testid="hub-recruits-empty">
        No one has joined with your link yet. Share it and your crew will show up here.
      </p>
    ) : (
      <ul className="divide-y divide-slate-200">{rows.map((r) => <Row key={r.id} r={r} />)}</ul>
    )}
  </section>
);
