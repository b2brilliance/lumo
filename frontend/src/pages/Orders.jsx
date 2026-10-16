import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ShoppingBag, CalendarDays, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const TABS = [
  { key: "all", label: "All" },
  { key: "service", label: "Services" },
  { key: "purchase", label: "Purchases" },
  { key: "rental", label: "Rentals" },
  { key: "inquiry", label: "Inquiries" },
];
const ICON = { service: Briefcase, purchase: ShoppingBag, rental: CalendarDays, inquiry: MessageSquare };
const money = (n, cur = "USD") => {
  if (n == null) return "";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: Number(n) >= 1000 ? 0 : 2 }).format(n); }
  catch { return `${cur} ${Number(n).toLocaleString()}`; }
};
const day = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "");

async function loadAll(user) {
  const jobsQ = user.role === "provider" ? `provider_id=${user.id}` : `customer_id=${user.id}`;
  const [jobs, orders, rentals, owned, inq] = await Promise.all([
    api.get(`/jobs?${jobsQ}`).then((r) => r.data).catch(() => []),
    api.get("/orders").then((r) => r.data).catch(() => []),
    api.get("/rental-bookings/mine?role=renter").then((r) => r.data).catch(() => []),
    api.get("/rental-bookings/mine?role=owner").then((r) => r.data).catch(() => []),
    api.get("/inquiries").then((r) => r.data).catch(() => []),
  ]);
  return [
    ...jobs.map((j) => ({ id: `s-${j.id}`, kind: "service", title: j.title, status: j.status, amount: j.final_price ?? (j.pay_rate && j.estimated_units ? j.pay_rate * j.estimated_units : null), at: j.created_at, to: `/jobs/${j.id}` })),
    ...orders.map((o) => ({ id: `p-${o.id}`, kind: "purchase", title: o.item_title || o.listing_title || "Order", status: o.status, amount: (o.item_total || 0) + (o.delivery_fee || 0), at: o.created_at, to: ["deposit_paid", "in_progress", "accepted"].includes(o.status) ? `/orders/${o.id}/pay` : null })),
    ...[...rentals, ...owned].map((b) => ({ id: `r-${b.id}`, kind: "rental", title: b.rental?.title || "Rental", status: b.status, amount: b.subtotal, at: b.created_at, sub: `${b.start_date} → ${b.end_date}`, to: `/rentals/${b.rental_id}` })),
    ...inq.map((q) => ({ id: `i-${q.id}`, kind: "inquiry", title: q.listing_title || "Inquiry", status: q.listing_kind?.replace("_", " "), amount: q.listing_price, currency: q.listing_currency, at: q.last_message_at || q.created_at, to: `/inquiries/${q.id}` })),
  ].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

function OrderRow({ o }) {
  const Icon = ICON[o.kind];
  const body = (
    <div className="flex items-center gap-4 p-4">
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold truncate">{o.title}</div>
        <div className="text-xs font-mono text-slate-500 truncate">{o.sub || day(o.at)}</div>
      </div>
      <div className="text-right">
        {o.amount != null && <div className="font-display font-bold">{money(o.amount, o.currency)}</div>}
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{(o.status || "").replace(/_/g, " ")}</div>
      </div>
    </div>
  );
  return o.to
    ? <Link to={o.to} className="block hover:bg-slate-50 transition-colors" data-testid={`order-row-${o.id}`}>{body}</Link>
    : <div data-testid={`order-row-${o.id}`}>{body}</div>;
}

export default function Orders() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("all");

  useEffect(() => { if (user) loadAll(user).then(setItems); }, [user]);

  const shown = (items || []).filter((o) => tab === "all" || o.kind === tab);
  return (
    <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-8 pb-24" data-testid="orders-page">
      <h1 className="font-display text-4xl font-black tracking-tighter">Orders</h1>
      <div className="flex gap-1 mt-5 overflow-x-auto no-scrollbar" data-testid="orders-tabs">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`shrink-0 px-3 py-2 text-xs font-mono uppercase tracking-widest border transition-colors ${tab === t.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 hover:border-slate-900"}`}
                  data-testid={`orders-tab-${t.key}`}>
            {t.label}{items ? ` · ${t.key === "all" ? items.length : items.filter((o) => o.kind === t.key).length}` : ""}
          </button>
        ))}
      </div>
      <div className="mt-4 border border-slate-200 divide-y divide-slate-200" data-testid="orders-list">
        {items === null && <div className="p-8 text-sm text-slate-500 font-mono">Loading…</div>}
        {items && shown.length === 0 && <div className="p-8 text-sm text-slate-500" data-testid="orders-empty">Nothing here yet.</div>}
        {shown.map((o) => <OrderRow key={o.id} o={o} />)}
      </div>
    </div>
  );
}
