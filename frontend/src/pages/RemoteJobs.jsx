import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Search, Globe, ExternalLink, MapPin, DollarSign, Building2, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/* Dedicated page for external / aggregator jobs (RemoteOK, Greenhouse,
 * WWR, USAJobs). Kept separate from /map so on-demand + staffing agency
 * feeds stay uncluttered. Only lists jobs that actually publish pay. */
const SOURCE_LABELS = {
  usajobs:    "USA Jobs",
  greenhouse: "Greenhouse",
  remoteok:   "RemoteOK",
  wwr:        "We Work Remotely",
};

export default function RemoteJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [minPay, setMinPay] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (country.trim()) params.country = country.trim();
      if (minPay) params.min_pay = parseFloat(minPay) || 0;
      const { data } = await api.get("/jobs/external", { params });
      setJobs(data?.jobs || []);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const submit = (e) => { e.preventDefault(); load(); };

  const total = jobs.length;
  const bySource = useMemo(() => {
    const m = {};
    for (const j of jobs) m[j.source] = (m[j.source] || 0) + 1;
    return m;
  }, [jobs]);

  return (
    <div className="bg-white min-h-screen" data-testid="remote-jobs-page">
      <Helmet>
        <title>Remote & external jobs on Lumo — paid roles only</title>
        <meta name="description" content="Curated remote & external jobs from top boards — every listing shows real pay. Filter by keyword, country and minimum salary." />
        <link rel="canonical" href="https://golumo.app/remote-jobs" />
      </Helmet>

      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="overline inline-flex items-center gap-2"><Globe className="w-3 h-3" /> External feed</div>
          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tighter mt-2">
            Remote & external jobs.
          </h1>
          <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">
            Curated remote & external roles from top boards. We hide anything without published pay so you never scroll through &quot;$0&quot; noise. Click any job to apply on the source site.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col sm:flex-row gap-2" data-testid="remote-jobs-filters">
            <div className="flex items-stretch border border-slate-900 bg-white flex-1 min-w-0">
              <div className="flex items-center pl-3 text-slate-500"><Search className="w-4 h-4" /></div>
              <input
                type="text" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search title, description, employer"
                className="flex-1 min-w-0 px-3 py-2 focus:outline-none text-sm"
                data-testid="remote-jobs-q"
              />
            </div>
            <Input
              type="text" value={country} onChange={(e) => setCountry(e.target.value)}
              placeholder="Country (e.g. India, US)" className="sm:w-56"
              data-testid="remote-jobs-country"
            />
            <Input
              type="number" min="0" step="1000" value={minPay} onChange={(e) => setMinPay(e.target.value)}
              placeholder="Min pay (annual $)" className="sm:w-44"
              data-testid="remote-jobs-min-pay"
            />
            <button type="submit" className="bg-slate-900 text-white px-5 py-2 font-mono uppercase tracking-wider text-xs" data-testid="remote-jobs-apply-filters">
              Filter
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-mono uppercase tracking-wider text-slate-500">
            {Object.entries(bySource).map(([src, n]) => (
              <div key={src} className="inline-flex items-center gap-1.5" data-testid={`source-count-${src}`}>
                <span className="w-2 h-2 rounded-full bg-teal-700 inline-block" />
                {SOURCE_LABELS[src] || src}: <span className="text-slate-900 font-bold">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading && <div className="text-slate-500 text-sm font-mono py-16 text-center">Loading external listings…</div>}
        {!loading && jobs.length === 0 && (
          <div className="text-slate-500 text-sm py-16 text-center" data-testid="remote-jobs-empty">
            No jobs match your filters yet. Try widening your criteria.
          </div>
        )}
        <div className="space-y-2" data-testid="remote-jobs-list">
          {jobs.map((j) => (
            <ExternalJobCard key={j.id} job={j} />
          ))}
        </div>
        {jobs.length > 0 && (
          <div className="text-xs text-slate-400 mt-6 font-mono uppercase tracking-wider text-center">
            {total} listings shown · pulled from Greenhouse, RemoteOK, We Work Remotely, USA Jobs
          </div>
        )}
      </section>
    </div>
  );
}

function ExternalJobCard({ job }) {
  const pay = job.pay_rate;
  const payDisplay = pay > 0
    ? (pay >= 1000 ? `$${Math.round(pay).toLocaleString()}/${(job.pay_unit || "yr")}` : `$${pay}/${job.pay_unit || "hr"}`)
    : "See listing";
  return (
    <a
      href={job.apply_url}
      target="_blank"
      rel="nofollow noopener noreferrer"
      className="block border border-slate-200 hover:border-slate-900 bg-white p-4 group"
      data-testid={`remote-job-${job.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base leading-tight group-hover:text-teal-700">{job.title}</div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {job.customer_name && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{job.customer_name}</span>}
            {job.location_text && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location_text}</span>}
            <span className="inline-flex items-center gap-1 text-teal-700 font-bold"><DollarSign className="w-3 h-3" />{payDisplay}</span>
            {job.source && <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">via {SOURCE_LABELS[job.source] || job.source}</span>}
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-teal-700 flex-shrink-0" />
      </div>
    </a>
  );
}
