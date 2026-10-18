import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError, errorCode } from "@/lib/api";
import { useLocale } from "@/lib/locale";
import { toast } from "sonner";
import { MapPin, Truck, RefreshCw, Check } from "lucide-react";

const FILTERS = [
  { key: "physical_delivery", label: "Deliveries & rides" },
  { key: "all", label: "All jobs" },
];

const JobRow = ({ job, onAccept, busy }) => {
  const { formatPrice } = useLocale();
  const pay = (job.pay_rate || 0) * (job.estimated_units || 1);
  const where = job.pickup_location?.address || (job.is_remote ? "Remote" : "Location on request");
  return (
    <li className="p-5 flex flex-col sm:flex-row sm:items-center gap-4" data-testid={`available-job-${job.id}`}>
      <div className="flex-1 min-w-0">
        <Link to={`/jobs/${job.id}`} className="font-display font-bold text-lg hover:underline">{job.title}</Link>
        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
          <span className="uppercase font-mono">{job.category}</span>
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{where}</span>
          {job.distance_miles != null && <span>{job.distance_miles} mi</span>}
        </div>
      </div>
      <div className="font-display text-2xl font-black" data-testid={`available-job-pay-${job.id}`}>{formatPrice(pay)}</div>
      <button
        onClick={() => onAccept(job)}
        disabled={busy}
        className="btn-lumo btn-lumo-primary disabled:opacity-40"
        data-testid={`accept-job-${job.id}`}
      >
        <Check className="w-4 h-4" /> {busy ? "Accepting…" : "Accept"}
      </button>
    </li>
  );
};

export default function AvailableJobs() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("physical_delivery");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/provider/opportunities");
      setJobs((Array.isArray(data) ? data : []).filter((j) => !j.apply_url));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const accept = async (job) => {
    setBusyId(job.id);
    try {
      await api.post(`/jobs/${job.id}/accept`);
      toast.success("Job accepted — head to tracking when you're on the way");
      nav(`/jobs/${job.id}/track`);
    } catch (e) {
      if (errorCode(e) === "stripe_onboarding_required") nav("/provider?stripe=onboard");
      toast.error(formatApiError(e));
      setBusyId(null);
    }
  };

  const shown = filter === "all" ? jobs : jobs.filter((j) => j.category_group === filter);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12" data-testid="available-jobs-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="overline flex items-center gap-2"><Truck className="w-4 h-4 text-teal-700" /> Available jobs</div>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-2">Pick a job. Get paid.</h1>
        </div>
        <button onClick={load} className="border border-slate-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-50" data-testid="available-jobs-refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="flex gap-2 mt-8">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm rounded-full border transition-colors ${filter === f.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 hover:bg-slate-50"}`}
            data-testid={`available-jobs-filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="mt-6 border border-slate-200 divide-y divide-slate-200 bg-white" data-testid="available-jobs-list">
        {!loading && shown.length === 0 && (
          <li className="p-10 text-center text-slate-500" data-testid="available-jobs-empty">
            No open jobs in your area right now. Check back soon or widen your service radius in Provider Hub.
          </li>
        )}
        {shown.map((j) => <JobRow key={j.id} job={j} onAccept={accept} busy={busyId === j.id} />)}
      </ul>
    </div>
  );
}
