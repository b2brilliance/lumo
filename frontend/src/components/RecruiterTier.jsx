import React from "react";
import { TrendingUp } from "lucide-react";

export const RecruiterTier = ({ tier }) => {
  if (!tier) return null;
  return (
    <div className="border-t border-slate-200 p-6 bg-teal-50/40" data-testid="recruiter-tier">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="overline flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-700" /> Recruiter level {tier.level}
          </div>
          <div className="mt-1 font-display text-3xl font-black tracking-tighter" data-testid="recruiter-rate">
            {tier.rate_pct.toFixed(2)}%
            <span className="text-sm font-normal text-slate-500 ml-2">of every recruit job</span>
          </div>
        </div>
        <div className="text-right font-mono text-xs text-slate-500" data-testid="recruiter-total-jobs">
          <div className="font-display text-lg font-bold text-black">{tier.total_recruit_jobs.toLocaleString()}</div>
          <div>recruit jobs</div>
        </div>
      </div>
      <div className="mt-4 h-2 bg-slate-200 overflow-hidden">
        <div className="h-full bg-teal-700 transition-[width] duration-700" style={{ width: `${tier.progress_pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-600" data-testid="recruiter-next">
        {tier.at_max
          ? "You're at the top rate. Keep recruiting."
          : `${tier.jobs_to_next.toLocaleString()} more recruit jobs to reach ${tier.next_rate_pct.toFixed(2)}%.`}
      </p>
    </div>
  );
};
