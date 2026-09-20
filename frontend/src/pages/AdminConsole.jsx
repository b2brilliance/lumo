import React, { useEffect, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, ShieldAlert, Wallet as WalletIcon, MessageSquare, Calendar, Users, Briefcase, X, Check, Trash2, Megaphone, Send, BarChart3, Share2, Database, KeyRound, UserCog, BookOpen, Globe, DollarSign, Package, Store, MapPin } from "lucide-react";
import { toast } from "sonner";
import AdStudio from "@/components/AdStudio";
import Distribution from "@/components/Distribution";
import Analytics from "@/components/Analytics";
import SocialLinksAdmin from "@/components/SocialLinksAdmin";
import DataManagementTab from "@/components/DataManagementTab";
import PaymentsAdmin from "@/components/PaymentsAdmin";
import BlogAdmin from "@/components/BlogAdmin";
import ErrorBoundary from "@/components/ErrorBoundary";
import AffiliatesTab from "@/pages/admin/AffiliatesTab";
import UsersTab from "@/pages/admin/UsersTab";
import ContentTab from "@/pages/admin/ContentTab";
import ShopTab from "@/pages/admin/ShopTab";
import RecruitTab from "@/pages/admin/RecruitTab";
import BulkActionsBar, { BulkActionButton, BulkCheckbox } from "@/components/admin/BulkActionsBar";
import useBulkSelection from "@/components/admin/useBulkSelection";

const TABS = [
  { key: "analytics",   label: "Analytics",   icon: BarChart3 },
  { key: "users",       label: "Users",       icon: UserCog },
  { key: "content",     label: "Content",     icon: Package },
  { key: "shop",        label: "Shop",        icon: Store },
  { key: "recruit",     label: "Recruit",     icon: MapPin },
  { key: "payments",    label: "Payments",    icon: KeyRound },
  { key: "blog",        label: "Blog & email", icon: BookOpen },
  { key: "credentials", label: "Credentials", icon: ShieldCheck },
  { key: "withdrawals", label: "Withdrawals", icon: WalletIcon },
  { key: "reviews",     label: "Reviews",     icon: MessageSquare },
  { key: "rentals",     label: "Rentals",     icon: Calendar },
  { key: "ads",         label: "Ad Studio",   icon: Megaphone },
  { key: "distribution", label: "Distribution", icon: Send },
  { key: "social",      label: "Social Links", icon: Share2 },
  { key: "data",        label: "Data",        icon: Database },
  { key: "visitors",    label: "Visitors",    icon: Globe },
  { key: "affiliates",  label: "Affiliates",  icon: DollarSign },
];

function StatTile({ label, value, icon: Icon, testId }) {
  return (
    <div className="border border-slate-200 p-4" data-testid={testId}>
      <div className="flex items-center gap-2 overline text-slate-500"><Icon className="w-3 h-3" />{label}</div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value ?? "—"}</div>
    </div>
  );
}

// ── Visitors tab — where each visit comes from (country + path + recent feed)
const COUNTRY_NAMES = {
  US: "United States", CA: "Canada", GB: "United Kingdom", MX: "Mexico", BR: "Brazil",
  AR: "Argentina", FR: "France", DE: "Germany", IT: "Italy", ES: "Spain", PT: "Portugal",
  NL: "Netherlands", BE: "Belgium", CH: "Switzerland", AT: "Austria", IE: "Ireland",
  PL: "Poland", CZ: "Czechia", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  RU: "Russia", UA: "Ukraine", TR: "Türkiye", GR: "Greece", RO: "Romania", HU: "Hungary",
  IN: "India", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
  CN: "China", TW: "Taiwan", HK: "Hong Kong", JP: "Japan", KR: "South Korea",
  ID: "Indonesia", PH: "Philippines", VN: "Vietnam", TH: "Thailand", MY: "Malaysia", SG: "Singapore",
  AU: "Australia", NZ: "New Zealand", ZA: "South Africa", EG: "Egypt", NG: "Nigeria", KE: "Kenya",
  GH: "Ghana", ET: "Ethiopia", MA: "Morocco", IL: "Israel", AE: "United Arab Emirates",
  SA: "Saudi Arabia", QA: "Qatar", JO: "Jordan", LB: "Lebanon", IR: "Iran", IQ: "Iraq",
  CO: "Colombia", PE: "Peru", CL: "Chile", VE: "Venezuela", UY: "Uruguay", EC: "Ecuador",
};
function flagFromCode(code) {
  if (!code || code === "—" || code.length !== 2) return "🌐";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  return String.fromCodePoint(A + (code.charCodeAt(0) - base)) + String.fromCodePoint(A + (code.charCodeAt(1) - base));
}
function fmtTimeAgo(iso) {
  if (!iso) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

function VisitorsTab() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = (h) => {
    setLoading(true);
    api.get(`/admin/analytics/countries?hours=${h}`)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(hours); }, [hours]);

  const max = (data?.by_country || []).reduce((m, r) => Math.max(m, r.visits), 1);

  return (
    <div className="space-y-8" data-testid="admin-visitors-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl font-bold">Where visitors come from</h2>
        <div className="flex gap-1" data-testid="visitors-range">
          {[1, 24, 24 * 7, 24 * 30].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 border ${hours === h ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:border-slate-900"}`}
              data-testid={`visitors-range-${h}`}
            >
              {h === 1 ? "Last hour" : h === 24 ? "24h" : h === 168 ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="Total pageviews" value={data?.total_pageviews ?? "—"} icon={BarChart3} testId="visitors-stat-total" />
        <StatTile label="Countries" value={data?.by_country?.length ?? "—"} icon={Globe} testId="visitors-stat-countries" />
        <StatTile label="Unique visitors (top country)" value={data?.by_country?.[0]?.unique_visitors ?? "—"} icon={Users} testId="visitors-stat-uniq" />
      </div>

      <div>
        <h3 className="font-display text-lg font-bold mb-3">Country breakdown</h3>
        {loading && <div className="text-slate-500 text-sm">Loading…</div>}
        {!loading && (!data?.by_country || data.by_country.length === 0) && (
          <div className="text-slate-500 text-sm border border-dashed border-slate-300 p-6 text-center" data-testid="visitors-empty">
            No pageviews recorded in this window yet. As visitors hit the site, they&apos;ll appear here.
          </div>
        )}
        {!loading && data?.by_country?.length > 0 && (
          <div className="border border-slate-200 divide-y divide-slate-100" data-testid="visitors-by-country">
            {data.by_country.map((row) => {
              const pct = (row.visits / max) * 100;
              const name = COUNTRY_NAMES[row.country] || row.country || "Unknown";
              return (
                <div key={row.country || "_"} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid={`visitor-country-${row.country}`}>
                  <span className="text-xl leading-none w-7 text-center" data-no-i18n="true">{flagFromCode(row.country)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display font-bold text-slate-900 truncate">{name}</span>
                      <span className="font-mono text-[11px] uppercase tracking-widest text-slate-400">{row.country || "—"}</span>
                    </div>
                    <div className="mt-1 h-1 bg-slate-100 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-teal-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-32">
                    <div className="font-mono text-sm font-bold text-slate-900">{row.visits.toLocaleString()}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{row.unique_visitors} uniq</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display text-lg font-bold mb-3">Recent visits</h3>
        {!loading && (!data?.recent || data.recent.length === 0) && (
          <div className="text-slate-500 text-sm">No recent activity.</div>
        )}
        {!loading && data?.recent?.length > 0 && (
          <div className="border border-slate-200 divide-y divide-slate-100 max-h-[400px] overflow-y-auto" data-testid="visitors-recent">
            {data.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="text-base leading-none w-6 text-center" data-no-i18n="true">{flagFromCode(r.country)}</span>
                <span className="font-mono uppercase tracking-widest w-8 text-slate-500" data-no-i18n="true">{r.country || "—"}</span>
                <span className="font-mono text-slate-900 flex-1 truncate" data-no-i18n="true">{r.path}</span>
                {r.referrer && (
                  <span className="hidden sm:inline font-mono text-[10px] text-slate-400 max-w-[200px] truncate" title={r.referrer} data-no-i18n="true">
                    ← {(() => { try { return new URL(r.referrer).hostname; } catch { return r.referrer.slice(0, 30); } })()}
                  </span>
                )}
                <span className="font-mono text-[10px] text-slate-400 shrink-0 w-16 text-right" data-no-i18n="true">{fmtTimeAgo(r.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function CredentialsTab() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/credentials").then(({ data }) => setItems(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const verify = async (id) => { try { await api.post(`/admin/credentials/${id}/verify`); toast.success("Verified"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const reject = async (id) => { try { await api.post(`/admin/credentials/${id}/reject`); toast.success("Rejected"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const sel = useBulkSelection(items);
  const bulkVerify = async () => {
    try { const { data } = await api.post("/admin/credentials/bulk-verify", { ids: sel.selectedIds }); toast.success(`Verified ${data.modified_count}`); sel.clear(); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const bulkReject = async () => {
    if (!window.confirm(`Reject ${sel.count} credential${sel.count === 1 ? "" : "s"}?`)) return;
    try { const { data } = await api.post("/admin/credentials/bulk-reject", { ids: sel.selectedIds }); toast.success(`Rejected ${data.modified_count}`); sel.clear(); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No pending credentials.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      <div className="p-2 bg-slate-50 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <BulkCheckbox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} ariaLabel="Select all credentials" testId="admin-cred-select-all" />
        <span>{sel.count > 0 ? `${sel.count} selected` : `${items.length} pending`}</span>
      </div>
      {items.map((c) => (
        <div key={c.id} className={`p-4 grid grid-cols-12 gap-3 items-center ${sel.isSelected(c.id) ? "bg-slate-50" : ""}`} data-testid={`admin-cred-${c.id}`}>
          <div className="col-span-1"><BulkCheckbox checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} ariaLabel={`Select credential ${c.id}`} testId={`admin-cred-select-${c.id}`} /></div>
          <div className="col-span-11 md:col-span-3">
            <div className="font-display font-bold">{c.owner?.name || c.user_id}</div>
            <div className="text-xs text-slate-500">{c.owner?.email}</div>
          </div>
          <div className="col-span-6 md:col-span-2 text-xs font-mono">
            <div className="text-slate-900">{c.kind}</div>
            <div className="text-slate-500 uppercase">{c.category} · {c.state || "—"}</div>
          </div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">
            {c.license_number && <div>#{c.license_number}</div>}
            {c.ai_verification && (
              <div className="text-teal-700 mt-1">AI: {c.ai_verification.verdict} · {(c.ai_verification.confidence * 100).toFixed(0)}%</div>
            )}
          </div>
          <div className="col-span-12 md:col-span-3 text-right flex justify-end gap-2">
            <Button size="sm" onClick={() => verify(c.id)} className="bg-teal-700 hover:bg-teal-800 text-white h-7 px-3" data-testid={`admin-cred-verify-${c.id}`}><Check className="w-3 h-3 mr-1" />Verify</Button>
            <Button size="sm" variant="outline" onClick={() => reject(c.id)} className="h-7 px-3" data-testid={`admin-cred-reject-${c.id}`}><X className="w-3 h-3 mr-1" />Reject</Button>
          </div>
        </div>
      ))}
      <BulkActionsBar count={sel.count} onClear={sel.clear} testId="admin-cred-bulk-bar">
        <BulkActionButton onClick={bulkVerify} variant="success" testId="admin-cred-bulk-verify"><Check className="w-3.5 h-3.5" /> Verify</BulkActionButton>
        <BulkActionButton onClick={bulkReject} variant="danger" testId="admin-cred-bulk-reject"><X className="w-3.5 h-3.5" /> Reject</BulkActionButton>
      </BulkActionsBar>
    </div>
  );
}

function WithdrawalsTab() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/withdrawals").then(({ data }) => setItems(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const sel = useBulkSelection(items);
  const setStatus = async (status, label) => {
    if (!sel.count) return;
    try { const { data } = await api.post("/admin/withdrawals/bulk-patch", { ids: sel.selectedIds, status }); toast.success(`${label} ${data.modified_count}`); sel.clear(); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No withdrawal records.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      <div className="p-2 bg-slate-50 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <BulkCheckbox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} ariaLabel="Select all withdrawals" testId="admin-wd-select-all" />
        <span>{sel.count > 0 ? `${sel.count} selected` : `${items.length} withdrawals`}</span>
      </div>
      {items.map((w) => (
        <div key={w.id} className={`p-4 grid grid-cols-12 gap-3 items-center ${sel.isSelected(w.id) ? "bg-slate-50" : ""}`} data-testid={`admin-wd-${w.id}`}>
          <div className="col-span-1"><BulkCheckbox checked={sel.isSelected(w.id)} onChange={() => sel.toggle(w.id)} ariaLabel={`Select ${w.owner?.email || w.id}`} testId={`admin-wd-select-${w.id}`} /></div>
          <div className="col-span-11 md:col-span-3">
            <div className="font-display font-bold">{w.owner?.name}</div>
            <div className="text-xs text-slate-500">{w.owner?.email} · balance ${Number(w.owner?.wallet_balance || 0).toFixed(2)}</div>
          </div>
          <div className="col-span-6 md:col-span-3 font-mono text-sm font-bold">${Number(w.amount).toFixed(2)}</div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">{w.method || "bank"} · {new Date(w.created_at).toLocaleDateString()}</div>
          <div className="col-span-12 md:col-span-2 text-right text-[10px] font-mono uppercase tracking-widest border border-slate-200 px-2 py-1 inline-block">{w.status || "completed"}</div>
        </div>
      ))}
      <BulkActionsBar count={sel.count} onClear={sel.clear} testId="admin-wd-bulk-bar">
        <BulkActionButton onClick={() => setStatus("completed", "Approved")} variant="success" testId="admin-wd-bulk-approve"><Check className="w-3.5 h-3.5" /> Approve</BulkActionButton>
        <BulkActionButton onClick={() => setStatus("denied", "Denied")} variant="danger" testId="admin-wd-bulk-deny"><X className="w-3.5 h-3.5" /> Deny</BulkActionButton>
      </BulkActionsBar>
    </div>
  );
}

function ReviewsTab() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/reviews").then(({ data }) => setItems(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const del = async (id) => { if (!window.confirm("Delete this review?")) return; try { await api.delete(`/admin/reviews/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const sel = useBulkSelection(items);
  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${sel.count} review${sel.count === 1 ? "" : "s"}?`)) return;
    try { const { data } = await api.post("/admin/reviews/bulk-delete", { ids: sel.selectedIds }); toast.success(`Deleted ${data.deleted_count}`); sel.clear(); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No reviews yet.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      <div className="p-2 bg-slate-50 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <BulkCheckbox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} ariaLabel="Select all reviews" testId="admin-review-select-all" />
        <span>{sel.count > 0 ? `${sel.count} selected` : `${items.length} reviews`}</span>
      </div>
      {items.map((r) => (
        <div key={r.id} className={`p-4 ${sel.isSelected(r.id) ? "bg-slate-50" : ""}`} data-testid={`admin-review-${r.id}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BulkCheckbox checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} ariaLabel={`Select review by ${r.reviewer_name}`} testId={`admin-review-select-${r.id}`} />
              <span className="font-display font-bold">{r.reviewer_name}</span>
              <span className="text-xs text-amber-600">{"★".repeat(r.overall_stars)}</span>
              <span className="text-[10px] uppercase font-mono text-slate-400">→ {r.target_type}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-slate-400 hover:text-red-600 h-7 px-2" data-testid={`admin-review-del-${r.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
          {r.body && <p className="text-sm text-slate-700 mt-2 pl-7">{r.body}</p>}
        </div>
      ))}
      <BulkActionsBar count={sel.count} onClear={sel.clear} testId="admin-review-bulk-bar">
        <BulkActionButton onClick={bulkDelete} variant="danger" testId="admin-review-bulk-delete"><Trash2 className="w-3.5 h-3.5" /> Delete</BulkActionButton>
      </BulkActionsBar>
    </div>
  );
}

function RentalsTab() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/rental-bookings?status=pending_approval").then(({ data }) => setItems(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const sel = useBulkSelection(items);
  const setStatus = async (status, label) => {
    if (!sel.count) return;
    try { const { data } = await api.post("/admin/rental-bookings/bulk-patch", { ids: sel.selectedIds, status }); toast.success(`${label} ${data.modified_count}`); sel.clear(); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No pending rental bookings.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      <div className="p-2 bg-slate-50 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <BulkCheckbox checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} ariaLabel="Select all rentals" testId="admin-rb-select-all" />
        <span>{sel.count > 0 ? `${sel.count} selected` : `${items.length} bookings`}</span>
      </div>
      {items.map((b) => (
        <div key={b.id} className={`p-4 grid grid-cols-12 gap-3 items-center ${sel.isSelected(b.id) ? "bg-slate-50" : ""}`} data-testid={`admin-rb-${b.id}`}>
          <div className="col-span-1"><BulkCheckbox checked={sel.isSelected(b.id)} onChange={() => sel.toggle(b.id)} ariaLabel={`Select booking ${b.id}`} testId={`admin-rb-select-${b.id}`} /></div>
          <div className="col-span-11 md:col-span-3">
            <div className="font-display font-bold">{b.renter_name}</div>
            <Link to={`/rentals/${b.rental_id}`} className="text-xs text-teal-700 underline">view listing</Link>
          </div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">{b.start_date} → {b.end_date}</div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">subtotal ${Number(b.subtotal).toFixed(2)} · {b.pricing_unit}</div>
          <div className="col-span-12 md:col-span-2 text-right text-[10px] font-mono uppercase tracking-widest border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1 inline-block">{b.status.replace(/_/g, " ")}</div>
        </div>
      ))}
      <BulkActionsBar count={sel.count} onClear={sel.clear} testId="admin-rb-bulk-bar">
        <BulkActionButton onClick={() => setStatus("approved", "Approved")} variant="success" testId="admin-rb-bulk-approve"><Check className="w-3.5 h-3.5" /> Approve</BulkActionButton>
        <BulkActionButton onClick={() => setStatus("declined", "Declined")} variant="danger" testId="admin-rb-bulk-decline"><X className="w-3.5 h-3.5" /> Decline</BulkActionButton>
      </BulkActionsBar>
    </div>
  );
}

export default function AdminConsole() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "analytics";
  const [tab, setTab] = useState(initialTab);
  const [stats, setStats] = useState(null);
  const [affiliateSetup, setAffiliateSetup] = useState(null); // { missing_count, total_placeholders }
  useEffect(() => {
    if (user?.role === "admin") {
      api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => {});
      // Fetch tracking ID setup status so we can nudge the admin.
      Promise.all([
        api.get("/admin/affiliates/settings").catch(() => ({ data: { keys: {} } })),
        api.get("/admin/affiliates/offers").catch(() => ({ data: { offers: [] } })),
      ]).then(([s, o]) => {
        const keys = s?.data?.keys || {};
        const all = new Set();
        (o?.data?.offers || []).forEach((off) => {
          const matches = (off.url_template || "").match(/\{([a-zA-Z0-9_]+)\}/g) || [];
          matches.forEach((m) => all.add(m.replace(/[{}]/g, "")));
        });
        all.delete("city_slug");
        const total = all.size;
        let missing = 0;
        all.forEach((k) => { if (!keys[k]) missing += 1; });
        setAffiliateSetup({ missing_count: missing, total_placeholders: total });
      }).catch(() => setAffiliateSetup(null));
    }
  }, [user]);

  // Sync tab selection to the URL so deep links from AffiliateBlock work.
  useEffect(() => {
    if (searchParams.get("tab") !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (user === undefined) return <div className="p-12 text-slate-500">Loading…</div>;
  if (!user || user === false) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <div className="p-12 text-red-600">Admin access only.</div>;

  const TabIcon = TABS.find((t) => t.key === tab)?.icon;

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-10">
      <div className="overline">Admin</div>
      <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Operator console.</h1>
      <p className="text-slate-600 mt-3">Review pending credentials, approve withdrawals, moderate reviews, and watch rental bookings — all in one place.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8" data-testid="admin-stats">
        <StatTile label="Pending creds"     value={stats?.pending_credentials}      icon={ShieldAlert} testId="admin-stat-creds" />
        <StatTile label="Withdrawals"        value={stats?.pending_withdrawals}      icon={WalletIcon}  testId="admin-stat-wd" />
        <StatTile label="Active rentals"     value={stats?.active_rentals}           icon={Calendar}    testId="admin-stat-rentals" />
        <StatTile label="Pending bookings"   value={stats?.pending_rental_bookings}  icon={Briefcase}   testId="admin-stat-bookings" />
      </div>

      {affiliateSetup && affiliateSetup.missing_count > 0 && (
        <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="admin-affiliate-setup-banner">
          <div className="flex-1">
            <div className="overline text-amber-700 mb-1">Referral tracking setup</div>
            <div className="text-sm text-slate-800">
              <strong>{affiliateSetup.missing_count} of {affiliateSetup.total_placeholders}</strong> partner tracking IDs still need to be added. Without them, Lumo can&apos;t collect commissions when users sign up for referred services (Uber, DoorDash, Chime, etc.).
            </div>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-none"
            onClick={() => setTab("affiliates")}
            data-testid="admin-affiliate-setup-cta"
          >
            <DollarSign className="w-3.5 h-3.5 mr-1" /> Add tracking IDs
          </Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mt-10 overflow-x-auto" data-testid="admin-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 ${active ? "border-teal-700 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
              data-testid={`admin-tab-${t.key}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <ErrorBoundary
          key={tab}
          label={`the ${TABS.find((t) => t.key === tab)?.label || tab} tab`}
          onReset={() => setTab("analytics")}
          resetLabel="Analytics tab"
          testid="admin-tab-error"
        >
          {tab === "analytics"   && <Analytics />}
          {tab === "credentials" && <CredentialsTab />}
          {tab === "withdrawals" && <WithdrawalsTab />}
          {tab === "reviews"     && <ReviewsTab />}
          {tab === "rentals"     && <RentalsTab />}
          {tab === "ads"         && <AdStudio />}
          {tab === "distribution" && <Distribution />}
          {tab === "social" && <SocialLinksAdmin />}
          {tab === "data" && <DataManagementTab />}
          {tab === "payments" && <PaymentsAdmin />}
          {tab === "users" && <UsersTab />}
          {tab === "content" && <ContentTab />}
          {tab === "shop" && <ShopTab />}
          {tab === "recruit" && <RecruitTab />}
          {tab === "blog" && <BlogAdmin />}
          {tab === "visitors" && <VisitorsTab />}
          {tab === "affiliates" && <AffiliatesTab />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
