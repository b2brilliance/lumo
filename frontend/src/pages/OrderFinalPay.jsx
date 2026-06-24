import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function OrderFinalPay() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data));
  }, [id]);

  const pay = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/checkout/final", { order_id: id, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) {
      toast.error("Failed to start checkout");
      setBusy(false);
    }
  };

  if (!order) return <div className="p-10 text-slate-500">Loading…</div>;

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <div className="overline">Final payment</div>
      <h1 className="font-display text-3xl font-black tracking-tighter mt-2">Pay remaining balance.</h1>
      <div className="mt-6 border border-slate-200 p-5 font-mono text-sm space-y-1">
        <div className="flex justify-between"><span>Item total</span><span>${order.item_total.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Delivery fee</span><span>${order.delivery_fee.toFixed(2)}</span></div>
        <div className="flex justify-between text-slate-500"><span>Deposit paid</span><span>-${order.deposit_total.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-2"><span>Remaining</span><span data-testid="final-remaining">${order.remaining_total.toFixed(2)}</span></div>
      </div>
      <Button onClick={pay} disabled={busy} className="mt-6 w-full bg-teal-700 hover:bg-teal-800" data-testid="final-pay-submit">
        {busy ? "Redirecting…" : `Pay $${order.remaining_total.toFixed(2)} via Stripe`}
      </Button>
      <Button onClick={() => nav("/customer")} variant="outline" className="mt-2 w-full">Cancel</Button>
      <p className="text-xs text-slate-500 mt-4 text-center">
        Or settle in cash / card directly with your provider if your terms allow.
      </p>
    </div>
  );
}
