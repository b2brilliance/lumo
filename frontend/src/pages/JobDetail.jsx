import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, locationModeFor, formatApiError, errorCode } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import CategoryBadge from "@/components/CategoryBadge";
import ChatPanel from "@/components/ChatPanel";
import QuoteDialog from "@/components/QuoteDialog";
import TrustBadges from "@/components/TrustBadges";
import { ServiceDetailsView } from "@/components/ServiceDetailsForm";
import ReviewsSection from "@/components/ReviewsSection";
import DeliveryActions from "@/components/DeliveryActions";
import { providerEarningsBreakdown, LUMO_COMMISSION_RATE } from "@/lib/deliveryPricing";
import { toast } from "sonner";

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  const load = () => api.get(`/jobs/${id}`).then(({ data }) => setJob(data));
  const loadQuotes = () => api.get(`/jobs/${id}/quotes`).then(({ data }) => setQuotes(data)).catch(() => {});
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!user || user === false || !job) return;
    if (job.customer_id === user.id || (user.role === "provider")) {
      loadQuotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, user?.id]);

  // For the customer on an open job, list provider threads
  useEffect(() => {
    if (!job || !user || user === false) return;
    if (job.customer_id === user.id && !job.provider_id) {
      api.get(`/jobs/${id}/threads`).then(({ data }) => {
        setThreads(data);
        if (data.length > 0 && !selectedThread) setSelectedThread(data[0].provider_id);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, user, id]);

  if (!job) return <div className="p-10 text-slate-500">Loading…</div>;
  const img = job.media_url ? (job.media_url.startsWith("http") ? job.media_url : `${BACKEND_URL}${job.media_url}`) : null;
  // Loosened role check: any signed-in user (other than the customer who
  // posted the job) can accept it. Backend enforces credential gates for
  // regulated categories so we don't have to gate the UI.
  const isCustomer = user && user !== false && job.customer_id === user.id;
  const isProvider = user && user !== false && !isCustomer;
  const isParticipant = user && user !== false && (user.id === job.customer_id || user.id === job.provider_id);
  const canChat = user && user !== false && (isParticipant || (isProvider && job.status === "open"));

  // Customer viewing open-job threads — which thread provider to show
  const isCustomerBrowsingThreads = user && user !== false && user.id === job.customer_id && !job.provider_id;

  const accept = async () => {
    try {
      await api.post(`/jobs/${id}/accept`);
      toast.success("Job accepted — opening live tracker");
      navigate(`/jobs/${id}/track`);
    } catch (e) {
      if (errorCode(e) === "stripe_onboarding_required") {
        toast.error(formatApiError(e), {
          duration: 10000,
          action: {
            label: "Connect bank",
            onClick: () => navigate("/provider#payouts"),
          },
        });
        return;
      }
      toast.error(formatApiError(e));
    }
  };

  const acceptQuote = async (qid) => {
    try {
      await api.post(`/quotes/${qid}/accept`);
      toast.success("Quote accepted — opening live tracker");
      navigate(`/jobs/${id}/track`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const declineQuote = async (qid) => {
    try { await api.post(`/quotes/${qid}/decline`); toast.success("Quote declined"); loadQuotes(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const myProviderQuote = isProvider ? quotes.find((q) => q.provider_id === user.id) : null;

  // Option B — customer pays a 10% deposit AFTER a provider has accepted.
  // Locks in the booking. Shown ONLY to the customer on their own job in
  // "accepted" status with no deposit paid yet.
  const showDepositCta = isCustomer && job.status === "accepted" && !job.deposit_paid;
  const startDeposit = async () => {
    try {
      const { data } = await api.post(`/jobs/${id}/deposit`, {
        origin_url: window.location.origin,
        country: (typeof window !== "undefined" && localStorage.getItem("lumo_country_override")) || undefined,
      });
      if (data.url) window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-10 grid lg:grid-cols-12 gap-10">
      <div className="lg:col-span-7">
        <Link to="/map" className="overline text-teal-700 hover:underline">← Back to map</Link>
        <div className="mt-4 flex items-center gap-3">
          <CategoryBadge group={job.category_group} isRemote={job.is_remote} size="md" />
          <div className="font-mono text-xs uppercase tracking-widest text-slate-500">{job.status}</div>
        </div>
        <h1 className="font-display text-4xl font-black tracking-tighter mt-3">{job.title}</h1>
        {showDepositCta && (
          <div
            className="mt-5 border-2 border-amber-500 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            data-testid="job-deposit-banner"
          >
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg font-black tracking-tight text-slate-900">
                {job.provider_name || "A provider"} accepted your request.
              </div>
              <div className="text-sm text-slate-700 mt-1 leading-snug">
                Confirm the booking by paying a small deposit (10% of estimated total). The remaining balance is charged when the job is marked complete. You&apos;re covered by Lumo escrow.
              </div>
            </div>
            <Button
              onClick={startDeposit}
              className="bg-amber-600 hover:bg-amber-700 text-white font-mono uppercase tracking-wider text-sm px-5 py-3 whitespace-nowrap"
              data-testid="pay-deposit-btn"
            >
              Pay deposit
            </Button>
          </div>
        )}
        {job.status === "confirmed" && isCustomer && (
          <div
            className="mt-5 border-2 border-emerald-500 bg-emerald-50 p-4 flex items-start gap-3"
            data-testid="job-confirmed-banner"
          >
            <div className="text-2xl leading-none">✓</div>
            <div className="text-sm">
              <div className="font-display text-base font-black text-emerald-900">Booking confirmed.</div>
              <div className="text-slate-700 mt-0.5">Deposit received. {job.provider_name || "Your provider"} is on it — you&apos;ll be notified when the work is complete.</div>
            </div>
          </div>
        )}
        {job.provider_id && (
          <div className="mt-3 flex items-center gap-2 flex-wrap" data-testid="job-assigned-provider">
            <span className="overline text-slate-500">Assigned to</span>
            <span className="font-mono text-sm">{job.provider_name}</span>
            <TrustBadges userId={job.provider_id} />
            {job.credential_match && (
              <span className="text-[10px] font-mono uppercase tracking-wider border border-teal-700/40 bg-teal-50 text-teal-800 px-1.5 py-0.5" data-testid="credential-match-indicator">
                ✓ Match: {job.credential_match.matched_kind.toUpperCase()}
              </span>
            )}
            {isParticipant && job.status !== "completed" && (
              <Link
                to={`/jobs/${id}/track`}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 border border-teal-700 bg-teal-700 text-white text-xs font-mono uppercase tracking-wider hover:bg-teal-800"
                data-testid="job-detail-track-link"
              >
                Track live →
              </Link>
            )}
          </div>
        )}
        <div className="font-mono text-sm mt-3">
          <span className="font-display text-3xl font-black">${job.pay_rate.toFixed(2)}</span>
          <span className="text-slate-500"> / {job.pay_unit}</span>
          {job.pay_unit !== "flat" && <span className="text-slate-500"> · est. {job.estimated_units} {job.pay_unit}s</span>}
        </div>
        <p className="text-slate-700 mt-6 whitespace-pre-line">{job.description}</p>

        {/* Provider-facing earnings breakdown — never shown to the customer */}
        {isProvider && (() => {
          const gross = (job.pay_rate || 0) * (job.pay_unit !== "flat" ? (job.estimated_units || 1) : 1);
          const b = providerEarningsBreakdown({ customerCost: gross });
          return (
            <div className="mt-5 border border-slate-300 p-4 bg-slate-50" data-testid="provider-earnings-breakdown">
              <div className="overline text-slate-700">Your earnings if you take this job</div>
              <div className="font-mono text-sm mt-3 space-y-1">
                <div className="flex justify-between"><span>Customer pays</span><span data-testid="earnings-customer-pays">${b.customer_pays.toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Lumo platform fee ({(LUMO_COMMISSION_RATE * 100).toFixed(0)}%)</span><span data-testid="earnings-commission">−${b.lumo_commission.toFixed(2)}</span></div>
                <div className="flex justify-between font-display text-lg font-black border-t border-slate-300 pt-2 mt-2 text-slate-900">
                  <span>Your take-home</span><span data-testid="earnings-net">${b.net_to_provider.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-3 leading-snug">
                Sales tax (if any) is paid by the customer at checkout — it doesn&apos;t reduce your earnings.
                {job.pay_unit !== "flat" && ` Estimate based on ${job.estimated_units} ${job.pay_unit}${job.estimated_units !== 1 ? "s" : ""}; actual depends on the hours you log.`}
              </p>
            </div>
          );
        })()}

        {img && (
          <div className="mt-6 border border-slate-200">
            {job.media_type?.startsWith("video")
              ? <video src={img} controls className="w-full" />
              : <img src={img} alt="" className="w-full" />}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mt-6 text-sm font-mono">
          {(() => {
            const mode = locationModeFor(job.category);
            if (mode === "pickup_dropoff") {
              return (
                <>
                  {job.pickup_location && <div><div className="overline">Pickup</div>{job.pickup_location.address}</div>}
                  {job.dropoff_location && <div><div className="overline">Dropoff</div>{job.dropoff_location.address}</div>}
                </>
              );
            }
            if (mode === "onsite") {
              return job.pickup_location ? <div className="col-span-2"><div className="overline">Service location</div>{job.pickup_location.address}</div> : null;
            }
            return <div><div className="overline">Location</div>Remote</div>;
          })()}
        </div>

        {job.details && Object.keys(job.details).length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="overline mb-3">Service details</div>
            <ServiceDetailsView category={job.category} details={job.details} />
          </div>
        )}

        {job.allowed_payment_methods?.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="overline">Payment terms</div>
            <div className="text-sm mt-1 font-mono">{job.allowed_payment_methods.join(" · ").toUpperCase()}</div>
            {job.payment_terms && <p className="text-sm text-slate-600 mt-2">{job.payment_terms}</p>}
          </div>
        )}

        {isProvider && job.status === "open" && (
          <div className="flex gap-3 mt-8 flex-wrap" data-testid="provider-actions">
            {(() => {
              // Only on-demand jobs are accept-and-track. W-2 / staffing /
              // remote → surface external apply URL (or note if none).
              const emp = job.employment_type || "on_demand";
              if (emp !== "on_demand") {
                if (job.apply_url) {
                  return (
                    <a
                      href={job.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 text-white text-sm font-mono uppercase tracking-wider hover:bg-teal-800"
                      data-testid="job-detail-apply-external"
                    >
                      Apply externally →
                    </a>
                  );
                }
                return (
                  <div className="text-sm text-slate-500" data-testid="job-detail-no-accept">
                    This posting has no in-app tracking. Contact the poster directly.
                  </div>
                );
              }
              return (
                <>
                  <Button onClick={accept} className="bg-teal-700 hover:bg-teal-800" data-testid="job-detail-accept">Accept at asking rate</Button>
                  <Button onClick={() => setQuoteOpen(true)} variant="outline" data-testid="job-detail-quote">
                    {myProviderQuote ? "Update your quote" : "Send a counter-quote"}
                  </Button>
                </>
              );
            })()}
          </div>
        )}

        {/* Escrow + proof-of-delivery flow */}
        {(isProvider || isCustomer) && (
          <DeliveryActions
            row={job}
            kind="job"
            viewerRole={isProvider ? "provider" : "customer"}
            onUpdated={(updated) => setJob({ ...job, ...updated })}
          />
        )}
        {isProvider && myProviderQuote && (
          <div className="mt-4 border border-slate-200 p-4 text-sm" data-testid="my-quote-status">
            <div className="overline">Your quote</div>
            <div className="font-mono mt-1">
              ${myProviderQuote.quoted_pay_rate.toFixed(2)} / {myProviderQuote.quoted_pay_unit} · status: <span className={myProviderQuote.status === "accepted" ? "text-teal-700" : myProviderQuote.status === "declined" ? "text-red-600" : "text-slate-700"}>{myProviderQuote.status}</span>
            </div>
          </div>
        )}

        {isCustomer && job.status === "open" && quotes.length > 0 && (
          <div className="mt-8" data-testid="customer-quotes-section">
            <div className="overline">Provider quotes ({quotes.length})</div>
            <div className="mt-3 border border-slate-200 divide-y divide-slate-200">
              {quotes.map((q) => (
                <div key={q.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`quote-${q.id}`}>
                  <div className="col-span-4">
                    <div className="font-display font-bold">{q.provider_name}</div>
                    <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{q.notes || "No notes"}</div>
                  </div>
                  <div className="col-span-4 font-mono text-sm">
                    <div className="font-display text-lg font-black">${q.quoted_pay_rate.toFixed(2)}</div>
                    <div className="text-slate-500 text-xs uppercase">per {q.quoted_pay_unit}{q.quoted_pay_unit !== "flat" && ` · est. ${q.quoted_estimated_units} ${q.quoted_pay_unit}s`}</div>
                  </div>
                  <div className="col-span-1 text-xs font-mono uppercase tracking-widest">{q.status}</div>
                  <div className="col-span-3 text-right flex gap-2 justify-end">
                    {q.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => declineQuote(q.id)} className="h-7 px-2 text-xs" data-testid={`decline-quote-${q.id}`}>Decline</Button>
                        <Button size="sm" onClick={() => acceptQuote(q.id)} className="bg-teal-700 hover:bg-teal-800 h-7 px-2 text-xs" data-testid={`accept-quote-${q.id}`}>Accept</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="lg:col-span-5">
        {!user || user === false ? (
          <div className="border border-slate-200 p-6 text-sm text-slate-500">
            <Link to="/login" className="text-teal-700 underline">Sign in</Link> to chat about this job.
          </div>
        ) : canChat ? (
          <>
            {isCustomerBrowsingThreads && threads.length > 0 && (
              <div className="mb-3 flex items-center gap-2 overflow-x-auto" data-testid="job-threads-tabs">
                {threads.map((t) => (
                  <button
                    key={t.provider_id}
                    onClick={() => setSelectedThread(t.provider_id)}
                    className={`px-3 py-1.5 border text-xs font-mono uppercase tracking-wider whitespace-nowrap ${selectedThread === t.provider_id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"}`}
                    data-testid={`thread-tab-${t.provider_id}`}
                  >
                    Provider · {String(t.provider_id).slice(0, 6)}
                  </button>
                ))}
              </div>
            )}
            <ChatPanel
              jobId={id}
              threadProviderId={isCustomerBrowsingThreads ? selectedThread : null}
            />
          </>
        ) : (
          <div className="border border-slate-200 p-6 text-sm text-slate-500">
            Chat opens once a provider engages with this job.
          </div>
        )}
      </aside>
      <QuoteDialog open={quoteOpen} onOpenChange={setQuoteOpen} job={job} onSubmitted={() => loadQuotes()} />
      {job.provider_id && job.status === "completed" && (
        <div className="md:col-span-12 mt-12">
          <ReviewsSection targetType="provider" targetId={job.provider_id} />
        </div>
      )}
    </div>
  );
}
