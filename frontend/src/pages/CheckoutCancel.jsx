import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function CheckoutCancel() {
  return (
    <div className="max-w-md mx-auto px-6 py-20 text-center">
      <h1 className="font-display text-3xl font-black tracking-tighter">Checkout cancelled</h1>
      <p className="text-slate-600 mt-3 text-sm">No deposit was charged. You can try again anytime.</p>
      <Link to="/"><Button className="mt-8 bg-slate-900 hover:bg-slate-800" data-testid="checkout-cancel-home">Go home</Button></Link>
    </div>
  );
}
