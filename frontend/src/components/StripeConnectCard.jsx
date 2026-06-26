import React, { useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Landmark, ExternalLink, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Stripe Connect onboarding + status card for providers.
 *
 * - Shows "Connect bank" CTA when not connected.
 * - Shows live status + Express dashboard link when connected.
 * - Auto-refreshes when the user returns from Stripe onboarding
 *   (we detect ?stripe=connected in the URL).
 */
export default function StripeConnectCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/stripe/connect/status");
      setStatus(data);
    } catch (e) {
      setStatus({ enabled: false, reason: formatApiError(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // If user just returned from Stripe onboarding, clean the URL and reload.
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("stripe") === "connected" || sp.get("stripe") === "refresh") {
      sp.delete("stripe");
      const newUrl =
        window.location.pathname +
        (sp.toString() ? `?${sp.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
      setTimeout(load, 500);
    }
  }, [load]);

  const onboard = async () => {
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/provider?stripe=connected`;
      const refreshUrl = `${window.location.origin}/provider?stripe=refresh`;
      const { data } = await api.post("/stripe/connect/onboard", {
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };

  const openDashboard = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/stripe/connect/dashboard-link");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-slate-200 p-4 text-sm text-slate-500 flex items-center gap-2" data-testid="stripe-connect-loading">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking bank connection…
      </div>
    );
  }

  if (!status?.enabled) {
    return (
      <div className="border border-slate-200 p-4 text-sm text-slate-500" data-testid="stripe-connect-disabled">
        Stripe Connect is not yet configured by the platform. Payouts will continue via in-app wallet.
      </div>
    );
  }

  const connected = !!status.connected;
  const ready = !!status.payouts_enabled;
  const due = status.requirements?.currently_due || [];
  const pastDue = status.requirements?.past_due || [];
  const disabledReason = status.requirements?.disabled_reason;

  return (
    <div
      className="border-2 p-5 rounded-none"
      style={{ borderColor: ready ? "#0d9488" : connected ? "#f59e0b" : "#cbd5e1" }}
      data-testid="stripe-connect-card"
    >
      <div className="flex items-start gap-4">
        <div
          className="w-10 h-10 grid place-items-center text-white"
          style={{ background: ready ? "#0d9488" : connected ? "#f59e0b" : "#0f172a" }}
        >
          <Landmark className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="overline">Bank payouts</div>
          {!connected && (
            <>
              <div className="font-display text-xl font-bold mt-1">Get paid to your bank</div>
              <p className="text-sm text-slate-600 mt-1">
                Connect a bank account via Stripe and your escrow releases & wallet
                withdrawals will pay out directly to you — no more in-app balance.
              </p>
            </>
          )}
          {connected && ready && (
            <>
              <div className="font-display text-xl font-bold mt-1 flex items-center gap-2 text-teal-700">
                <CheckCircle2 className="w-5 h-5" />
                Bank connected
              </div>
              <p className="text-sm text-slate-600 mt-1">
                Payouts will arrive in your bank account on Stripe&apos;s automatic
                schedule (typically 2 business days).
              </p>
            </>
          )}
          {connected && !ready && (
            <>
              <div className="font-display text-xl font-bold mt-1 flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5" />
                Onboarding incomplete
              </div>
              <p className="text-sm text-slate-600 mt-1">
                Stripe still needs a few details before they can pay you out.
                {disabledReason && <span className="block text-xs text-amber-700 mt-1">Reason: {disabledReason}</span>}
              </p>
              {(due.length > 0 || pastDue.length > 0) && (
                <ul className="text-xs text-amber-800 mt-2 list-disc list-inside">
                  {pastDue.slice(0, 4).map((r) => (
                    <li key={`pd-${r}`}>{r.replaceAll("_", " ")} <span className="font-bold">(past due)</span></li>
                  ))}
                  {due.slice(0, 4).map((r) => (
                    <li key={`d-${r}`}>{r.replaceAll("_", " ")}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!connected && (
          <Button
            onClick={onboard}
            disabled={busy}
            className="bg-teal-700 hover:bg-teal-800 text-white rounded-none"
            data-testid="stripe-connect-onboard-btn"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
            Connect bank account
          </Button>
        )}
        {connected && !ready && (
          <Button
            onClick={onboard}
            disabled={busy}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-none"
            data-testid="stripe-connect-resume-btn"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
            Finish onboarding
          </Button>
        )}
        {connected && (
          <Button
            onClick={openDashboard}
            variant="outline"
            disabled={busy}
            className="rounded-none"
            data-testid="stripe-connect-dashboard-btn"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Stripe dashboard
          </Button>
        )}
        <Button
          onClick={load}
          variant="ghost"
          size="sm"
          className="rounded-none ml-auto text-xs"
          data-testid="stripe-connect-refresh-btn"
        >
          Refresh status
        </Button>
      </div>
    </div>
  );
}
