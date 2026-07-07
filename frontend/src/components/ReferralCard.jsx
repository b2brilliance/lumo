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
          text: "Get paid jobs, delivery, rentals — workers keep 90%.",
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
    </section>
  );
}
