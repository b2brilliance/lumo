import React, { useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { KeyRound, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Trash2, Zap, Lock } from "lucide-react";

const SourceBadge = ({ source }) => {
  if (source === "db") return <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-teal-100 text-teal-800">SAVED IN ADMIN</span>;
  if (source === "env") return <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 text-slate-700">FROM SERVER ENV</span>;
  return <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800">NOT CONFIGURED</span>;
};

export default function PaymentsAdmin() {
  const [config, setConfig] = useState(null);
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const [feePct, setFeePct] = useState(10);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/payments/config");
      setConfig(data);
      setFeePct(data.platform_fee_percent || 10);
    } catch (e) { toast.error(formatApiError(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { platform_fee_percent: Number(feePct) };
      if (secret) body.secret_key = secret;
      if (webhook) body.webhook_secret = webhook;
      const { data } = await api.put("/admin/payments/config", body);
      setConfig(data);
      setSecret(""); setWebhook("");
      setTestResult(null);
      toast.success("Stripe configuration saved.");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/admin/payments/test");
      setTestResult(data);
      if (data.ok) toast.success("Stripe connection verified.");
      else toast.error(`Stripe rejected: ${data.error}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setTesting(false); }
  };

  const clear = async () => {
    try {
      await api.delete("/admin/payments/config");
      toast.success("Saved keys cleared. Reverted to server env (if any).");
      setTestResult(null);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!config) {
    return <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  const hasKey = !!config.secret_key_masked;
  const isLive = !!config.is_live_mode;

  return (
    <div data-testid="payments-admin-page">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-black tracking-tighter">Payments — Stripe Connect</h2>
        <p className="text-sm text-slate-500 mt-1">
          Plug in your Stripe secret key and Lumo immediately starts using it for
          provider onboarding and bank payouts. Keys are encrypted at rest.
        </p>
      </div>

      {/* Live status panel */}
      <div className={`border-2 p-4 mb-6 ${isLive ? "border-red-300 bg-red-50" : hasKey ? "border-teal-300 bg-teal-50" : "border-amber-300 bg-amber-50"}`} data-testid="payments-status-panel">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 grid place-items-center text-white ${isLive ? "bg-red-700" : hasKey ? "bg-teal-700" : "bg-amber-600"}`}>
            {hasKey ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-display text-lg font-bold">
                {hasKey ? (isLive ? "Live mode active — real money will move" : "Test mode active") : "Stripe not configured"}
              </div>
              <SourceBadge source={config.source} />
              {hasKey && (
                <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 ${isLive ? "bg-red-200 text-red-900" : "bg-blue-100 text-blue-800"}`}>
                  {isLive ? "LIVE" : "TEST"} MODE
                </span>
              )}
            </div>
            {hasKey && (
              <div className="text-sm text-slate-600 mt-2 space-y-1">
                <div><span className="overline text-slate-500">Secret key</span> <code className="font-mono text-xs bg-white px-1.5 py-0.5 border border-slate-200">{config.secret_key_masked}</code></div>
                {config.webhook_secret_masked && (
                  <div><span className="overline text-slate-500">Webhook secret</span> <code className="font-mono text-xs bg-white px-1.5 py-0.5 border border-slate-200">{config.webhook_secret_masked}</code></div>
                )}
                <div><span className="overline text-slate-500">Platform fee</span> <span className="font-mono text-sm">{config.platform_fee_percent}%</span></div>
                {config.updated_by && (
                  <div className="text-[10px] font-mono text-slate-400 mt-2">
                    Last updated by {config.updated_by} · {new Date(config.updated_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="border border-slate-200 p-5 space-y-5 mb-6" data-testid="payments-editor">
        <div>
          <label className="overline block mb-1.5">Stripe secret key</label>
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={hasKey ? "Leave blank to keep current key" : "sk_test_… or sk_live_…"}
            className="rounded-none font-mono text-xs"
            data-testid="payments-secret-input"
          />
          <div className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
            Get this from <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline inline-flex items-center gap-1">Stripe Dashboard → API keys <ExternalLink className="w-3 h-3" /></a>.
            Use <code className="font-mono bg-slate-100 px-1">sk_test_…</code> for testing,
            <code className="font-mono bg-slate-100 px-1 ml-1">sk_live_…</code> only when ready for real payments.
          </div>
        </div>

        <div>
          <label className="overline block mb-1.5">Webhook signing secret <span className="text-slate-400 normal-case">(optional)</span></label>
          <Input
            type="password"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder={config.webhook_secret_masked ? "Leave blank to keep current secret" : "whsec_…"}
            className="rounded-none font-mono text-xs"
            data-testid="payments-webhook-input"
          />
          <div className="text-[11px] text-slate-500 mt-1.5">
            Create one at <a href="https://dashboard.stripe.com/test/webhooks" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline inline-flex items-center gap-1">Stripe → Webhooks <ExternalLink className="w-3 h-3" /></a> pointing to <code className="font-mono bg-slate-100 px-1 break-all">{window.location.origin.replace(/^http/, "")}/api/stripe/connect/webhook</code> (or your production URL).
          </div>
        </div>

        <div>
          <label className="overline block mb-1.5">Platform fee % (commission Lumo takes per job)</label>
          <div className="flex items-center gap-3">
            <input
              type="range" min="0" max="30" step="0.5"
              value={feePct} onChange={(e) => setFeePct(e.target.value)}
              className="flex-1" data-testid="payments-fee-slider"
            />
            <div className="font-display text-2xl font-black w-20 text-right tabular-nums">{feePct}%</div>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Recommended: 10% (current). Compare: TaskRabbit 15%, Uber Eats 30%.</div>
        </div>

        <div className="flex gap-2 flex-wrap pt-2">
          <Button onClick={save} disabled={saving || (!secret && !webhook && Number(feePct) === Number(config.platform_fee_percent))} className="bg-slate-900 hover:bg-slate-800 rounded-none" data-testid="payments-save-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <KeyRound className="w-4 h-4 mr-1" />} Save & activate
          </Button>
          <Button onClick={test} disabled={!hasKey || testing} variant="outline" className="rounded-none" data-testid="payments-test-btn">
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />} Test connection
          </Button>
          {config.source === "db" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-none border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700" data-testid="payments-clear-btn">
                  <Trash2 className="w-4 h-4 mr-1" /> Clear saved keys
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-none">
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear saved Stripe keys?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Removes the keys saved here. If the server has fallback env vars they&apos;ll be used instead; otherwise Stripe Connect goes offline until you save new keys.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clear} className="bg-red-600 hover:bg-red-700" data-testid="payments-clear-confirm">Clear keys</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`border-2 p-4 mb-6 ${testResult.ok ? "border-teal-300 bg-teal-50" : "border-red-300 bg-red-50"}`} data-testid="payments-test-result">
          {testResult.ok ? (
            <>
              <div className="font-display font-bold text-teal-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Stripe responded successfully
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 text-xs font-mono">
                <div><span className="text-slate-500">Account ID:</span> {testResult.platform_account_id}</div>
                <div><span className="text-slate-500">Country:</span> {testResult.platform_country}</div>
                <div><span className="text-slate-500">Mode:</span> {testResult.is_live_mode ? <span className="text-red-700 font-bold">LIVE</span> : <span className="text-blue-700 font-bold">TEST</span>}</div>
                <div><span className="text-slate-500">Connect ready:</span> {testResult.connect_enabled ? <span className="text-teal-700">✓ Yes</span> : <span className="text-amber-700">⚠ Visit dashboard.stripe.com/connect to enable</span>}</div>
              </div>
            </>
          ) : (
            <>
              <div className="font-display font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Stripe rejected the connection
              </div>
              <div className="text-sm text-red-700 mt-2">{testResult.error}</div>
            </>
          )}
        </div>
      )}

      {/* Security note */}
      <div className="border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex items-start gap-2">
        <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-teal-700" />
        <div>
          <strong>Security:</strong> keys are encrypted before being written to the database (Fernet/AES-128).
          Once saved, the full key is never sent back to the browser — only a masked preview like <code className="font-mono bg-white px-1">sk_test_••••rE5K</code>.
          To rotate a key, paste a new one and click Save.
        </div>
      </div>
    </div>
  );
}
