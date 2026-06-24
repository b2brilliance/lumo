import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Check, X, Calendar, Inbox, ChevronLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLE = {
  pending_approval: "bg-amber-50 border-amber-200 text-amber-700",
  deposit_pending: "bg-sky-50 border-sky-200 text-sky-700",
  deposit_paid: "bg-teal-50 border-teal-200 text-teal-700",
  confirmed: "bg-teal-50 border-teal-200 text-teal-700",
  in_progress: "bg-violet-50 border-violet-200 text-violet-700",
  completed: "bg-slate-50 border-slate-200 text-slate-600",
  declined: "bg-red-50 border-red-200 text-red-600",
  cancelled: "bg-slate-50 border-slate-200 text-slate-500",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_approval", label: "Pending" },
  { key: "deposit_pending", label: "Awaiting payment" },
  { key: "deposit_paid", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
];

export default function RentalInbox() {
  const { user } = useAuth();
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    api.get("/rental-bookings/mine?role=owner")
      .then(({ data }) => setItems(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user === undefined) return <div className="p-12 text-slate-500">Loading…</div>;
  if (!user || user === false) return <Navigate to="/login" replace />;

  const approve = async (id) => {
    setBusyId(id);
    try { await api.post(`/rental-bookings/${id}/approve`); toast.success("Approved — renter will be prompted to pay."); load(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setBusyId(null); }
  };
  const decline = async (id) => {
    if (!window.confirm("Decline this booking request?")) return;
    setBusyId(id);
    try { await api.post(`/rental-bookings/${id}/decline`); toast.success("Declined"); load(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setBusyId(null); }
  };

  const filtered = filter === "all" ? items : items.filter((b) => b.status === filter);
  const pendingCount = items.filter((b) => b.status === "pending_approval").length;

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-10">
      <Link to="/rentals" className="inline-flex items-center gap-1 text-sm font-mono text-slate-500 hover:text-slate-900" data-testid="inbox-back">
        <ChevronLeft className="w-3.5 h-3.5" /> Rentals
      </Link>
      <div className="flex items-end justify-between gap-4 flex-wrap mt-4">
        <div>
          <div className="overline">Host</div>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-2">Booking inbox.</h1>
          <p className="text-slate-600 mt-3">Approve or decline requests, watch payment status, and keep your calendar moving.</p>
        </div>
        <Link to="/rentals/host">
          <Button variant="outline" className="font-mono" data-testid="inbox-host-cta">+ List a rental</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8" data-testid="inbox-stats">
        <Stat label="Total bookings" value={items.length} />
        <Stat label="Pending approval" value={pendingCount} accent={pendingCount > 0} />
        <Stat label="Confirmed" value={items.filter((b) => b.status === "deposit_paid" || b.status === "confirmed").length} />
        <Stat label="In progress" value={items.filter((b) => b.status === "in_progress").length} />
      </div>

      <div className="flex gap-1 border-b border-slate-200 mt-8 overflow-x-auto" data-testid="inbox-tabs">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const c = f.key === "pending_approval" ? pendingCount : null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${active ? "border-teal-700 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
              data-testid={`inbox-filter-${f.key}`}
            >
              {f.label}
              {c > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">{c}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="p-12 text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 p-16 text-center" data-testid="inbox-empty">
            <Inbox className="w-10 h-10 mx-auto text-slate-300" />
            <div className="mt-4 font-display text-xl font-bold tracking-tight">No bookings here yet.</div>
            <p className="text-sm text-slate-500 mt-2">When renters request your listings, they’ll show up here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200" data-testid="inbox-list">
            {filtered.map((b) => {
              const img = b.rental?.media_url;
              const url = img?.startsWith("http") ? img : (img ? `${BACKEND_URL}${img}` : null);
              const isPending = b.status === "pending_approval";
              return (
                <div key={b.id} className="p-4 grid grid-cols-12 gap-4 items-center" data-testid={`inbox-row-${b.id}`}>
                  <div className="col-span-12 md:col-span-5 flex gap-3 items-center">
                    {url ? (
                      <img src={url} alt="" className="w-14 h-14 object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-slate-100 flex items-center justify-center flex-shrink-0"><Calendar className="w-5 h-5 text-slate-400" /></div>
                    )}
                    <div className="min-w-0">
                      <Link to={`/rentals/${b.rental_id}`} className="font-display font-bold hover:underline truncate flex items-center gap-1" data-testid={`inbox-rental-link-${b.id}`}>
                        {b.rental?.title || "Rental"} <ExternalLink className="w-3 h-3 opacity-50" />
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">{b.renter_name}</div>
                    </div>
                  </div>
                  <div className="col-span-6 md:col-span-3 text-xs font-mono">
                    <div className="text-slate-900">{b.start_date} → {b.end_date}</div>
                    <div className="text-slate-500 mt-0.5">{b.quantity} {b.pricing_unit} · ${Number(b.unit_price).toFixed(0)}/{b.pricing_unit.replace("ly", "").replace("ho", "h")}</div>
                  </div>
                  <div className="col-span-6 md:col-span-2 font-mono text-sm">
                    <div className="font-bold">${Number(b.subtotal).toFixed(2)}</div>
                    <div className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 inline-block mt-1 ${STATUS_STYLE[b.status] || "border-slate-200 text-slate-500"}`}>
                      {b.status.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-2 flex justify-end gap-2">
                    {isPending ? (
                      <>
                        <Button size="sm" onClick={() => approve(b.id)} disabled={busyId === b.id} className="bg-teal-700 hover:bg-teal-800 text-white h-8 px-3" data-testid={`inbox-approve-${b.id}`}>
                          <Check className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decline(b.id)} disabled={busyId === b.id} className="h-8 px-3" data-testid={`inbox-decline-${b.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{new Date(b.created_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`border p-4 ${accent ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
      <div className="overline text-slate-500">{label}</div>
      <div className="font-display text-3xl font-black tracking-tighter mt-1">{value}</div>
    </div>
  );
}
