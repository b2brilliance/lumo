import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const session_id = params.get("session_id");
  const order_id = params.get("order_id");
  const [status, setStatus] = useState({ payment_status: "checking" });
  const nav = useNavigate();

  useEffect(() => {
    if (!session_id) return;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const { data } = await api.get(`/checkout/status/${session_id}`);
        setStatus(data);
        if (data.payment_status === "paid" || data.status === "expired" || attempts >= 8) return;
      } catch (_) { /* ignore */ }
      setTimeout(tick, 2000);
    };
    tick();
  }, [session_id]);

  const paid = status.payment_status === "paid";

  return (
    <div className="max-w-md mx-auto px-6 py-20 text-center">
      {paid ? <CheckCircle2 className="w-12 h-12 mx-auto text-teal-700" /> : <Loader2 className="w-12 h-12 mx-auto animate-spin text-slate-500" />}
      <h1 className="font-display text-3xl font-black tracking-tighter mt-6" data-testid="checkout-status-title">
        {paid ? "Deposit secured." : "Confirming payment…"}
      </h1>
      <p className="text-slate-600 mt-3 text-sm">
        {paid
          ? "Your 10% deposit is held by Lumo. You'll be matched with a delivery provider next."
          : "Hold tight — we're verifying with Stripe."}
      </p>
      {paid && (
        <div className="mt-8 space-y-2">
          <Button onClick={() => nav("/customer")} className="bg-slate-900 hover:bg-slate-800 w-full" data-testid="checkout-go-customer">Back to my orders</Button>
        </div>
      )}
    </div>
  );
}
