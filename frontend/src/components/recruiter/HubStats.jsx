import React from "react";
import { Users, UserCheck, Briefcase, Wallet } from "lucide-react";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export const HubStats = ({ s }) => {
  const cards = [
    { key: "recruits", label: "People recruited", value: s.recruits, icon: Users },
    { key: "active", label: "Active recruits", value: s.active_recruits, icon: UserCheck, hint: "finished at least 1 job" },
    { key: "jobs", label: "Jobs completed by crew", value: s.jobs_completed, icon: Briefcase },
    { key: "earned", label: "Total earned", value: money(s.total_earned), icon: Wallet,
      hint: `${money(s.commission_earned)} commission + ${money(s.bonuses_earned)} bonuses`, dark: true },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 mt-12" data-testid="hub-stats">
      {cards.map((c, i) => (
        <div key={c.key} className={`p-6 hub-rise ${c.dark ? "bg-slate-950 text-white" : "bg-white"}`}
             style={{ animationDelay: `${i * 70}ms` }} data-testid={`hub-stat-${c.key}`}>
          <c.icon className={`w-5 h-5 ${c.dark ? "text-amber-300" : "text-teal-700"}`} />
          <div className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-4" data-testid={`hub-stat-${c.key}-value`}>{c.value}</div>
          <div className={`text-xs mt-1 font-mono uppercase tracking-wider ${c.dark ? "text-white/60" : "text-slate-500"}`}>{c.label}</div>
          {c.hint && <div className={`text-[11px] mt-2 ${c.dark ? "text-white/50" : "text-slate-400"}`}>{c.hint}</div>}
        </div>
      ))}
    </div>
  );
};
