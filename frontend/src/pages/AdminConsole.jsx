import React, { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, ShieldAlert, Wallet as WalletIcon, MessageSquare, Calendar, Users, Briefcase, X, Check, Trash2, Megaphone, Send, BarChart3, Share2 } from "lucide-react";
import { toast } from "sonner";
import AdStudio from "@/components/AdStudio";
import Distribution from "@/components/Distribution";
import Analytics from "@/components/Analytics";
import SocialLinksAdmin from "@/components/SocialLinksAdmin";

const TABS = [
  { key: "analytics",   label: "Analytics",   icon: BarChart3 },
  { key: "credentials", label: "Credentials", icon: ShieldCheck },
  { key: "withdrawals", label: "Withdrawals", icon: WalletIcon },
  { key: "reviews",     label: "Reviews",     icon: MessageSquare },
  { key: "rentals",     label: "Rentals",     icon: Calendar },
  { key: "ads",         label: "Ad Studio",   icon: Megaphone },
  { key: "distribution", label: "Distribution", icon: Send },
  { key: "social",      label: "Social Links", icon: Share2 },
];

function StatTile({ label, value, icon: Icon, testId }) {
  return (
    <div className="border border-slate-200 p-4" data-testid={testId}>
      <div className="flex items-center gap-2 overline text-slate-500"><Icon className="w-3 h-3" />{label}</div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value ?? "—"}</div>
    </div>
  );
}

function CredentialsTab() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/credentials").then(({ data }) => setItems(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const verify = async (id) => { try { await api.post(`/admin/credentials/${id}/verify`); toast.success("Verified"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const reject = async (id) => { try { await api.post(`/admin/credentials/${id}/reject`); toast.success("Rejected"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No pending credentials.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((c) => (
        <div key={c.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`admin-cred-${c.id}`}>
          <div className="col-span-12 md:col-span-3">
            <div className="font-display font-bold">{c.owner?.name || c.user_id}</div>
            <div className="text-xs text-slate-500">{c.owner?.email}</div>
          </div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">
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
    </div>
  );
}

function WithdrawalsTab() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/admin/withdrawals").then(({ data }) => setItems(data || [])).catch(() => {}); }, []);
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No withdrawal records.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((w) => (
        <div key={w.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`admin-wd-${w.id}`}>
          <div className="col-span-12 md:col-span-4">
            <div className="font-display font-bold">{w.owner?.name}</div>
            <div className="text-xs text-slate-500">{w.owner?.email} · balance ${Number(w.owner?.wallet_balance || 0).toFixed(2)}</div>
          </div>
          <div className="col-span-6 md:col-span-3 font-mono text-sm font-bold">${Number(w.amount).toFixed(2)}</div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">{w.method || "bank"} · {new Date(w.created_at).toLocaleDateString()}</div>
          <div className="col-span-12 md:col-span-2 text-right text-[10px] font-mono uppercase tracking-widest border border-slate-200 px-2 py-1 inline-block">{w.status || "completed"}</div>
        </div>
      ))}
    </div>
  );
}

function ReviewsTab() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/reviews").then(({ data }) => setItems(data || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const del = async (id) => { if (!window.confirm("Delete this review?")) return; try { await api.delete(`/admin/reviews/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No reviews yet.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((r) => (
        <div key={r.id} className="p-4" data-testid={`admin-review-${r.id}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold">{r.reviewer_name}</span>
              <span className="text-xs text-amber-600">{"★".repeat(r.overall_stars)}</span>
              <span className="text-[10px] uppercase font-mono text-slate-400">→ {r.target_type}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-slate-400 hover:text-red-600 h-7 px-2" data-testid={`admin-review-del-${r.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
          {r.body && <p className="text-sm text-slate-700 mt-2">{r.body}</p>}
        </div>
      ))}
    </div>
  );
}

function RentalsTab() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/admin/rental-bookings?status=pending_approval").then(({ data }) => setItems(data || [])).catch(() => {}); }, []);
  if (items.length === 0) return <div className="p-6 text-sm text-slate-500">No pending rental bookings.</div>;
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((b) => (
        <div key={b.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`admin-rb-${b.id}`}>
          <div className="col-span-12 md:col-span-4">
            <div className="font-display font-bold">{b.renter_name}</div>
            <Link to={`/rentals/${b.rental_id}`} className="text-xs text-teal-700 underline">view listing</Link>
          </div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">{b.start_date} → {b.end_date}</div>
          <div className="col-span-6 md:col-span-3 text-xs font-mono">subtotal ${Number(b.subtotal).toFixed(2)} · {b.pricing_unit}</div>
          <div className="col-span-12 md:col-span-2 text-right text-[10px] font-mono uppercase tracking-widest border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1 inline-block">{b.status.replace(/_/g, " ")}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminConsole() {
  const { user } = useAuth();
  const [tab, setTab] = useState("analytics");
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (user?.role === "admin") {
      api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => {});
    }
  }, [user]);

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
        {tab === "analytics"   && <Analytics />}
        {tab === "credentials" && <CredentialsTab />}
        {tab === "withdrawals" && <WithdrawalsTab />}
        {tab === "reviews"     && <ReviewsTab />}
        {tab === "rentals"     && <RentalsTab />}
        {tab === "ads"         && <AdStudio />}
        {tab === "distribution" && <Distribution />}
        {tab === "social" && <SocialLinksAdmin />}
      </div>
    </div>
  );
}
