import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Compact email subscription form. Drop it into the footer or any
 * landing section. The `variant` prop adjusts the visual treatment.
 */
export default function EmailSubscribeForm({ source = "landing", variant = "card" }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email) return;
    setBusy(true);
    try {
      const { data } = await api.post("/subscribe", { email, source });
      setDone(true);
      toast.success(data.already_subscribed ? "You&apos;re already subscribed — thanks!" : "Subscribed. We&apos;ll see you in your inbox.");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-teal-700" data-testid="subscribe-success">
        <CheckCircle2 className="w-4 h-4" />
        You&apos;re in. Look for our first email soon.
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <form onSubmit={submit} className="flex gap-2 max-w-md" data-testid="subscribe-form-inline">
        <Input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className="rounded-none text-sm flex-1"
          data-testid="subscribe-email-input"
        />
        <Button type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800 rounded-none whitespace-nowrap" data-testid="subscribe-submit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
        </Button>
      </form>
    );
  }

  // Default card variant — works in a landing-page section
  return (
    <div className="border-2 border-slate-900 p-6" data-testid="subscribe-form-card">
      <div className="overline text-teal-700 flex items-center gap-1.5"><Mail className="w-3 h-3" /> Lumo newsletter</div>
      <h3 className="font-display text-2xl font-black tracking-tighter mt-2 leading-tight">
        Twice-daily updates on what&apos;s new at Lumo.
      </h3>
      <p className="text-sm text-slate-600 mt-2">
        Short, useful notes about delivery, earnings, marketplaces — and how to use them. Unsubscribe in one click.
      </p>
      <form onSubmit={submit} className="flex gap-2 mt-4">
        <Input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className="rounded-none text-sm flex-1"
          data-testid="subscribe-email-input"
        />
        <Button type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800 rounded-none" data-testid="subscribe-submit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
        </Button>
      </form>
    </div>
  );
}
