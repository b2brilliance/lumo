import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import CategoryBadge from "@/components/CategoryBadge";
import { toast } from "sonner";

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  const load = () => api.get(`/jobs/${id}`).then(({ data }) => setJob(data));
  useEffect(() => { load(); }, [id]);

  if (!job) return <div className="p-10 text-slate-500">Loading…</div>;
  const img = job.media_url ? (job.media_url.startsWith("http") ? job.media_url : `${BACKEND_URL}${job.media_url}`) : null;
  const isProvider = user && user !== false && user.role === "provider";

  const accept = async () => {
    try { await api.post(`/jobs/${id}/accept`); toast.success("Job accepted"); load(); }
    catch { toast.error("Failed to accept"); }
  };

  return (
    <div className="max-w-screen-md mx-auto px-6 py-10">
      <Link to="/map" className="overline text-teal-700 hover:underline">← Back to map</Link>
      <div className="mt-4 flex items-center gap-3">
        <CategoryBadge group={job.category_group} isRemote={job.is_remote} size="md" />
        <div className="font-mono text-xs uppercase tracking-widest text-slate-500">{job.status}</div>
      </div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-3">{job.title}</h1>
      <div className="font-mono text-sm mt-3">
        <span className="font-display text-3xl font-black">${job.pay_rate.toFixed(2)}</span>
        <span className="text-slate-500"> / {job.pay_unit}</span>
        {job.pay_unit !== "flat" && <span className="text-slate-500"> · est. {job.estimated_units} {job.pay_unit}s</span>}
      </div>
      <p className="text-slate-700 mt-6 whitespace-pre-line">{job.description}</p>

      {img && (
        <div className="mt-6 border border-slate-200">
          {job.media_type?.startsWith("video")
            ? <video src={img} controls className="w-full" />
            : <img src={img} alt="" className="w-full" />}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-6 text-sm font-mono">
        {job.pickup_location && <div><div className="overline">Pickup</div>{job.pickup_location.address}</div>}
        {job.dropoff_location && <div><div className="overline">Dropoff</div>{job.dropoff_location.address}</div>}
        {job.is_remote && <div><div className="overline">Location</div>Remote</div>}
      </div>

      {job.allowed_payment_methods?.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="overline">Payment terms</div>
          <div className="text-sm mt-1 font-mono">{job.allowed_payment_methods.join(" · ").toUpperCase()}</div>
          {job.payment_terms && <p className="text-sm text-slate-600 mt-2">{job.payment_terms}</p>}
        </div>
      )}

      {isProvider && job.status === "open" && (
        <Button onClick={accept} className="mt-8 bg-teal-700 hover:bg-teal-800" data-testid="job-detail-accept">Accept this job</Button>
      )}
    </div>
  );
}
