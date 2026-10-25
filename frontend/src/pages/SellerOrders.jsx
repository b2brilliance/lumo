import React, { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SellerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/orders").then(({ data }) => setOrders((data || []).filter((o) => o.store_id === user.id))).catch(() => setOrders([]));
  }, [user.id]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5" data-testid="seller-orders-page">
      <h1 className="font-display text-2xl font-black tracking-tight">Orders</h1>
      {orders === null && <div className="py-16 text-center text-slate-400" data-testid="seller-orders-loading">Loading…</div>}
      {orders?.length === 0 && (
        <div className="mt-8 text-center py-14 border border-dashed border-slate-300 rounded-3xl" data-testid="seller-orders-empty">
          <ClipboardList className="w-8 h-8 mx-auto text-slate-400" />
          <div className="font-semibold mt-3">No orders yet</div>
          <p className="text-sm text-slate-500 mt-1">New orders from customers will show up here.</p>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {orders?.map((o) => (
          <div key={o.id} className="p-4 rounded-2xl border border-slate-200" data-testid={`seller-order-${o.id}`}>
            <div className="flex items-center justify-between">
              <div className="font-semibold">{o.customer_name || "Customer"}</div>
              <span className="text-xs font-mono uppercase px-2 py-1 rounded-full bg-slate-100">{(o.status || "new").replace(/_/g, " ")}</span>
            </div>
            <div className="text-sm text-slate-500 mt-1">{(o.lines || o.items || []).map((i) => `${i.quantity || 1}× ${i.name}`).join(", ")}</div>
            <div className="text-sm font-mono mt-1">{(o.item_total ?? o.total) != null ? `$${Number(o.item_total ?? o.total).toFixed(2)}` : ""} · {o.created_at ? new Date(o.created_at).toLocaleString() : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
