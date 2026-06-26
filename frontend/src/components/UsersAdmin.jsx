import React, { useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { User, Search, ShieldCheck, Landmark, Loader2, Star, Briefcase, ShoppingBag, Wallet } from "lucide-react";
import { toast } from "sonner";

const fmtUsd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);
const fmtNum = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; } };
const fmtDateTime = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "U";

const ROLE_COLORS = {
  customer: "#0F766E",
  provider: "#D97706",
  admin: "#DC2626",
  retailer: "#2563EB",
  restaurant: "#7C3AED",
};

export default function UsersAdmin() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("any");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [openUser, setOpenUser] = useState(null); // selected user id
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (role !== "any") params.set("role", role);
      params.set("sort", sort);
      params.set("limit", "100");
      const { data } = await api.get(`/admin/users?${params}`);
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  }, [q, role, sort]);

  useEffect(() => { load(); }, [role, sort]);
  // explicit search via Enter / button — don't refire on every keystroke

  const openDetail = async (id) => {
    setOpenUser(id);
    setDetail(null);
    try {
      const { data } = await api.get(`/admin/users/${id}/detail`);
      setDetail(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div data-testid="users-admin-page">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-black tracking-tighter">Users</h2>
        <p className="text-sm text-slate-500 mt-1">
          Browse, search, and inspect everyone on Lumo. Click any row to see their full activity log.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search name, email, phone…"
            className="pl-7 rounded-none text-sm"
            data-testid="users-search"
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-40" data-testid="users-role-filter"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="w-44" data-testid="users-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="earnings">Highest wallet</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs font-mono text-slate-500">{fmtNum(data.total)} users</div>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="border border-slate-200 divide-y divide-slate-200" data-testid="users-list">
          {data.items.length === 0 && <div className="p-8 text-sm text-slate-400 text-center">No users match.</div>}
          {data.items.map((u) => (
            <button
              key={u.id}
              onClick={() => openDetail(u.id)}
              className="w-full grid grid-cols-12 gap-3 p-3 items-center text-left hover:bg-slate-50 transition-colors"
              data-testid={`user-row-${u.id}`}
            >
              {/* Avatar */}
              <div className="col-span-1">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 grid place-items-center font-display font-bold text-white text-sm" style={{ background: ROLE_COLORS[u.role] || "#475569" }}>
                    {initials(u.name)}
                  </div>
                )}
              </div>
              {/* Name + email */}
              <div className="col-span-4 min-w-0">
                <div className="font-display font-bold truncate flex items-center gap-1.5">
                  {u.name || u.email}
                  {u.is_verified && <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />}
                  {u.stripe_payouts_enabled && <Landmark className="w-3.5 h-3.5 text-emerald-600" title="Bank connected" />}
                </div>
                <div className="text-xs text-slate-500 truncate">{u.email}</div>
              </div>
              {/* Role */}
              <div className="col-span-2 text-xs">
                <span className="font-mono uppercase tracking-wider px-1.5 py-0.5 text-white" style={{ background: ROLE_COLORS[u.role] || "#475569" }}>
                  {u.role}
                </span>
              </div>
              {/* Activity */}
              <div className="col-span-3 text-xs font-mono text-slate-500 flex gap-3">
                <span title="Jobs completed"><Briefcase className="w-3 h-3 inline mr-1" />{u.jobs_completed}</span>
                <span title="Orders"><ShoppingBag className="w-3 h-3 inline mr-1" />{u.orders_completed}</span>
                <span title="Reviews"><Star className="w-3 h-3 inline mr-1" />{u.reviews_count}</span>
              </div>
              {/* Wallet + joined */}
              <div className="col-span-2 text-right">
                <div className="font-mono text-sm">{fmtUsd(u.wallet_balance)}</div>
                <div className="text-[10px] font-mono text-slate-400">{fmtDate(u.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail side panel */}
      <Sheet open={!!openUser} onOpenChange={(o) => { if (!o) { setOpenUser(null); setDetail(null); } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto" data-testid="user-detail-sheet">
          <SheetHeader>
            <SheetTitle className="font-display tracking-tighter text-2xl">
              {detail?.user?.name || detail?.user?.email || "Loading…"}
            </SheetTitle>
          </SheetHeader>
          {!detail ? (
            <div className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="mt-4 space-y-6">
              {/* Profile card */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono border border-slate-200 p-3">
                <div><span className="text-slate-500">Email:</span> {detail.user.email}</div>
                <div><span className="text-slate-500">Phone:</span> {detail.user.phone || "—"}</div>
                <div><span className="text-slate-500">Role:</span> <span className="uppercase">{detail.user.role}</span></div>
                <div><span className="text-slate-500">Joined:</span> {fmtDate(detail.user.created_at)}</div>
                <div><span className="text-slate-500">Wallet:</span> {fmtUsd(detail.user.wallet_balance)}</div>
                <div><span className="text-slate-500">Bank:</span> {detail.user.stripe_payouts_enabled ? "Connected" : "Not connected"}</div>
              </div>

              <ActivitySection title="Recent jobs" icon={Briefcase} items={detail.jobs} fields={(j) => ({
                title: j.title,
                meta: `${j.status} · $${(j.pay_rate || 0).toFixed(2)}/${j.pay_unit || "flat"}`,
                date: j.created_at,
              })} />
              <ActivitySection title="Recent orders" icon={ShoppingBag} items={detail.orders} fields={(o) => ({
                title: `Order · ${o.retailer_name || o.restaurant_name || "Store"}`,
                meta: `${o.status} · ${fmtUsd((o.item_total || 0) + (o.delivery_fee || 0))}`,
                date: o.created_at,
              })} />
              <ActivitySection title="Reviews" icon={Star} items={detail.reviews} fields={(r) => ({
                title: `${"★".repeat(r.overall_stars || 0)} — ${r.body ? r.body.slice(0, 80) : "(no comment)"}`,
                meta: `${r.target_type} review`,
                date: r.created_at,
              })} />
              <ActivitySection title="Wallet transactions" icon={Wallet} items={detail.wallet} fields={(w) => ({
                title: `${w.amount > 0 ? "+" : ""}${fmtUsd(w.amount)} · ${w.reason || w.type}`,
                meta: w.type,
                date: w.created_at,
              })} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActivitySection({ title, icon: Icon, items, fields }) {
  if (!items || items.length === 0) {
    return (
      <div>
        <div className="overline flex items-center gap-1 mb-1"><Icon className="w-3 h-3" /> {title}</div>
        <div className="text-xs text-slate-400 italic px-1">None yet.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="overline flex items-center gap-1 mb-2"><Icon className="w-3 h-3" /> {title} <span className="text-slate-400">· {items.length}</span></div>
      <div className="border border-slate-200 divide-y divide-slate-200">
        {items.map((it, i) => {
          const f = fields(it);
          return (
            <div key={it.id || i} className="px-3 py-2 text-xs">
              <div className="font-display font-bold truncate">{f.title}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex justify-between gap-2">
                <span className="truncate">{f.meta}</span>
                <span>{fmtDateTime(f.date)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
