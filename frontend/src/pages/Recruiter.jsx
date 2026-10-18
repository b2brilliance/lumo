import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReferralCard from "@/components/ReferralCard";
import { Users, Share2, TrendingUp, Gift } from "lucide-react";

const STEPS = [
  { icon: Share2, title: "Share your link", body: "Every Lumo account gets a personal recruit link and code." },
  { icon: Users, title: "People join and work", body: "Friends sign up as workers and take delivery, errand and service jobs." },
  { icon: TrendingUp, title: "You earn on every job", body: "A cut of every job they complete lands in your wallet, forever." },
];

export default function Recruiter() {
  const { user } = useAuth();
  const [prog, setProg] = useState(null);
  useEffect(() => { api.get("/referrals/program").then((r) => setProg(r.data)).catch(() => {}); }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16" data-testid="recruiter-page">
      <div className="overline text-teal-700">Lumo Recruiter Program</div>
      <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter mt-3 max-w-3xl">
        Build a crew. Earn on every job they do.
      </h1>
      <p className="mt-5 text-slate-600 max-w-2xl">
        Recruit workers to Lumo and earn a percentage of every job they complete. Your rate climbs as your recruits finish more jobs.
      </p>

      <div className="grid md:grid-cols-3 gap-px bg-slate-200 border border-slate-200 mt-12">
        {STEPS.map((s, i) => (
          <div key={s.title} className="bg-white p-6" data-testid={`recruiter-step-${i}`}>
            <s.icon className="w-5 h-5 text-teal-700" />
            <div className="font-display font-bold text-lg mt-3">{s.title}</div>
            <p className="text-sm text-slate-600 mt-1">{s.body}</p>
          </div>
        ))}
      </div>

      {prog && (
        <section className="mt-12" data-testid="recruiter-ladder">
          <div className="overline">Your rate grows</div>
          <p className="text-sm text-slate-600 mt-1">
            Start at {prog.base_pct}% and gain +{prog.step_pct}% for every {prog.step_jobs.toLocaleString()} jobs your recruits complete (up to {prog.max_pct}%).
          </p>
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 border border-slate-200 divide-x divide-slate-200">
            {prog.ladder.map((l) => (
              <div key={l.jobs} className="p-4 text-center" data-testid={`ladder-${l.jobs}`}>
                <div className="font-display text-xl font-black">{l.rate_pct.toFixed(2)}%</div>
                <div className="font-mono text-[11px] text-slate-500 mt-1">{l.jobs.toLocaleString()}+ jobs</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-amber-600" />
            Plus a ${prog.milestone_bonus_amount} bonus when each recruit completes their first {prog.milestone_bonus_goal} jobs.
          </p>
        </section>
      )}

      <section className="mt-12">
        {user ? (
          <ReferralCard />
        ) : (
          <div className="border border-slate-900 p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="font-display text-2xl font-bold">Get your recruit link</div>
            <Link to="/register" className="btn-lumo btn-lumo-primary" data-testid="recruiter-signup-btn">Create free account</Link>
          </div>
        )}
      </section>
    </div>
  );
}
