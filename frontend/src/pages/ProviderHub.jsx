import React, { useEffect, useRef, useState } from "react";
import { api, ALL_CATEGORIES, CATEGORY_COLORS, formatApiError, errorCode } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AffiliateBlock from "@/components/AffiliateBlock";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import MapView from "@/components/MapView";
import CategoryBadge from "@/components/CategoryBadge";
import QuoteDialog from "@/components/QuoteDialog";
import DeliveryActions from "@/components/DeliveryActions";
import DeliveryRuns from "@/components/DeliveryRuns";
import AddressInput from "@/components/AddressInput";
import StripeConnectCard from "@/components/StripeConnectCard";
import { checkCredentialMatch } from "@/lib/credentialMatch";
import { KIND_LABEL } from "@/lib/credentialKinds";
import { providerEarningsBreakdown } from "@/lib/deliveryPricing";
import { toast } from "sonner";
import { Wallet, MapPin, Briefcase, Zap } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";

export default function ProviderHub() {
  const { user, updateMe, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pins, setPins] = useState([]);
  const [opps, setOpps] = useState([]);
  const [highlightId, setHighlightId] = useState(null);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
  const seenIdsRef = useRef(new Set());
  const lastPollRef = useRef(new Date().toISOString());
  const [profileBusy, setProfileBusy] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState(null);
  const [myQuotes, setMyQuotes] = useState([]);
  const [walletBalance, setWalletBalance] = useState(Number(user.wallet_balance || 0));
  const [payoutBusy, setPayoutBusy] = useState(false);
  const loadWallet = async () => {
    try {
      const { data } = await api.get("/wallet");
      setWalletBalance(Number(data.balance || 0));
    } catch { /* ignore */ }
  };
  useEffect(() => { loadWallet(); /* eslint-disable-next-line */ }, []);
  const [profile, setProfile] = useState({
    address: user.location?.address || "",
    lat: user.location?.lat || 40.7128,
    lng: user.location?.lng || -74.006,
    radius: user.service_radius_miles || 25,
    categories: user.categories || [],
  });

  const loadPins = async () => {
    const params = new URLSearchParams();
    if (remoteOnly) params.set("remote_only", "true");
    if (groupFilter) params.set("category_group_filter", groupFilter);
    const { data } = await api.get(`/map/jobs?${params.toString()}`);
    setPins(data);
  };

  // If the user arrived with `#payouts` (e.g. via the "Connect bank" toast
  // action or the backend's onboard_hint), scroll the Stripe Connect card
  // into view once the page has painted.
  useEffect(() => {
    const wantsPayouts =
      location.hash === "#payouts" ||
      new URLSearchParams(location.search).get("stripe") === "onboard";
    if (!wantsPayouts) return;
    const t = setTimeout(() => {
      const el = document.querySelector('[data-testid="stripe-connect-card"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => clearTimeout(t);
  }, [location.hash, location.search]);


  const loadOpps = async () => {
    const { data } = await api.get(`/provider/opportunities`);
    setOpps(data);
    // initial baseline = don't toast existing
    data.forEach((o) => seenIdsRef.current.add(o.id));
  };

  const loadMyQuotes = async () => {
    try {
      const { data } = await api.get("/quotes/mine");
      setMyQuotes(data);
    } catch (_) { /* ignore */ }
  };

  const [myCreds, setMyCreds] = useState([]);
  const loadCreds = async () => {
    try {
      const { data } = await api.get("/credentials/mine");
      setMyCreds(data.filter((c) => c.status === "verified"));
    } catch (_) { /* ignore */ }
  };

  // Active jobs + orders the provider is delivering (escrow flow)
  const [myDeliveries, setMyDeliveries] = useState({ jobs: [], orders: [] });
  const loadMyDeliveries = async () => {
    try {
      const [jobsRes, ordersRes] = await Promise.all([
        api.get(`/jobs?provider_id=${encodeURIComponent(user.id)}`),
        api.get("/orders"),
      ]);
      const jobs = (jobsRes.data || []).filter(
        (j) => ["accepted", "assigned", "in_progress", "awaiting_confirmation"].includes(j.status)
      );
      const orders = (ordersRes.data || []).filter(
        (o) => o.provider_id === user.id &&
          ["in_progress", "awaiting_confirmation"].includes(o.status)
      );
      setMyDeliveries({ jobs, orders });
    } catch (_) { /* ignore */ }
  };

  const pollNew = async () => {
    try {
      const since = lastPollRef.current;
      lastPollRef.current = new Date().toISOString();
      const { data } = await api.get(`/provider/opportunities?since=${encodeURIComponent(since)}`);
      const fresh = data.filter((d) => !seenIdsRef.current.has(d.id));
      fresh.forEach((j) => seenIdsRef.current.add(j.id));
      if (fresh.length > 0) {
        // refresh map + opps lists
        loadPins();
        setOpps((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...fresh.filter((f) => !ids.has(f.id)), ...prev];
        });
        fresh.forEach((j) => {
          const miles = j.distance_miles != null ? `${j.distance_miles} mi` : (j.is_remote ? "Remote" : "—");
          toast(j.title, {
            description: `${miles} · $${j.pay_rate.toFixed(2)}/${j.pay_unit}`,
            duration: 8000,
            action: {
              label: "Fly to pin",
              onClick: () => {
                setHighlightId(j.id);
                document.getElementById("provider-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            },
            id: `opp-${j.id}`,
          });
        });
      }
    } catch (e) {
      // silently fail
    }
  };

  useEffect(() => {
    loadOpps();
    loadPins();
    loadMyQuotes();
    loadCreds();
    loadMyDeliveries();
    const t = setInterval(pollNew, 15000);
    const t2 = setInterval(loadMyDeliveries, 20000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, []);  
  useEffect(() => { loadPins(); }, [remoteOnly, groupFilter]);  

  const accept = async (id) => {
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
            onClick: () => {
              // Provider Hub renders <StripeConnectCard/> already — just scroll it into view.
              const el = document.querySelector('[data-testid="stripe-connect-card"]');
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
        });
        return;
      }
      toast.error(formatApiError(e));
    }
  };

  const dismiss = async (id) => {
    // Optimistic: drop the row immediately, then persist server-side so the
    // job stays hidden across refreshes. Customer isn't notified.
    setOpps((prev) => prev.filter((p) => p.id !== id));
    try {
      await api.post(`/provider/dismiss-job/${id}`);
      toast.message("Hidden from your feed");
    } catch (e) {
      toast.error(formatApiError(e));
      loadOpps(); // rollback by re-fetching
    }
  };

  const withdrawQuote = async (qid) => {
    try { await api.delete(`/quotes/${qid}`); toast.success("Quote withdrawn"); loadMyQuotes(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const saveProfile = async (e) => {
    e.preventDefault(); setProfileBusy(true);
    try {
      await updateMe({
        location: { lat: parseFloat(profile.lat), lng: parseFloat(profile.lng), address: profile.address },
        service_radius_miles: parseFloat(profile.radius),
        categories: profile.categories,
      });
      toast.success("Profile updated");
      loadOpps();
    } catch (e) {
      toast.error("Failed to update");
    } finally { setProfileBusy(false); }
  };

  const toggleCat = (v) => setProfile((p) => ({
    ...p,
    categories: p.categories.includes(v) ? p.categories.filter((x) => x !== v) : [...p.categories, v],
  }));

  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Provider Hub</div>
          <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Live opportunities</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              if (walletBalance <= 0) { toast.info("Complete a job to earn a payout"); return; }
              setPayoutBusy(true);
              try {
                await api.post("/wallet/withdraw", { amount: walletBalance, method: "bank_transfer" });
                toast.success(`Instant payout requested — $${walletBalance.toFixed(2)} on the way to your bank`);
                setWalletBalance(0);
                await refresh?.();
              } catch (err) {
                toast.error(formatApiError(err));
              } finally {
                setPayoutBusy(false);
              }
            }}
            disabled={walletBalance <= 0 || payoutBusy}
            className="btn-lumo btn-lumo-primary btn-lumo-sm disabled:opacity-40"
            data-testid="provider-instant-payout"
            title={walletBalance <= 0 ? "Complete a job to earn a payout" : "Cash out today's earnings"}
          >
            <Zap className="w-3.5 h-3.5" /> Instant payout
          </button>
          <Link to="/wallet" className="border border-slate-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-50" data-testid="provider-wallet-link">
            <Wallet className="w-4 h-4 text-teal-700" />
            <span className="overline">Wallet</span>
            <span className="font-display font-bold">${walletBalance.toFixed(2)}</span>
          </Link>
          <Link to="/available-jobs" className="bg-slate-900 text-white px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-800" data-testid="provider-available-jobs-link">
            <span className="overline text-white">Available jobs</span>
          </Link>
          <Link to="/recruiter" className="border border-slate-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-50" data-testid="provider-recruiter-link">
            <span className="overline">Recruit &amp; earn</span>
          </Link>
          <Link to="/credentials" className="border border-slate-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-slate-50" data-testid="provider-credentials-link">
            <span className="overline">Credentials</span>
            <span className="font-display font-bold text-teal-700">↗</span>
          </Link>
        </div>
      </div>

      <DeliveryRuns />

      <div id="provider-map" className="mt-6">
        <MapView
          pins={pins}
          highlightId={highlightId}
          onPinClick={(p) => setHighlightId(p.id)}
          remoteOnly={remoteOnly}
          setRemoteOnly={setRemoteOnly}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          height={400}
        />
      </div>

      <div className="mt-6">
        <StripeConnectCard />
      </div>

      <div className="grid lg:grid-cols-12 gap-8 mt-8">
        <div className="lg:col-span-8">
          {/* Active deliveries / jobs the provider needs to complete */}
          {(myDeliveries.jobs.length + myDeliveries.orders.length > 0) && (
            <div className="mb-6" data-testid="my-deliveries-section">
              <div className="overline">Your active deliveries ({myDeliveries.jobs.length + myDeliveries.orders.length})</div>
              <div className="mt-3 border border-slate-200 divide-y divide-slate-200">
                {myDeliveries.jobs.map((j) => (
                  <div key={`j-${j.id}`} className="p-4" data-testid={`my-delivery-job-${j.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display font-bold truncate">
                          <Link to={`/jobs/${j.id}`} className="hover:underline">{j.title}</Link>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-mono uppercase">
                          {j.category} · {j.tracking_status || j.delivery_status || j.status}
                        </div>
                      </div>
                      <Link
                        to={`/jobs/${j.id}/track`}
                        className="text-[10px] font-mono uppercase tracking-wider border border-teal-700 bg-teal-700 text-white px-2.5 py-1.5 hover:bg-teal-800 whitespace-nowrap"
                        data-testid={`provider-track-${j.id}`}
                      >
                        Open tracker →
                      </Link>
                    </div>
                    <DeliveryActions
                      row={j} kind="job" viewerRole="provider"
                      onUpdated={() => loadMyDeliveries()}
                    />
                  </div>
                ))}
                {myDeliveries.orders.map((o) => (
                  <div key={`o-${o.id}`} className="p-4" data-testid={`my-delivery-order-${o.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display font-bold">Cart order · ${o.item_total.toFixed(2)} + ${o.delivery_fee.toFixed(2)} delivery</div>
                        <div className="text-xs text-slate-500 mt-1 font-mono uppercase">{o.delivery_status || o.status}</div>
                      </div>
                    </div>
                    <DeliveryActions
                      row={o} kind="order" viewerRole="provider"
                      onUpdated={() => loadMyDeliveries()}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overline">Opportunities in your radius ({opps.length})</div>          <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="opportunities-list">
            {opps.length === 0 && <div className="p-6 text-sm text-slate-500">No matches right now. Toast will fire when a new job lands.</div>}
            {opps.map((j) => {
              const licReq = j.details?.license_required;
              const match = (j.category === "medical" || j.category === "legal")
                ? checkCredentialMatch(myCreds, j.category, licReq)
                : null;
              return (
              <div
                key={j.id}
                className={`p-4 grid grid-cols-12 gap-4 items-center cursor-pointer transition-colors ${highlightId === j.id ? "bg-teal-50" : "hover:bg-slate-50"}`}
                onClick={() => setHighlightId(j.id)}
                data-testid={`opportunity-${j.id}`}
              >
                <div className="col-span-2"><CategoryBadge group={j.category_group} isRemote={j.is_remote} /></div>
                <div className="col-span-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display font-bold">{j.title}</div>
                    {match?.matched && (
                      <span className="text-[10px] font-mono uppercase tracking-wider border border-teal-700/40 bg-teal-50 text-teal-800 px-1.5 py-0.5" data-testid={`match-badge-${j.id}`}>
                        ✓ Match · {KIND_LABEL[match.kind] || match.kind}
                      </span>
                    )}
                    {match && !match.matched && (
                      <span className="text-[10px] font-mono uppercase tracking-wider border border-amber-300 bg-amber-50 text-amber-800 px-1.5 py-0.5" data-testid={`needs-cred-${j.id}`}>
                        Needs {licReq?.replace(/_/g, " / ").toUpperCase() || "credential"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-1">{j.description}</div>
                </div>
                <div className="col-span-2 font-mono text-xs">
                  <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {j.distance_miles != null ? `${j.distance_miles} mi` : (j.is_remote ? "Remote" : "—")}</div>
                </div>
                <div className="col-span-2 font-mono text-xs">
                  <div className="font-display text-base font-bold text-slate-900">${j.pay_rate.toFixed(2)}</div>
                  <div className="text-slate-500 uppercase">per {j.pay_unit}</div>
                  {(() => {
                    const gross = (j.pay_rate || 0) * (j.pay_unit !== "flat" ? (j.estimated_units || 1) : 1);
                    const b = providerEarningsBreakdown({ customerCost: gross });
                    return (
                      <div className="text-teal-700 mt-0.5" data-testid={`opp-take-home-${j.id}`}>
                        You keep ${b.net_to_provider.toFixed(2)}
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-1 text-right flex flex-col gap-1.5">
                  {(() => {
                    // Only on-demand jobs are "accept & track" — W-2 / staffing /
                    // remote have no delivery to track, so we surface the
                    // external apply link (or hide the CTA entirely if none).
                    const emp = j.employment_type || "on_demand";
                    if (emp !== "on_demand") {
                      if (j.apply_url) {
                        return (
                          <a
                            href={j.apply_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 uppercase tracking-wider font-mono"
                            data-testid={`apply-external-${j.id}`}
                          >
                            Apply →
                          </a>
                        );
                      }
                      return (
                        <span
                          className="text-[10px] font-mono uppercase tracking-wider text-slate-400"
                          data-testid={`no-accept-${j.id}`}
                        >
                          Contact poster
                        </span>
                      );
                    }
                    return (
                      <>
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); accept(j.id); }} className="bg-teal-700 hover:bg-teal-800 h-8 px-3 text-xs font-semibold" data-testid={`accept-job-${j.id}`}>
                          Accept job
                        </Button>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setQuoteTarget(j); }} className="h-8 px-3 text-xs" data-testid={`quote-job-${j.id}`}>
                          Send quote
                        </Button>
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); dismiss(j.id); }}
                    className="text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-red-600 hover:underline mt-0.5"
                    data-testid={`dismiss-job-${j.id}`}
                  >
                    Not interested
                  </button>
                </div>
              </div>
            );})}
          </div>
        </div>

        <form onSubmit={saveProfile} className="lg:col-span-4 border border-slate-200 p-6 space-y-4 h-fit" data-testid="provider-profile-form">
          <div className="overline flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" /> Match settings</div>
          <div>
            <Label className="overline">Your base location</Label>
            <div className="mt-1">
              <AddressInput
                value={profile.address}
                onChange={(v) => setProfile((p) => ({ ...p, address: v }))}
                onPlace={(p) => setProfile((prev) => ({ ...prev, address: p.address, lat: p.lat ?? prev.lat, lng: p.lng ?? prev.lng }))}
                placeholder="City, address…"
                data-testid="provider-address"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="overline">Lat</Label>
              <Input type="number" step="0.0001" value={profile.lat} onChange={(e) => setProfile((p) => ({ ...p, lat: e.target.value }))} data-testid="provider-lat" className="mt-1" />
            </div>
            <div>
              <Label className="overline">Lng</Label>
              <Input type="number" step="0.0001" value={profile.lng} onChange={(e) => setProfile((p) => ({ ...p, lng: e.target.value }))} data-testid="provider-lng" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="overline">Service radius (miles)</Label>
            <Input type="number" value={profile.radius} onChange={(e) => setProfile((p) => ({ ...p, radius: e.target.value }))} data-testid="provider-radius" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Categories you serve</Label>
            <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
              {ALL_CATEGORIES.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`provider-cat-${c.value}`}>
                  <Checkbox checked={profile.categories.includes(c.value)} onCheckedChange={() => toggleCat(c.value)} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLORS[c.group].hex }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={profileBusy} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="provider-profile-save">
            {profileBusy ? "Saving…" : "Save match settings"}
          </Button>
        </form>
      </div>

      {/* My quotes */}
      <div className="mt-12">
        <div className="overline">My quotes ({myQuotes.length})</div>
        <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="my-quotes-list">
          {myQuotes.length === 0 && <div className="p-6 text-sm text-slate-500">You have not sent any quotes yet.</div>}
          {myQuotes.map((q) => (
            <div key={q.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`my-quote-${q.id}`}>
              <div className="col-span-5">
                <div className="font-display font-bold truncate">{q.job_title || "Job"}</div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{q.notes || "—"}</div>
              </div>
              <div className="col-span-3 font-mono text-xs">
                <div>Asking: ${q.asking_pay_rate?.toFixed(2)} / {q.asking_pay_unit}</div>
                <div className="text-teal-700 font-bold">You: ${q.quoted_pay_rate?.toFixed(2)} / {q.quoted_pay_unit}</div>
              </div>
              <div className="col-span-2 text-xs font-mono uppercase tracking-widest">
                <span className={q.status === "accepted" ? "text-teal-700" : q.status === "declined" ? "text-red-600" : "text-slate-500"}>
                  {q.status}
                </span>
              </div>
              <div className="col-span-2 text-right">
                {q.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => withdrawQuote(q.id)} className="h-7 px-2 text-xs" data-testid={`withdraw-quote-${q.id}`}>Withdraw</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <QuoteDialog
        open={!!quoteTarget}
        onOpenChange={(o) => !o && setQuoteTarget(null)}
        job={quoteTarget}
        onSubmitted={() => { loadMyQuotes(); }}
      />
      <div className="mt-10 -mx-4 sm:-mx-6">
        <AffiliateBlock category="provider" title="Get paid earlier — partner banks & tools" subtitle="Earn referral bonuses while getting better banking, tax, and gig-worker perks." />
      </div>
    </div>
  );
}
