import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExternalLink, Plus, Save, Trash2, RefreshCw, KeyRound, BarChart3 } from "lucide-react";

/* AffiliatesTab — admin UI for affiliate offers + tracking-ID settings +
 * click analytics. Mounted inside <AdminConsole/>.                       */
export default function AffiliatesTab() {
  const [tab, setTab] = useState("offers");
  return (
    <div className="space-y-6" data-testid="admin-affiliates-tab">
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { k: "offers",    label: "Offers" },
          { k: "settings",  label: "Tracking IDs" },
          { k: "analytics", label: "Clicks" },
          { k: "guide",     label: "Signup guide" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t.k ? "border-teal-700 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            data-testid={`affiliates-subtab-${t.k}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "offers"    && <OffersList />}
      {tab === "settings"  && <SettingsForm />}
      {tab === "analytics" && <ClicksAnalytics />}
      {tab === "guide"     && <SignupGuide />}
    </div>
  );
}

function OffersList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/affiliates/offers");
      setRows(data.offers || []);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const reseed = async () => {
    try {
      const { data } = await api.post("/admin/affiliates/reseed");
      toast.success(`Added ${data.inserted} new defaults (total ${data.total_defaults} available)`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleActive = async (slug, active) => {
    try {
      await api.patch(`/admin/affiliates/offers/${slug}`, { active });
      setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, active } : r)));
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const removeOffer = async (slug) => {
    if (!confirm(`Delete offer ${slug}?`)) return;
    try {
      await api.delete(`/admin/affiliates/offers/${slug}`);
      setRows((rs) => rs.filter((r) => r.slug !== slug));
      toast.success("Removed");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (loading) return <div className="text-slate-500 font-mono text-sm py-12">Loading offers…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-xl font-black tracking-tighter flex-1">{rows.length} affiliate offers</h3>
        <Button variant="outline" size="sm" onClick={reseed} data-testid="affiliates-reseed-btn">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-seed defaults
        </Button>
        <Button size="sm" onClick={() => setShowNew(true)} data-testid="affiliates-new-btn">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add offer
        </Button>
      </div>
      {showNew && <OfferForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      <div className="border border-slate-200 divide-y divide-slate-100">
        {rows.map((o) => (
          <div key={o.slug} className="p-3 flex items-center gap-3" data-testid={`offer-row-${o.slug}`}>
            {o.logo && <img src={o.logo} alt="" className="w-8 h-8 object-contain" />}
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm">{o.name}</div>
              <div className="text-xs text-slate-500 font-mono truncate">{o.network} · {o.category} · {Array.isArray(o.country) ? o.country.join(",") : ""} · {o.payout}</div>
            </div>
            {o.needs_setup && <span className="text-[10px] font-mono uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5">Setup needed</span>}
            <label className="text-xs font-mono inline-flex items-center gap-1">
              <input type="checkbox" checked={!!o.active} onChange={(e) => toggleActive(o.slug, e.target.checked)} />
              Active
            </label>
            {o.signup_url && (
              <a href={o.signup_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline text-xs inline-flex items-center gap-1" data-testid={`affiliates-signup-${o.slug}`}>
                Sign up <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button onClick={() => setEditing(o)} className="text-xs text-slate-600 hover:text-slate-900 font-mono">Edit</button>
            <button onClick={() => removeOffer(o.slug)} className="text-red-600 hover:text-red-800" data-testid={`offer-delete-${o.slug}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      {editing && <OfferForm existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function OfferForm({ existing, onClose, onSaved }) {
  const [name, setName] = useState(existing?.name || "");
  const [network, setNetwork] = useState(existing?.network || "");
  const [category, setCategory] = useState(existing?.category || "marketplace");
  const [country, setCountry] = useState((existing?.country || ["*"]).join(","));
  const [blurb, setBlurb] = useState(existing?.blurb || "");
  const [payout, setPayout] = useState(existing?.payout || "");
  const [logo, setLogo] = useState(existing?.logo || "");
  const [url_template, setUrl] = useState(existing?.url_template || "");
  const [signup_url, setSignup] = useState(existing?.signup_url || "");
  const [priority, setPriority] = useState(existing?.priority ?? 5);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name, network, category,
        country: country.split(",").map((s) => s.trim()).filter(Boolean),
        blurb, payout, logo, url_template, signup_url,
        priority: Number(priority) || 0, active: true,
      };
      if (existing) await api.patch(`/admin/affiliates/offers/${existing.slug}`, payload);
      else          await api.post("/admin/affiliates/offers", payload);
      toast.success(existing ? "Updated" : "Created");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-2 border-teal-700 p-4 bg-teal-50/40 space-y-3" data-testid="offer-form">
      <div className="font-display font-bold text-sm">{existing ? `Edit ${existing.slug}` : "Add new offer"}</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="offer-form-name" /></div>
        <div><Label>Network</Label><Input value={network} onChange={(e) => setNetwork(e.target.value)} data-testid="offer-form-network" /></div>
        <div>
          <Label>Category</Label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-slate-300 px-2 py-1.5 text-sm" data-testid="offer-form-category">
            {["autos", "real-estate", "rentals", "marketplace", "stores", "restaurants", "provider", "wallet", "customer", "city", "global"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div><Label>Countries (comma, * = all)</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Blurb</Label><Textarea rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} /></div>
        <div><Label>Payout</Label><Input value={payout} onChange={(e) => setPayout(e.target.value)} /></div>
        <div><Label>Logo URL</Label><Input value={logo} onChange={(e) => setLogo(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>URL template — use {"{your_key}"}</Label><Input value={url_template} onChange={(e) => setUrl(e.target.value)} data-testid="offer-form-url" /></div>
        <div className="sm:col-span-2"><Label>Signup URL (where you create your account)</Label><Input value={signup_url} onChange={(e) => setSignup(e.target.value)} /></div>
        <div><Label>Priority (higher = first)</Label><Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={busy} data-testid="offer-form-save">
          <Save className="w-3.5 h-3.5 mr-1" /> Save offer
        </Button>
      </div>
    </div>
  );
}

function SettingsForm() {
  const [keys, setKeys] = useState({});
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  // Collect every placeholder used across all offers, so the form
  // automatically lists the IDs the admin still needs to provide.
  const [placeholders, setPlaceholders] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: o }] = await Promise.all([
          api.get("/admin/affiliates/settings"),
          api.get("/admin/affiliates/offers"),
        ]);
        setKeys(s.keys || {});
        // Discover all unique placeholders the offers reference.
        const all = new Set();
        (o.offers || []).forEach((off) => {
          const matches = (off.url_template || "").match(/\{([a-zA-Z0-9_]+)\}/g) || [];
          matches.forEach((m) => all.add(m.replace(/[{}]/g, "")));
        });
        all.delete("city_slug");
        setPlaceholders([...all].sort());
        setDraft(JSON.stringify(s.keys || {}, null, 2));
      } catch {
        toast.error("Could not load settings");
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    try {
      await api.post("/admin/affiliates/settings", { keys });
      toast.success("Tracking IDs saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (loading) return <div className="text-slate-500 font-mono text-sm py-12">Loading…</div>;

  return (
    <div className="space-y-4" data-testid="affiliates-settings">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-teal-700" />
        <h3 className="font-display text-xl font-black tracking-tighter flex-1">Tracking IDs ({placeholders.length} placeholders)</h3>
        <Button size="sm" onClick={save} data-testid="affiliates-settings-save"><Save className="w-3.5 h-3.5 mr-1" />Save</Button>
      </div>
      <p className="text-xs text-slate-500">
        Paste each affiliate-network ID exactly as the network shows it. Empty fields are fine — the link will still work, just without your tracking attached. See the &quot;Signup guide&quot; tab for where to get each one.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {placeholders.map((p) => (
          <div key={p}>
            <Label>{p}</Label>
            <Input
              value={keys[p] || ""}
              onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
              placeholder={`Your ${p}`}
              data-testid={`affiliates-key-${p}`}
            />
          </div>
        ))}
      </div>
      <details className="text-xs">
        <summary className="text-slate-400 font-mono uppercase tracking-wider cursor-pointer">Raw JSON</summary>
        <Textarea rows={6} value={draft} onChange={(e) => { setDraft(e.target.value); try { setKeys(JSON.parse(e.target.value)); } catch { /* still typing */ } }} className="font-mono text-xs" />
      </details>
    </div>
  );
}

function ClicksAnalytics() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/affiliates/analytics");
        setRows(data.per_offer || []);
        setTotal(data.total_clicks || 0);
      } catch { /* */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="text-slate-500 font-mono text-sm py-12">Loading…</div>;

  return (
    <div className="space-y-3" data-testid="affiliates-analytics">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-teal-700" />
        <h3 className="font-display text-xl font-black tracking-tighter flex-1">{total} total clicks</h3>
      </div>
      <div className="border border-slate-200 divide-y divide-slate-100">
        {rows.length === 0 && <div className="p-4 text-sm text-slate-500 font-mono">No clicks yet. Once visitors click sponsored links they appear here.</div>}
        {rows.map((r) => (
          <div key={r._id} className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 font-display font-bold">{r._id}</div>
            <div className="font-mono text-xs text-slate-500">last: {r.last ? new Date(r.last).toLocaleDateString() : "—"}</div>
            <div className="font-mono font-bold text-teal-700 w-16 text-right">{r.clicks}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignupGuide() {
  const networks = [
    { name: "Amazon Associates",    url: "https://affiliate-program.amazon.com/",                     keys: ["amazon_tag"], note: "Add your site (golumo.app). Approval after first sale. Tag looks like 'yourname-20'." },
    { name: "Skimlinks",            url: "https://skimlinks.com/publishers/",                        keys: ["skimlinks_publisher_id"], note: "Single signup → 60,000+ merchants auto-monetized. Highest leverage. Approve in ~24h." },
    { name: "Rakuten Advertising",  url: "https://rakutenadvertising.com/affiliate-publishers/",     keys: ["rakuten_ref"], note: "Apply to merchant programs individually after approval. ~3–7 days." },
    { name: "Impact (impact.com)",  url: "https://impact.com/partnerships/affiliate-marketing/",     keys: ["impact_publisher_id", "impact_click_id"], note: "Network used by Walmart, Target, Best Buy, Lemonade, Stride, Better, HomeLight, Carvana." },
    { name: "CJ Affiliate",         url: "https://signup.cj.com/member/signup/publisher/",           keys: ["cj_pid", "cj_aid"], note: "Used by Wayfair, GrubHub, Hippo, Credit Karma, Namecheap. Approval ~5 days." },
    { name: "FlexOffers",           url: "https://publisher.flexoffers.com/signup/?Refid=lumo",      keys: ["flexoffers_id"], note: "Capital One Auto, Discover, Rocket Mortgage. Fast approval." },
    { name: "Awin",                 url: "https://www.awin.com/us/publishers",                       keys: ["awin_id"], note: "Etsy, Amex (some regions), many UK / EU brands. $5 deposit refunded after first earn." },
    { name: "eBay Partner Network", url: "https://partnernetwork.ebay.com/",                         keys: ["ebay_campid"], note: "Direct signup. Up to 6% per item, paid monthly." },
    { name: "Booking.com Partner",  url: "https://www.booking.com/affiliate-program/v2/index.html",  keys: ["booking_aid"], note: "Earn up to 4% per completed stay. AID number in your dashboard." },
    { name: "Expedia Group",        url: "https://www.expediagroup.com/affiliate-program",           keys: ["expedia_siteid", "expedia_camref"], note: "Covers Expedia, Hotels.com, Vrbo. Site ID + camref." },
    { name: "Viator Affiliates",    url: "https://www.partner.viator.com/en/affiliate-network/",     keys: ["viator_pid"], note: "8% on every tour. Strong for city hubs." },
    { name: "GetYourGuide",         url: "https://partner.getyourguide.com/",                        keys: ["gyg_pid"], note: "8% on attraction bookings." },
    { name: "Skyscanner",           url: "https://www.partners.skyscanner.net/affiliates",           keys: ["skyscanner_aid"], note: "Pays per click-out to airline. Best for travel pages." },
    { name: "Kayak Affiliate",      url: "https://www.kayak.com/about/affiliates",                   keys: ["kayak_aid"], note: "Click + booking commission. Apply with Kayak directly." },
    { name: "Agoda Partners",       url: "https://partners.agoda.com/",                              keys: ["agoda_cid"], note: "Best for Asia travel hubs (Tokyo, Singapore, Bangkok)." },
    { name: "Carvana (Impact)",     url: "https://app.impact.com/campaign-mediapartner-signup/Carvana.brand",       keys: ["impact_click_id", "impact_publisher_id"], note: "Apply via Impact. CarMax, Best Buy and Walmart use the same Impact infra." },
    { name: "Turo Host Referral",   url: "https://turo.com/us/en/become-a-host",                     keys: ["turo_ref"], note: "$25 per host signup. Grab your unique link from your host dashboard." },
    { name: "Chime Refer-a-Friend", url: "https://www.chime.com/refer-a-friend/",                    keys: ["chime_ref"], note: "Sign up for Chime first → grab personal referral code → $100 per direct-deposit signup." },
    { name: "EarnIn",               url: "https://www.earnin.com/",                                  keys: ["earnin_ref"], note: "Open account → refer-a-friend → link code goes into earnin_ref." },
    { name: "SoFi Money",           url: "https://www.sofi.com/refer/money/",                        keys: ["sofi_ref"], note: "$75–$300 per referral. Code from your SoFi account." },
    { name: "Robinhood Free Stock", url: "https://robinhood.com/referral",                           keys: ["robinhood_ref"], note: "Both you + invitee get a free stock. Code from Robinhood app." },
    { name: "Coinbase Affiliate",   url: "https://www.coinbase.com/affiliates",                      keys: ["coinbase_ref"], note: "50% of trading fees from each referral for 3 months." },
    { name: "Wise (TransferWise)",  url: "https://wise.com/invite",                                  keys: ["wise_ref"], note: "Free £50/3 referrals. Code from Wise dashboard." },
    { name: "DoorDash Dasher Refer", url: "https://dasher.doordash.com/en-us/refer",                 keys: ["doordash_ref"], note: "Become a Dasher first → unique referral link → up to $300 per referral." },
    { name: "Uber Drive Refer",     url: "https://www.uber.com/us/en/drive/",                        keys: ["uber_ref"], note: "Uber/Uber Eats unified referral. Code is in your driver dashboard." },
    { name: "Instacart Shopper",    url: "https://shoppers.instacart.com/",                          keys: ["instacart_ref"], note: "Refer new shoppers → $50–$200 bonus." },
    { name: "Shopify Partners",     url: "https://www.shopify.com/partners",                         keys: ["shopify_ref"], note: "$150 per merchant referral. Apply for partner account." },
    { name: "Square Referrals",     url: "https://squareup.com/us/en/referrals",                     keys: ["square_ref"], note: "$100 per business referred." },
    { name: "Fiverr Affiliates",    url: "https://affiliates.fiverr.com/",                           keys: ["fiverr_oid"], note: "Up to $150 per first-time buyer." },
    { name: "Namecheap Affiliates", url: "https://www.namecheap.com/affiliates/",                    keys: ["namecheap_affid"], note: "Up to 35% on hosting plans." },
    { name: "Discover Refer",       url: "https://www.discover.com/credit-cards/refer-a-friend",     keys: ["discover_ref"], note: "Existing cardholders only. Refer for cashback bonus." },
    { name: "Chase Cards (CardRatings)", url: "https://www.cardratings.com/affiliates.html",         keys: ["chase_cell"], note: "Apply with CardRatings to promote Chase cards." },
    { name: "Amex Refer-a-Friend",  url: "https://www.americanexpress.com/en-us/business/loyalty/referrals/", keys: ["amex_ref"], note: "Existing Amex cardholders only — refer friends for points." },
  ];

  return (
    <div className="space-y-4" data-testid="affiliates-guide">
      <div>
        <h3 className="font-display text-xl font-black tracking-tighter">Step-by-step signup checklist</h3>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Each row is an affiliate / referral program already wired into Lumo. Click <span className="font-mono font-bold">Sign up</span>, complete the form, then come back to the <span className="font-mono font-bold">Tracking IDs</span> tab and paste the ID into the matching field. Empty fields are safe — your link still works, you just don&apos;t earn until the ID is filled in.
        </p>
      </div>

      <div className="border border-slate-200 divide-y divide-slate-100">
        {networks.map((n, idx) => (
          <div key={n.name} className="p-3" data-testid={`guide-row-${idx}`}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400 w-8">{String(idx + 1).padStart(2, "0")}</span>
              <span className="font-display font-bold text-sm flex-1">{n.name}</span>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline text-xs inline-flex items-center gap-1" data-testid={`guide-link-${idx}`}>
                Sign up <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-xs text-slate-600 mt-1 ml-10">{n.note}</div>
            <div className="text-[10px] text-slate-400 mt-1 ml-10 font-mono">
              Fills: {n.keys.join(", ")}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 p-4 text-sm">
        <div className="font-display font-bold text-amber-900">Quickest path to revenue</div>
        <ol className="list-decimal list-inside space-y-1 text-amber-900 mt-2">
          <li>Sign up for <strong>Skimlinks</strong> first — auto-monetizes every outbound merchant link with one ID.</li>
          <li>Sign up for <strong>Amazon Associates</strong> (24-hour cookie covers most marketplace traffic).</li>
          <li>Apply to <strong>Impact</strong> + <strong>CJ Affiliate</strong> + <strong>FlexOffers</strong> + <strong>Awin</strong> — 4 networks unlock most of the offers on this list.</li>
          <li>Then open referrals for <strong>Chime, SoFi, Robinhood, Wise, DoorDash, Uber, Coinbase</strong> from your existing accounts (no approval needed).</li>
          <li>Travel: <strong>Booking, Expedia Group, Viator, GetYourGuide</strong>.</li>
        </ol>
      </div>
    </div>
  );
}
