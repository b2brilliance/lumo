import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Gift } from "lucide-react";
import { toast } from "sonner";

/**
 * "Refer & earn" card — surfaces the user's own referral code, share link,
 * and running totals. Data is fetched from GET /api/referrals/me.
 *
 * Drop-in usage anywhere in the auth'd shell (Wallet, ProviderHub, Settings):
 *   <ReferralCard />
 *
 * Backend rule: referrer earns 1% of Lumo's 10% commission on every paid
 * job or order completed by someone they signed up. Wired via the
 * `_credit_referrer()` hook in `_credit_provider` so escrow, Stripe
 * Connect transfers, and simulated wallet credits all trigger it.
 */
export default function ReferralCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get("/referrals/me");
        if (alive) setData(r.data);
      } catch { /* no-op — silently degrade */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return null;
  if (!data) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(data.code);
      toast.success("Code copied");
    } catch { toast.error("Copy failed"); }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.share_url);
      toast.success("Link copied");
    } catch { toast.error("Copy failed"); }
  };
  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Lumo",
          text: "Get paid jobs, delivery, rentals — join me on Lumo.",
          url: data.share_url,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  return (
    <section
      className="border border-slate-200 bg-white"
      data-testid="referral-card"
    >
      <div className="p-6 border-b border-slate-200 flex items-start justify-between gap-4">
        <div>
          <div className="overline flex items-center gap-2">
            <Gift className="w-4 h-4 text-teal-700" />
            Refer &amp; earn
          </div>
          <div className="mt-2 font-display text-3xl font-black tracking-tighter">
            ${Number(data.total_earned || 0).toFixed(2)}
            <span className="text-base font-normal text-slate-500 ml-2">earned</span>
          </div>
          <p className="text-xs text-slate-500 mt-1" data-no-i18n="true">
            {data.reward_copy}
          </p>
        </div>
        <div className="text-right font-mono text-xs text-slate-500 whitespace-nowrap">
          <div>{data.referred_users} referred</div>
          <div>{data.events} events</div>
        </div>
      </div>

      <div className="p-6 grid gap-3">
        <div>
          <div className="overline text-slate-500 mb-1">Your code</div>
          <div className="flex items-stretch gap-0">
            <code
              className="flex-1 border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-lg font-bold tracking-widest"
              data-testid="referral-code"
              data-no-i18n="true"
            >
              {data.code}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyCode}
              className="rounded-none border-l-0"
              data-testid="referral-copy-code"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div>
          <div className="overline text-slate-500 mb-1">Share link</div>
          <div className="flex items-stretch gap-0">
            <input
              readOnly
              value={data.share_url || ""}
              className="flex-1 border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700"
              data-testid="referral-share-url"
              onFocus={(e) => e.target.select()}
              data-no-i18n="true"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="rounded-none border-l-0"
              data-testid="referral-copy-link"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={shareLink}
              className="rounded-none bg-slate-900 hover:bg-slate-800 text-white"
              data-testid="referral-share-btn"
            >
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
          </div>
        </div>

        {data.recent && data.recent.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs font-mono uppercase tracking-wider text-slate-500 cursor-pointer">
              Recent earnings
            </summary>
            <ul className="mt-2 divide-y divide-slate-100">
              {data.recent.map((r, i) => (
                <li key={i} className="py-2 flex justify-between text-xs" data-testid={`referral-recent-${i}`}>
                  <span className="text-slate-500">{r.source_type} · {new Date(r.created_at).toLocaleDateString()}</span>
                  <span className="font-mono font-bold text-teal-700">+${Number(r.amount || 0).toFixed(4)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* ── Provider recruit milestones ($25 at N jobs) ─────────────── */}
      {(data.recruits && data.recruits.length > 0) || Number(data.milestone_bonus_amount) > 0 ? (
        <div className="border-t border-slate-200 bg-slate-50/60 p-6" data-testid="referral-milestones">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="overline flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-600" />
                ${Number(data.milestone_bonus_amount || 0).toFixed(0)} milestone bonus
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-md">
                Every provider you invite who completes {data.milestone_bonus_goal || 10} paid jobs
                puts a flat ${Number(data.milestone_bonus_amount || 0).toFixed(0)} in your wallet —
                on top of the per-job commission split above.
              </p>
            </div>
            <div className="text-right font-mono text-xs text-slate-500 whitespace-nowrap" data-testid="referral-milestone-totals">
              <div className="font-display font-bold text-lg text-black">
                ${Number(data.milestone_total_earned || 0).toFixed(0)}
              </div>
              <div>{data.milestone_awarded_count || 0} paid</div>
            </div>
          </div>
          {data.recruits && data.recruits.length > 0 ? (
            <ul className="divide-y divide-slate-100 border border-slate-200 bg-white" data-testid="referral-recruits">
              {data.recruits.slice(0, 5).map((r) => {
                const goal = r.milestone_goal || 10;
                const pct = Math.min(100, Math.round((r.jobs_completed / goal) * 100));
                return (
                  <li key={r.id} className="p-3 flex items-center gap-3" data-testid={`referral-recruit-${r.id}`}>
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-display font-bold flex-shrink-0">
                        {(r.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-display font-semibold text-sm truncate">{r.name}</div>
                        <div className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {r.milestone_awarded ? (
                            <span className="text-teal-700 font-bold">+${Number(data.milestone_bonus_amount).toFixed(0)} paid</span>
                          ) : (
                            <>{r.jobs_completed}/{goal} jobs</>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full ${r.milestone_awarded ? "bg-teal-600" : "bg-amber-500"} transition-all`}
                          style={{ width: `${r.milestone_awarded ? 100 : pct}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic" data-testid="referral-recruits-empty">
              No providers signed up with your code yet. Share your link above to start earning.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
