import React, { useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Eye, Users, ShoppingBag, Wallet, ExternalLink, TrendingUp, RefreshCw, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const fmtUsd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtNum = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; } };
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const truncate = (s, n = 40) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

// ── Clickable stat tile ─────────────────────────────────────────────────────
function Tile({ label, value, sub, icon: Icon, testId, tint = "slate", onClick }) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`text-left border border-slate-200 p-4 bg-${tint}-50/40 transition-all ${interactive ? "hover:border-teal-700 hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-1 active:translate-y-px" : "cursor-default"}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 overline text-slate-500">
        <Icon className="w-3 h-3" />
        {label}
        {interactive && <ChevronRight className="w-3 h-3 ml-auto text-slate-400" />}
      </div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value}</div>
      {sub && <div className="text-[11px] font-mono text-slate-500 mt-1">{sub}</div>}
    </button>
  );
}

// ── Sparkline (pure SVG) ───────────────────────────────────────────────────
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

// ── Universal drill-down dialog ─────────────────────────────────────────────
function DetailsDialog({ open, onClose, metric, rangeKey: initialRange, title }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rangeKey, setRangeKey] = useState(initialRange || "24h");

  const fetchDetails = useCallback(async () => {
    if (!metric) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/analytics/details/${metric}?range_key=${rangeKey}&limit=200`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e));
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [metric, rangeKey]);

  useEffect(() => {
    if (open) {
      setRangeKey(initialRange || "24h");
    }
  }, [open, initialRange]);

  useEffect(() => {
    if (open) fetchDetails();
  }, [open, fetchDetails]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col rounded-none" data-testid="analytics-details-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tighter text-2xl">{title || metric}</DialogTitle>
          <DialogDescription className="text-xs font-mono text-slate-500">
            {data?.total != null ? `${data.total} record${data.total === 1 ? "" : "s"}` : "Loading…"}
            {data?.range && ` · ${data.range}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <span className="text-[10px] font-mono uppercase text-slate-500">Range</span>
          {["24h", "7d", "30d", "all"].map((r) => (
            <button
              key={r}
              onClick={() => setRangeKey(r)}
              className={`px-2 py-1 text-[11px] font-mono uppercase border ${rangeKey === r ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              data-testid={`details-range-${r}`}
            >
              {r}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={fetchDetails} className="ml-auto text-xs h-7" data-testid="details-refresh">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto" data-testid="details-body">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading details…
            </div>
          )}
          {!loading && data && <DetailsTable metric={metric} data={data} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Table renderer (one section per metric kind) ───────────────────────────
function DetailsTable({ metric, data }) {
  if (!data?.items || data.items.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        No records in this range yet. Once activity happens, it&apos;ll appear here.
      </div>
    );
  }

  // Revenue/GMV/Commission/Payouts → orders breakdown + per-category aggregate
  if (["gmv", "commission", "payouts"].includes(metric)) {
    return (
      <div className="space-y-4">
        {data.by_category?.length > 0 && (
          <div className="border border-slate-200 p-3">
            <div className="overline mb-2">By category</div>
            <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 pb-1">
              <div className="col-span-4">Category</div>
              <div className="col-span-2 text-right">Count</div>
              <div className="col-span-2 text-right">GMV</div>
              <div className="col-span-2 text-right">Commission</div>
              <div className="col-span-2 text-right">Payouts</div>
            </div>
            {data.by_category.map((c) => (
              <div key={c.category} className="grid grid-cols-12 py-1.5 text-xs border-b border-slate-100" data-testid={`cat-row-${c.category}`}>
                <div className="col-span-4 font-display font-bold">{c.category}</div>
                <div className="col-span-2 text-right font-mono">{c.count}</div>
                <div className="col-span-2 text-right font-mono">{fmtUsd(c.gross)}</div>
                <div className="col-span-2 text-right font-mono text-amber-700">{fmtUsd(c.commission)}</div>
                <div className="col-span-2 text-right font-mono text-teal-700">{fmtUsd(c.payout)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="border border-slate-200">
          <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
            <div className="col-span-4">Order</div>
            <div className="col-span-2">Provider</div>
            <div className="col-span-2 text-right">GMV</div>
            <div className="col-span-2 text-right">Commission</div>
            <div className="col-span-2 text-right">Payout</div>
          </div>
          {data.items.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="grid grid-cols-12 px-3 py-2 border-b border-slate-100 text-xs items-center hover:bg-slate-50" data-testid={`revenue-row-${r.id}`}>
              <div className="col-span-4">
                <div className="font-display font-bold truncate">{truncate(r.title, 50)}</div>
                <div className="text-[10px] text-slate-500 font-mono">{r.category} · {fmtDateTime(r.released_at)}</div>
              </div>
              <div className="col-span-2 truncate">{r.provider_name || "—"}</div>
              <div className="col-span-2 text-right font-mono">{fmtUsd(r.gross)}</div>
              <div className="col-span-2 text-right font-mono text-amber-700">{fmtUsd(r.lumo_commission)}</div>
              <div className="col-span-2 text-right font-mono text-teal-700">{fmtUsd(r.provider_payout)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Visitors → session rows with paths
  if (metric === "visitors") {
    return (
      <div className="border border-slate-200">
        <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
          <div className="col-span-3">Session</div>
          <div className="col-span-2 text-right">Pageviews</div>
          <div className="col-span-3">First seen</div>
          <div className="col-span-3">Last seen</div>
          <div className="col-span-1 text-right">User</div>
        </div>
        {data.items.map((s) => (
          <div key={s.session_id} className="grid grid-cols-12 px-3 py-2 border-b border-slate-100 text-xs items-center hover:bg-slate-50" data-testid={`visitor-row-${s.session_id}`}>
            <div className="col-span-3 font-mono truncate">{s.session_id.slice(0, 12)}…</div>
            <div className="col-span-2 text-right font-mono">{s.pageviews}</div>
            <div className="col-span-3 font-mono text-slate-500">{fmtDateTime(s.first_seen)}</div>
            <div className="col-span-3 font-mono text-slate-500">{fmtDateTime(s.last_seen)}</div>
            <div className="col-span-1 text-right font-mono text-[10px] text-teal-700">{s.user_id ? "signed-in" : "anon"}</div>
            {(s.paths?.length > 0) && (
              <div className="col-span-12 mt-1 text-[10px] text-slate-400 font-mono truncate">
                {s.paths.slice(0, 6).join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Pageviews → raw rows
  if (metric === "pageviews") {
    return (
      <div className="border border-slate-200">
        <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
          <div className="col-span-3">When</div>
          <div className="col-span-5">Path</div>
          <div className="col-span-3">Referrer</div>
          <div className="col-span-1 text-right">User</div>
        </div>
        {data.items.map((p) => (
          <div key={p.id} className="grid grid-cols-12 px-3 py-1.5 border-b border-slate-100 text-xs items-center hover:bg-slate-50">
            <div className="col-span-3 font-mono text-slate-500">{fmtDateTime(p.ts)}</div>
            <div className="col-span-5 font-mono truncate">{p.path}</div>
            <div className="col-span-3 font-mono text-slate-400 truncate">{truncate(p.referrer, 40) || "—"}</div>
            <div className="col-span-1 text-right font-mono text-[10px] text-teal-700">{p.user_id ? "✓" : "—"}</div>
          </div>
        ))}
      </div>
    );
  }

  // Top paths
  if (metric === "top_paths") {
    return (
      <div className="border border-slate-200">
        <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
          <div className="col-span-8">Path</div>
          <div className="col-span-2 text-right">Visits</div>
          <div className="col-span-2 text-right">Visitors</div>
        </div>
        {data.items.map((r) => (
          <div key={r.path} className="grid grid-cols-12 px-3 py-2 border-b border-slate-100 text-xs items-center hover:bg-slate-50">
            <Link to={r.path} target="_blank" rel="noreferrer" className="col-span-8 font-mono truncate hover:text-teal-700">{r.path}</Link>
            <div className="col-span-2 text-right font-mono">{r.count}</div>
            <div className="col-span-2 text-right font-mono text-teal-700">{r.visitors}</div>
          </div>
        ))}
      </div>
    );
  }

  // Signups (any variant)
  if (metric === "signups" || metric.startsWith("signups_")) {
    return (
      <div className="border border-slate-200">
        <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-3 text-right">Joined</div>
        </div>
        {data.items.map((u) => (
          <div key={u.id} className="grid grid-cols-12 px-3 py-2 border-b border-slate-100 text-xs items-center hover:bg-slate-50">
            <div className="col-span-4 font-display font-bold truncate">{u.name || u.email}</div>
            <div className="col-span-2 font-mono uppercase">{u.role}</div>
            <div className="col-span-3 font-mono text-slate-500 truncate">{u.email}</div>
            <div className="col-span-3 text-right font-mono text-slate-500">{fmtDateTime(u.created_at)}</div>
          </div>
        ))}
      </div>
    );
  }

  // Jobs / orders
  if (["active_jobs", "completed_jobs", "active_orders", "completed_orders"].includes(metric)) {
    return (
      <div className="border border-slate-200">
        <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
          <div className="col-span-4">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Customer</div>
          <div className="col-span-2">Provider</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>
        {data.items.map((r) => (
          <div key={r.id} className="grid grid-cols-12 px-3 py-2 border-b border-slate-100 text-xs items-center hover:bg-slate-50">
            <div className="col-span-4">
              <div className="font-display font-bold truncate">{truncate(r.title, 40)}</div>
              <div className="text-[10px] text-slate-500 font-mono">{r.category} · {fmtDateTime(r.created_at)}</div>
            </div>
            <div className="col-span-2 font-mono text-[10px] uppercase">{r.status?.replaceAll("_", " ")}</div>
            <div className="col-span-2 truncate">{r.customer_name || "—"}</div>
            <div className="col-span-2 truncate">{r.provider_name || "—"}</div>
            <div className="col-span-2 text-right font-mono">{fmtUsd(r.amount)}</div>
          </div>
        ))}
      </div>
    );
  }

  // Top providers
  if (metric === "top_providers") {
    return (
      <div className="border border-slate-200">
        <div className="grid grid-cols-12 text-[10px] font-mono uppercase text-slate-500 border-b border-slate-200 px-3 py-2 bg-slate-50">
          <div className="col-span-4">Provider</div>
          <div className="col-span-2 text-right">Jobs</div>
          <div className="col-span-2 text-right">GMV</div>
          <div className="col-span-2 text-right">Commission</div>
          <div className="col-span-2 text-right">Payouts</div>
        </div>
        {data.items.map((p) => (
          <div key={p.provider_id} className="grid grid-cols-12 px-3 py-2 border-b border-slate-100 text-xs items-center hover:bg-slate-50">
            <div className="col-span-4 font-display font-bold truncate">
              <Link to={`/u/${p.provider_id}`} className="hover:text-teal-700">{p.name || p.provider_id}</Link>
            </div>
            <div className="col-span-2 text-right font-mono">{p.jobs}</div>
            <div className="col-span-2 text-right font-mono">{fmtUsd(p.gmv)}</div>
            <div className="col-span-2 text-right font-mono text-amber-700">{fmtUsd(p.commission)}</div>
            <div className="col-span-2 text-right font-mono text-teal-700">{fmtUsd(p.payouts)}</div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback JSON view
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap bg-slate-50 p-3 border border-slate-200 overflow-auto">
      {JSON.stringify(data.items, null, 2)}
    </pre>
  );
}

// ── Reset button ───────────────────────────────────────────────────────────
function ResetButton({ onReset }) {
  const [busy, setBusy] = useState(false);
  const handleReset = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/analytics/reset");
      toast.success(`Analytics reset. ${data.pageviews_deleted} old pageviews cleared.`);
      onReset?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-none text-xs h-8" data-testid="analytics-reset-btn">
          <RefreshCw className="w-3 h-3 mr-1" /> Reset analytics
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display tracking-tighter">Reset analytics?</AlertDialogTitle>
          <AlertDialogDescription>
            This wipes all visitor pageviews and sets a cutoff so charts start counting from now.
            <br /><br />
            <strong>What stays intact:</strong> users, providers, jobs, orders, wallets, payouts, ratings.
            <br />
            <strong>What changes:</strong> historical pageviews are deleted, and pre-cutoff signups/orders/revenue stop appearing in totals.
            <br /><br />
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="analytics-reset-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReset} disabled={busy} className="bg-amber-600 hover:bg-amber-700" data-testid="analytics-reset-confirm">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset everything"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Section: Overview ───────────────────────────────────────────────────────
function OverviewSection({ overview, visitors, revenue, onDrill }) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="analytics-tiles">
        <Tile label="Visitors · 24h" value={fmtNum(overview?.visitors?.last_24h)} sub={`${fmtNum(overview?.visitors?.pageviews_24h)} pageviews`} icon={Eye} testId="tile-visitors-24h" onClick={() => onDrill({ metric: "visitors", rangeKey: "24h", title: "Visitors · last 24h" })} />
        <Tile label="Visitors · 7d" value={fmtNum(overview?.visitors?.last_7d)} icon={Eye} testId="tile-visitors-7d" onClick={() => onDrill({ metric: "visitors", rangeKey: "7d", title: "Visitors · last 7 days" })} />
        <Tile label="New signups · 7d" value={fmtNum(overview?.signups?.new_7d)} sub={`${fmtNum(overview?.signups?.total)} total`} icon={Users} testId="tile-signups-7d" onClick={() => onDrill({ metric: "signups", rangeKey: "7d", title: "Signups · last 7 days" })} />
        <Tile label="Active jobs" value={fmtNum(overview?.orders?.active_jobs)} sub={`${fmtNum(overview?.orders?.active_orders)} cart orders`} icon={ShoppingBag} testId="tile-active-orders" onClick={() => onDrill({ metric: "active_jobs", rangeKey: "all", title: "Active jobs" })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <Tile label="GMV (all-time)" value={fmtUsd(overview?.revenue?.gmv)} icon={TrendingUp} testId="tile-gmv" tint="teal" onClick={() => onDrill({ metric: "gmv", rangeKey: "all", title: "GMV · revenue breakdown" })} />
        <Tile label="Lumo commission (10%)" value={fmtUsd(overview?.revenue?.lumo_commission)} icon={Wallet} testId="tile-lumo-commission" tint="amber" onClick={() => onDrill({ metric: "commission", rangeKey: "all", title: "Lumo commission breakdown" })} />
        <Tile label="Paid to providers" value={fmtUsd(overview?.revenue?.provider_payouts)} icon={Wallet} testId="tile-provider-payouts" onClick={() => onDrill({ metric: "payouts", rangeKey: "all", title: "Provider payouts" })} />
      </div>

      {/* Per-role signup tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3" data-testid="analytics-role-tiles">
        {Object.entries(overview?.signups?.totals_by_role || {}).map(([role, n]) => (
          <Tile
            key={role}
            label={`${role}s total`}
            value={fmtNum(n)}
            icon={Users}
            testId={`tile-role-${role}`}
            onClick={() => onDrill({ metric: `signups_${role}`, rangeKey: "all", title: `All ${role}s` })}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <button onClick={() => onDrill({ metric: "visitors", rangeKey: "30d", title: "Visitors · last 30 days" })} className="border border-slate-200 p-4 text-left hover:border-teal-700 transition-colors" data-testid="sparkline-visitors">
          <Sparkline data={visitors?.timeseries} yKey="visitors" label="Daily visitors · 30d (click for details)" />
        </button>
        <button onClick={() => onDrill({ metric: "gmv", rangeKey: "30d", title: "GMV · last 30 days" })} className="border border-slate-200 p-4 text-left hover:border-teal-700 transition-colors" data-testid="sparkline-gmv">
          <Sparkline data={revenue?.series} yKey="gmv" color="#b45309" label="Daily GMV · 30d (click for details)" />
        </button>
      </div>

      <button onClick={() => onDrill({ metric: "top_paths", rangeKey: "30d", title: "Top pages · last 30 days" })} className="block w-full text-left border border-slate-200 p-4 mt-3 hover:border-teal-700 transition-colors" data-testid="analytics-top-paths">
        <div className="flex items-center gap-2 mb-2">
          <div className="overline">Top pages · 30d</div>
          <ChevronRight className="w-3 h-3 ml-auto text-slate-400" />
        </div>
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
      </button>

      <button onClick={() => onDrill({ metric: "top_providers", rangeKey: "30d", title: "Top providers · last 30 days" })} className="block w-full text-left border border-slate-200 p-4 mt-3 hover:border-teal-700 transition-colors" data-testid="analytics-top-providers">
        <div className="flex items-center gap-2">
          <div className="overline">Top providers · 30d</div>
          <ChevronRight className="w-3 h-3 ml-auto text-slate-400" />
        </div>
        <div className="text-xs text-slate-500 mt-1">Click to view ranked earnings, commission, and job counts per provider.</div>
      </button>
    </div>
  );
}

// ── Section: Signups (existing table) ──────────────────────────────────────
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

// ── Section: Orders (existing table) ───────────────────────────────────────
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
    url.set("limit", "200");
    const { data } = await api.get(`/admin/analytics/orders?${url}`);
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, status, sort]);

  return (
    <div data-testid="orders-section">
      <div className="flex gap-2 mb-4 flex-wrap">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-32" data-testid="orders-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="job">Jobs</SelectItem>
            <SelectItem value="order">Cart orders</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="orders-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="awaiting_confirmation">Awaiting confirm</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40" data-testid="orders-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Newest</SelectItem>
            <SelectItem value="old">Oldest</SelectItem>
            <SelectItem value="value">Highest value</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs font-mono text-slate-500 self-center ml-auto">{data.total} records</div>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-200 text-sm" data-testid="orders-list">
        {data.items.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="grid grid-cols-12 gap-3 p-3 items-center">
            <div className="col-span-4">
              <div className="font-display font-bold truncate">{r.title}</div>
              <div className="text-xs text-slate-500">{r.category} · {r.kind}</div>
            </div>
            <div className="col-span-2 text-xs">
              <div className="font-mono uppercase text-slate-700">{r.status}</div>
              {r.delivery_status && <div className="text-[10px] text-slate-500">{r.delivery_status}</div>}
            </div>
            <div className="col-span-2 text-xs truncate">{r.customer_name || "—"}</div>
            <div className="col-span-2 text-xs truncate">{r.provider_name || "—"}</div>
            <div className="col-span-2 text-right text-xs font-mono">{fmtUsd(r.amount)}</div>
          </div>
        ))}
        {data.items.length === 0 && <div className="p-6 text-sm text-slate-400">No matches.</div>}
      </div>
    </div>
  );
}

// ── Section: Providers (existing table) ────────────────────────────────────
function ProvidersSection() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("revenue");
  const load = async () => {
    const url = new URLSearchParams();
    if (q) url.set("q", q);
    url.set("sort", sort);
    url.set("limit", "200");
    const { data } = await api.get(`/admin/analytics/providers?${url}`);
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sort]);

  return (
    <div data-testid="providers-section">
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input placeholder="Search name / email" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="max-w-xs" />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Top earners</SelectItem>
            <SelectItem value="rating">Highest rated</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs font-mono text-slate-500 self-center ml-auto">{data.total} providers</div>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-200 text-sm">
        {data.items.map((p) => (
          <div key={p.id} className="grid grid-cols-12 gap-3 p-3 items-center">
            <div className="col-span-3">
              <div className="font-display font-bold truncate">{p.name}</div>
              <div className="text-xs text-slate-500 truncate">{p.email}</div>
            </div>
            <div className="col-span-2 text-xs">
              <div className="font-mono uppercase text-slate-700">{p.jobs_completed} jobs</div>
              <div className="text-[10px] text-slate-500">★ {p.avg_rating || "—"} ({p.reviews_count})</div>
            </div>
            <div className="col-span-1 text-xs font-mono text-slate-500 truncate">{(p.categories || []).slice(0, 2).join(", ")}</div>
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

// ── Main Analytics tab ──────────────────────────────────────────────────────
export default function Analytics() {
  const [section, setSection] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [drill, setDrill] = useState(null); // {metric, rangeKey, title}

  const loadAll = useCallback(async () => {
    try {
      const [ov, vi, rv] = await Promise.all([
        api.get("/admin/analytics/overview"),
        api.get("/admin/analytics/visitors?days=30"),
        api.get("/admin/analytics/revenue?days=30"),
      ]);
      setOverview(ov.data); setVisitors(vi.data); setRevenue(rv.data);
    } catch {
      // toast handled per-call
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const SUBS = [
    { key: "overview",  label: "Overview" },
    { key: "signups",   label: "Signups" },
    { key: "orders",    label: "Orders" },
    { key: "providers", label: "Providers + Revenue" },
  ];

  return (
    <div data-testid="analytics-page">
      <div className="flex gap-2 border-b border-slate-200 mb-4 items-center">
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
        <div className="ml-auto pb-1 flex items-center gap-2">
          {overview?.cutoff_at && (
            <span className="text-[10px] font-mono text-slate-400" data-testid="analytics-cutoff-display">
              tracking since {fmtDateTime(overview.cutoff_at)}
            </span>
          )}
          <ResetButton onReset={loadAll} />
        </div>
      </div>
      {section === "overview"  && <OverviewSection overview={overview} visitors={visitors} revenue={revenue} onDrill={setDrill} />}
      {section === "signups"   && <SignupsSection />}
      {section === "orders"    && <OrdersSection />}
      {section === "providers" && <ProvidersSection />}

      <DetailsDialog
        open={!!drill}
        onClose={() => setDrill(null)}
        metric={drill?.metric}
        rangeKey={drill?.rangeKey}
        title={drill?.title}
      />
    </div>
  );
}
