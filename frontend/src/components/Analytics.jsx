import React, { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Eye, Users, ShoppingBag, Wallet, Star, ExternalLink, TrendingUp } from "lucide-react";

const fmtUsd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtNum = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; } };

function Tile({ label, value, sub, icon: Icon, testId, tint = "slate" }) {
  return (
    <div className={`border border-slate-200 p-4 bg-${tint}-50/40`} data-testid={testId}>
      <div className="flex items-center gap-2 overline text-slate-500"><Icon className="w-3 h-3" />{label}</div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value}</div>
      {sub && <div className="text-[11px] font-mono text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Sparkline (pure SVG, no chart lib) ──────────────────────────────────────
function Sparkline({ data, yKey = "visitors", height = 60, color = "#0f766e", label = "" }) {
  if (!data || data.length === 0) {
    return <div className="text-xs font-mono text-slate-400 py-6 text-center">No data yet</div>;
  }
  const vals = data.map((d) => Number(d[yKey]) || 0);
  const maxY = Math.max(1, ...vals);
  const w = 100, h = height;
  const stepX = vals.length > 1 ? w / (vals.length - 1) : 0;
  const points = vals.map((v, i) => `${i * stepX},${h - (v / maxY) * (h - 6) - 3}`).join(" ");
  return (
    <div>
      <div className="overline text-slate-500 mb-1">{label}</div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-slate-400">
        <span>{data[0]?.day}</span><span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

// ── Section: Overview ───────────────────────────────────────────────────────
function OverviewSection({ overview, visitors, revenue }) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="analytics-tiles">
        <Tile label="Visitors · 24h"   value={fmtNum(overview?.visitors?.last_24h)} sub={`${fmtNum(overview?.visitors?.pageviews_24h)} pageviews`} icon={Eye} testId="tile-visitors-24h" />
        <Tile label="Visitors · 7d"    value={fmtNum(overview?.visitors?.last_7d)} icon={Eye} testId="tile-visitors-7d" />
        <Tile label="New signups · 7d" value={fmtNum(overview?.signups?.new_7d)} sub={`${fmtNum(overview?.signups?.total)} total`} icon={Users} testId="tile-signups-7d" />
        <Tile label="Active jobs"      value={fmtNum(overview?.orders?.active_jobs)} sub={`${fmtNum(overview?.orders?.active_orders)} cart orders`} icon={ShoppingBag} testId="tile-active-orders" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <Tile label="GMV (all-time)"           value={fmtUsd(overview?.revenue?.gmv)} icon={TrendingUp} testId="tile-gmv" tint="teal" />
        <Tile label="Lumo commission (10%)"    value={fmtUsd(overview?.revenue?.lumo_commission)} icon={Wallet} testId="tile-lumo-commission" tint="amber" />
        <Tile label="Paid to providers"        value={fmtUsd(overview?.revenue?.provider_payouts)} icon={Wallet} testId="tile-provider-payouts" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="border border-slate-200 p-4">
          <Sparkline data={visitors?.timeseries} yKey="visitors" label="Daily visitors · 30d" />
        </div>
        <div className="border border-slate-200 p-4">
          <Sparkline data={revenue?.series} yKey="gmv" color="#b45309" label="Daily GMV · 30d" />
        </div>
      </div>
      <div className="border border-slate-200 p-4 mt-3" data-testid="analytics-top-paths">
        <div className="overline mb-2">Top pages · 30d</div>
        <div className="font-mono text-xs space-y-1">
          {(visitors?.top_paths || []).slice(0, 10).map((p) => (
            <div key={p.path} className="flex justify-between">
              <span className="truncate pr-2">{p.path}</span>
              <span className="text-slate-500 tabular-nums">{p.count}</span>
            </div>
          ))}
          {(!visitors?.top_paths || visitors.top_paths.length === 0) && (
            <div className="text-slate-400">No traffic yet — once visitors browse the site they&apos;ll show up here.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section: Signups ────────────────────────────────────────────────────────
function SignupsSection() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [role, setRole] = useState("any");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("new");

  const load = async () => {
    const url = new URLSearchParams();
    if (role !== "any") url.set("role", role);
    if (q) url.set("q", q);
    url.set("sort", sort);
    url.set("limit", "200");
    const { data } = await api.get(`/admin/analytics/signups?${url}`);
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role, sort]);

  return (
    <div data-testid="signups-section">
      <div className="flex gap-2 mb-4 flex-wrap text-xs">
        <Input placeholder="Search name / email / phone" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="max-w-xs" data-testid="signups-search" />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-40" data-testid="signups-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All roles</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="provider">Providers</SelectItem>
            <SelectItem value="retailer">Retailers</SelectItem>
            <SelectItem value="restaurant">Restaurants</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40" data-testid="signups-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Newest first</SelectItem>
            <SelectItem value="old">Oldest first</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs font-mono text-slate-500 self-center ml-auto">{data.total} total</div>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-200 text-sm" data-testid="signups-list">
        {data.items.map((u) => (
          <div key={u.id} className="grid grid-cols-12 gap-3 p-3 items-center" data-testid={`signup-row-${u.id}`}>
            <div className="col-span-4">
              <div className="font-display font-bold truncate">{u.name || u.email}</div>
              <div className="text-xs text-slate-500 truncate">{u.email}</div>
            </div>
            <div className="col-span-2 font-mono text-xs uppercase text-slate-700">{u.role}</div>
            <div className="col-span-3 font-mono text-xs text-slate-500">{u.phone || "—"}</div>
            <div className="col-span-3 font-mono text-xs text-slate-500 text-right">{fmtDate(u.created_at)}</div>
          </div>
        ))}
        {data.items.length === 0 && <div className="p-6 text-sm text-slate-400">No matches.</div>}
      </div>
    </div>
  );
}

// ── Section: Orders ─────────────────────────────────────────────────────────
function OrdersSection() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("any");
  const [sort, setSort] = useState("new");

  const load = async () => {
    const url = new URLSearchParams();
    if (kind !== "all") url.set("kind", kind);
    if (status !== "any") url.set("status", status);
    url.set("sort", sort);
    url.set("limit", "300");
    const { data } = await api.get(`/admin/analytics/orders?${url}`);
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, status, sort]);

  return (
    <div data-testid="orders-section">
      <div className="flex gap-2 mb-4 flex-wrap text-xs">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-40" data-testid="orders-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="job">Service jobs</SelectItem>
            <SelectItem value="order">Cart orders</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="orders-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="awaiting_confirmation">Awaiting confirm</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40" data-testid="orders-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Newest first</SelectItem>
            <SelectItem value="old">Oldest first</SelectItem>
            <SelectItem value="value">Highest value</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs font-mono text-slate-500 self-center ml-auto">{data.total} total</div>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-200 text-sm" data-testid="orders-list">
        {data.items.map((o) => (
          <div key={`${o.kind}-${o.id}`} className="grid grid-cols-12 gap-3 p-3 items-center" data-testid={`order-row-${o.id}`}>
            <div className="col-span-4">
              <Link to={o.kind === "job" ? `/jobs/${o.id}` : "/customer"} className="font-display font-bold truncate block hover:underline">{o.title}</Link>
              <div className="text-xs text-slate-500">{o.kind.toUpperCase()} · {o.category}</div>
            </div>
            <div className="col-span-2 font-mono text-xs uppercase">
              {o.delivery_status || o.status}
            </div>
            <div className="col-span-3 text-xs text-slate-500 truncate">
              {o.customer_name && <>From: {o.customer_name}</>}<br />
              {o.provider_name && <>To: {o.provider_name}</>}
            </div>
            <div className="col-span-1 font-mono text-xs text-right tabular-nums">{fmtUsd(o.amount)}</div>
            <div className="col-span-2 font-mono text-xs text-slate-500 text-right">{fmtDate(o.created_at)}</div>
          </div>
        ))}
        {data.items.length === 0 && <div className="p-6 text-sm text-slate-400">No orders match.</div>}
      </div>
    </div>
  );
}

// ── Section: Providers + Revenue ────────────────────────────────────────────
function ProvidersSection() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("revenue");

  const load = async () => {
    const url = new URLSearchParams();
    if (q) url.set("q", q);
    url.set("sort", sort);
    url.set("limit", "300");
    const { data } = await api.get(`/admin/analytics/providers?${url}`);
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sort]);

  const totals = useMemo(() => {
    let payouts = 0, commission = 0, gmv = 0;
    for (const p of data.items) {
      payouts += p.payouts_total || 0;
      commission += p.lumo_commission_from_provider || 0;
      gmv += p.gmv_from_provider || 0;
    }
    return { payouts, commission, gmv };
  }, [data.items]);

  return (
    <div data-testid="providers-section">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Tile label="GMV (all providers)"        value={fmtUsd(totals.gmv)} icon={TrendingUp} testId="providers-tile-gmv" tint="teal" />
        <Tile label="Lumo commission (10%)"      value={fmtUsd(totals.commission)} icon={Wallet} testId="providers-tile-commission" tint="amber" />
        <Tile label="Paid to providers"          value={fmtUsd(totals.payouts)} icon={Wallet} testId="providers-tile-payouts" />
      </div>
      <div className="flex gap-2 mb-3 flex-wrap text-xs">
        <Input placeholder="Search name / email / phone" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="max-w-xs" data-testid="providers-search" />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44" data-testid="providers-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Top earners</SelectItem>
            <SelectItem value="rating">Highest rated</SelectItem>
            <SelectItem value="newest">Newest signups</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs font-mono text-slate-500 self-center ml-auto">{data.total} providers</div>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-200 text-sm" data-testid="providers-list">
        {data.items.map((p) => (
          <div key={p.id} className="grid grid-cols-12 gap-3 p-3 items-center" data-testid={`provider-row-${p.id}`}>
            <div className="col-span-4">
              <div className="font-display font-bold truncate">{p.name || p.email}</div>
              <div className="text-xs text-slate-500 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ""}</div>
              <div className="text-xs text-slate-400 mt-0.5">{(p.categories || []).join(", ") || "—"}</div>
            </div>
            <div className="col-span-2 text-xs">
              {p.avg_rating != null ? (
                <span className="inline-flex items-center gap-1 font-mono"><Star className="w-3 h-3 text-amber-500" fill="currentColor" />{p.avg_rating.toFixed(2)} <span className="text-slate-400">({p.reviews_count})</span></span>
              ) : <span className="text-slate-400 font-mono text-[11px]">no ratings</span>}
              <div className="font-mono text-[11px] text-slate-500 mt-1">{p.jobs_completed} jobs</div>
            </div>
            <div className="col-span-3 text-xs">
              <div className="font-mono">GMV {fmtUsd(p.gmv_from_provider)}</div>
              <div className="font-mono text-amber-700">Lumo cut {fmtUsd(p.lumo_commission_from_provider)}</div>
              <div className="font-mono text-teal-700">Paid out {fmtUsd(p.payouts_total)}</div>
            </div>
            <div className="col-span-2 font-mono text-xs text-slate-500">Wallet {fmtUsd(p.wallet_balance)}</div>
            <div className="col-span-1 text-right text-xs">
              <Link to={p.profile_url} className="inline-flex items-center gap-1 text-teal-700 underline" data-testid={`provider-profile-${p.id}`}>
                Profile <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ))}
        {data.items.length === 0 && <div className="p-6 text-sm text-slate-400">No matches.</div>}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [section, setSection] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [revenue, setRevenue] = useState(null);

  useEffect(() => {
    api.get("/admin/analytics/overview").then(({ data }) => setOverview(data)).catch(() => {});
    api.get("/admin/analytics/visitors?days=30").then(({ data }) => setVisitors(data)).catch(() => {});
    api.get("/admin/analytics/revenue?days=30").then(({ data }) => setRevenue(data)).catch(() => {});
  }, []);

  const SUBS = [
    { key: "overview",  label: "Overview" },
    { key: "signups",   label: "Signups" },
    { key: "orders",    label: "Orders" },
    { key: "providers", label: "Providers + Revenue" },
  ];

  return (
    <div data-testid="analytics-page">
      <div className="flex gap-2 border-b border-slate-200 mb-4">
        {SUBS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest border-b-2 ${section === s.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            data-testid={`analytics-sub-${s.key}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "overview"  && <OverviewSection overview={overview} visitors={visitors} revenue={revenue} />}
      {section === "signups"   && <SignupsSection />}
      {section === "orders"    && <OrdersSection />}
      {section === "providers" && <ProvidersSection />}
    </div>
  );
}
