import React, { useEffect, useState } from "react";
import { api, ALL_CATEGORIES, formatApiError } from "@/lib/api";
import { CREDENTIAL_KINDS_BY_CATEGORY, kindsForCategory, KIND_LABEL, REQUIRED_CATEGORIES } from "@/lib/credentialKinds";
import { useLocale, COUNTRY_PROFILES } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MediaUpload from "@/components/MediaUpload";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Trash2, CheckCircle2, Globe, Sparkles } from "lucide-react";

const US_STATES = "AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC".split(",");

const STATUS_STYLES = {
  submitted: "text-amber-700 bg-amber-50 border-amber-200",
  verified: "text-teal-800 bg-teal-50 border-teal-200",
  rejected: "text-red-700 bg-red-50 border-red-200",
  ai_pending_review: "text-purple-700 bg-purple-50 border-purple-200",
};

const VERDICT_STYLES = {
  verified: "bg-teal-50 border-teal-200 text-teal-900",
  approved: "bg-teal-50 border-teal-200 text-teal-900",
  needs_review: "bg-amber-50 border-amber-200 text-amber-900",
  flagged: "bg-amber-50 border-amber-200 text-amber-900",
  rejected: "bg-red-50 border-red-200 text-red-900",
};

/**
 * AI verification result card — shown after running /verify/credential or
 * embedded inside a credential row once the credential has an ai_verification
 * stored on it.
 */
export function AiVerdictPanel({ result, testId }) {
  if (!result) return null;
  const v = result.verdict || "needs_review";
  const conf = Number(result.confidence || 0);
  const pct = (conf * 100).toFixed(0);
  const styles = VERDICT_STYLES[v] || "bg-slate-50 border-slate-200 text-slate-900";
  const ex = result.extracted || {};
  return (
    <div className={`col-span-12 mx-4 mb-4 border ${styles} p-4`} data-testid={testId} data-no-i18n="false">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span className="font-display font-bold uppercase tracking-wider text-sm">AI verdict: {v.replace("_", " ")}</span>
          <span className="text-xs font-mono opacity-70">· confidence {pct}%</span>
          {result.regex_match === true && <span className="text-[10px] font-mono uppercase border border-current px-2 py-0.5">format ✓</span>}
          {result.regex_match === false && <span className="text-[10px] font-mono uppercase border border-current px-2 py-0.5">format ✗</span>}
        </div>
        {result.used_model && <span className="text-[10px] font-mono opacity-60">via {result.used_model}</span>}
      </div>
      {(ex.id_number || ex.holder_name || ex.issuer || ex.issue_date || ex.expiry_date) && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono">
          {ex.id_number    && <div><div className="opacity-60 uppercase">ID Number</div><div>{ex.id_number}</div></div>}
          {ex.holder_name  && <div><div className="opacity-60 uppercase">Holder</div><div>{ex.holder_name}</div></div>}
          {ex.issuer       && <div><div className="opacity-60 uppercase">Issuer</div><div>{ex.issuer}</div></div>}
          {ex.issue_date   && <div><div className="opacity-60 uppercase">Issued</div><div>{ex.issue_date}</div></div>}
          {ex.expiry_date  && <div><div className="opacity-60 uppercase">Expires</div><div>{ex.expiry_date}</div></div>}
          {ex.country      && <div><div className="opacity-60 uppercase">Country</div><div>{ex.country}</div></div>}
        </div>
      )}
      {result.red_flags && result.red_flags.length > 0 && (
        <div className="mt-3 text-xs">
          <span className="font-mono uppercase opacity-60">Red flags: </span>
          {result.red_flags.map((f) => (
            <span key={f} className="inline-block mr-2 mt-1 border border-current px-2 py-0.5 text-[10px] font-mono uppercase">{f}</span>
          ))}
        </div>
      )}
      {result.explanation && (
        <p className="text-xs mt-3 opacity-90 leading-relaxed">{result.explanation}</p>
      )}
    </div>
  );
}

/**
 * Inline variant of AiVerdictPanel that doesn't span a grid (used inside
 * BusinessRegistration cards).
 */
function AiVerdictPanelInline({ result, testId }) {
  if (!result) return null;
  const v = result.verdict || "needs_review";
  const conf = Number(result.confidence || 0);
  const pct = (conf * 100).toFixed(0);
  const styles = VERDICT_STYLES[v] || "bg-slate-50 border-slate-200 text-slate-900";
  const ex = result.extracted || {};
  return (
    <div className={`mt-3 border ${styles} p-3 text-xs`} data-testid={testId}>
      <div className="flex items-center gap-2 font-display font-bold uppercase tracking-wider text-xs">
        <Sparkles className="w-3.5 h-3.5" />AI {v.replace("_", " ")} · {pct}%
        {result.regex_match === true && <span className="ml-1 border border-current px-1.5 py-0.5 text-[9px] uppercase">format ✓</span>}
        {result.regex_match === false && <span className="ml-1 border border-current px-1.5 py-0.5 text-[9px] uppercase">format ✗</span>}
      </div>
      {(ex.id_number || ex.holder_name) && (
        <div className="mt-2 font-mono text-[10px]">
          {ex.id_number && <span className="mr-2">#{ex.id_number}</span>}
          {ex.holder_name && <span>{ex.holder_name}</span>}
        </div>
      )}
      {result.explanation && <p className="mt-2 opacity-90">{result.explanation}</p>}
    </div>
  );
}

function BizAiVerifyButton({ credId, onDone }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/verify/credential/${credId}`);
      if (data.verdict === "verified" && data.confidence >= 0.9) toast.success(`AI verified · ${(data.confidence * 100).toFixed(0)}%`);
      else if (data.verdict === "rejected") toast.error("AI rejected — see details");
      else toast.warning("AI suggests human review");
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy} className="mt-3 h-7 px-2 text-xs border-teal-300 text-teal-800 hover:bg-teal-50" data-testid={`biz-ai-verify-${credId}`}>
      <Sparkles className="w-3 h-3 mr-1" /> {busy ? "Checking…" : "Run AI verification"}
    </Button>
  );
}

/**
 * Country-specific business / tax-registration credentials.
 * Fetches the credential schema for the current locale country, lets the
 * provider submit each (number + optional doc) via the standard /credentials
 * endpoint with category="business_registration".
 */
function BusinessRegistration({ credentials, country, profile, onSubmitted }) {
  const [reqs, setReqs] = useState([]);
  const [overrideCountry, setOverrideCountry] = useState(country);
  const [forms, setForms] = useState({});
  const [busy, setBusy] = useState(null);
  const activeCountry = overrideCountry || country;

  useEffect(() => {
    api.get(`/credentials/country-requirements?country=${activeCountry}`)
      .then(({ data }) => setReqs(data.credentials || []))
      .catch(() => setReqs([]));
  }, [activeCountry]);

  const submitOne = async (kind) => {
    const f = forms[kind] || {};
    if (!f.value && !f.document?.id) {
      toast.error("Add a number or upload a document");
      return;
    }
    setBusy(kind);
    try {
      await api.post("/credentials", {
        kind,
        category: "business_registration",
        license_number: f.value || null,
        expiry_date: f.expiry || null,
        state: activeCountry,                 // we reuse the `state` field to store the country code
        document_media_id: f.document?.id || null,
        notes: f.notes || null,
      });
      toast.success("Business registration submitted for review");
      setForms({ ...forms, [kind]: { value: "", expiry: "", document: null, notes: "" } });
      onSubmitted?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const existingByKind = {};
  for (const c of credentials) {
    if (c.category === "business_registration") existingByKind[c.kind] = c;
  }

  return (
    <section className="border border-slate-200 p-6 mb-8" data-no-i18n="false" data-testid="business-registration-section">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-teal-700" />
          <div className="font-display text-xl font-bold">Business / tax registration</div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 uppercase">Country</span>
          <select
            value={activeCountry}
            onChange={(e) => setOverrideCountry(e.target.value)}
            className="border border-slate-300 px-2 py-1.5"
            data-testid="biz-country-picker"
          >
            {Object.entries(COUNTRY_PROFILES).map(([code, p]) => (
              <option key={code} value={code}>{p.flag} {code} — {p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-slate-600 text-sm mt-3">
        Every country has its own rules about who can legally invoice for work. Add the ID(s) from the list below — the ones marked <strong>required</strong> are needed before you can be paid out in {profile?.name || activeCountry}.
      </p>

      {reqs.length === 0 ? (
        <div className="mt-6 text-sm text-slate-500">No country-specific business credentials configured for {activeCountry}.</div>
      ) : (
        <div className="mt-5 grid md:grid-cols-2 gap-4">
          {reqs.map((r) => {
            const existing = existingByKind[r.kind];
            const f = forms[r.kind] || { value: "", expiry: "", document: null, notes: "" };
            const setF = (patch) => setForms({ ...forms, [r.kind]: { ...f, ...patch } });
            return (
              <div key={r.kind} className="border border-slate-200 p-4 bg-slate-50/40" data-testid={`biz-cred-${r.kind}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display font-bold text-slate-900">{r.label}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-1">
                      {r.required_for === "business" ? "businesses" : r.required_for === "individual" ? "individuals (sole prop)" : "businesses & individuals"}
                      {r.issuer ? ` · ${r.issuer}` : ""}
                    </div>
                    <div className="text-xs font-mono text-slate-500 mt-1">Format: {r.format}</div>
                  </div>
                  {existing && (
                    <span className={`text-[10px] font-mono uppercase tracking-widest border px-2 py-1 whitespace-nowrap ${STATUS_STYLES[existing.status] || "border-slate-200 text-slate-500"}`} data-testid={`biz-status-${r.kind}`}>
                      {existing.status === "verified" ? "✓ verified" : existing.status}
                    </span>
                  )}
                </div>
                {!existing && (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={f.value}
                      onChange={(e) => setF({ value: e.target.value })}
                      placeholder={r.format}
                      data-testid={`biz-input-${r.kind}`}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={f.expiry}
                        onChange={(e) => setF({ expiry: e.target.value })}
                        placeholder="Expiry (if any)"
                        data-testid={`biz-expiry-${r.kind}`}
                      />
                      <Button
                        size="sm"
                        onClick={() => submitOne(r.kind)}
                        disabled={busy === r.kind}
                        className="bg-slate-900 hover:bg-slate-800 w-full"
                        data-testid={`biz-submit-${r.kind}`}
                      >
                        {busy === r.kind ? "Submitting…" : "Submit"}
                      </Button>
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-1">Optional: upload a supporting document</div>
                    <MediaUpload
                      value={f.document ? { media_url: f.document.media_url, media_type: f.document.media_type } : null}
                      onChange={(v) => setF({ document: v.media_url ? { ...v, id: v.id } : null })}
                      label=""
                    />
                  </div>
                )}
                {existing && existing.license_number && (
                  <div className="mt-2 font-mono text-xs text-slate-600">#{existing.license_number}{existing.expiry_date ? ` · expires ${existing.expiry_date}` : ""}</div>
                )}
                {existing && existing.document_media_id && existing.status !== "verified" && (
                  <BizAiVerifyButton credId={existing.id} onDone={onSubmitted} />
                )}
                {existing && existing.ai_verification && (
                  <AiVerdictPanelInline result={existing.ai_verification} testId={`biz-ai-panel-${r.kind}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500 mt-4">
        Tip: Lumo will use these to issue compliant invoices on your behalf and report taxes correctly in {profile?.name || activeCountry}. We never share them publicly — only an internal admin reviewer sees them.
      </p>
    </section>
  );
}

export default function CredentialsPage() {
  const { country, profile } = useLocale();
  const [creds, setCreds] = useState([]);
  const [form, setForm] = useState({
    category: "medical", kind: "", state: "", license_number: "",
    expiry_date: "", document: null, insurance_carrier: "",
    insurance_policy_number: "", insurance_expiry: "", notes: "",
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/credentials/mine");
    setCreds(data);
  };
  useEffect(() => { load(); }, []);

  const kinds = kindsForCategory(form.category);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/credentials", {
        kind: form.kind,
        category: form.category,
        state: form.state || null,
        license_number: form.license_number || null,
        expiry_date: form.expiry_date || null,
        document_media_id: form.document?.id || null,
        insurance_carrier: form.insurance_carrier || null,
        insurance_policy_number: form.insurance_policy_number || null,
        insurance_expiry: form.insurance_expiry || null,
        notes: form.notes || null,
      });
      toast.success("Credential submitted for review");
      setForm({ ...form, kind: "", state: "", license_number: "", expiry_date: "", document: null, insurance_carrier: "", insurance_policy_number: "", insurance_expiry: "", notes: "" });
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this credential?")) return;
    try { await api.delete(`/credentials/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const devVerify = async (id) => {
    try {
      await api.post(`/credentials/${id}/dev_verify`);
      toast.success("Marked verified (demo)");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const [aiBusy, setAiBusy] = useState(null);
  const [aiResults, setAiResults] = useState({});

  const runAiVerify = async (id) => {
    setAiBusy(id);
    try {
      const { data } = await api.post(`/verify/credential/${id}`);
      setAiResults((r) => ({ ...r, [id]: data }));
      if (data.verdict === "verified" && data.confidence >= 0.9) {
        toast.success(`AI verified · confidence ${(data.confidence * 100).toFixed(0)}%`);
      } else if (data.verdict === "rejected") {
        toast.error(`AI rejected — ${data.red_flags?.join(", ") || "see details"}`);
      } else {
        toast.warning(`AI suggests human review · confidence ${(data.confidence * 100).toFixed(0)}%`);
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setAiBusy(null);
    }
  };

  // Build category options that filter only those with explicit kinds + any "required" ones
  const catOptions = ALL_CATEGORIES.filter((c) => CREDENTIAL_KINDS_BY_CATEGORY[c.value]);

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-10">
      <div className="overline">Provider credentials</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Licenses, certifications & insurance.</h1>
      <p className="text-slate-600 mt-3 text-sm max-w-2xl">
        Upload a credential for each category you work in. Medical and legal jobs require a verified credential before you can accept or quote. Other categories are optional but strongly recommended — verified providers get a trust badge that customers can see.
      </p>

      <div className="mt-8">
        <BusinessRegistration credentials={creds} country={country} profile={profile} onSubmitted={load} />
      </div>

      <div className="grid lg:grid-cols-12 gap-8 mt-8">
        <form onSubmit={submit} className="lg:col-span-5 border border-slate-200 p-6 space-y-4" data-testid="credential-form">
          <div className="overline">Add a credential</div>
          <div>
            <Label className="overline">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, kind: "" })}>
              <SelectTrigger className="mt-1" data-testid="cred-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {catOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}{REQUIRED_CATEGORIES.has(c.value) ? " — required" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="overline">Credential type</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger className="mt-1" data-testid="cred-kind"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {kinds.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="overline">Issuing state</Label>
              <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                <SelectTrigger className="mt-1" data-testid="cred-state"><SelectValue placeholder="N/A" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="overline">License / cert number</Label>
              <Input value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} data-testid="cred-number" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="overline">Expiry date</Label>
            <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} data-testid="cred-expiry" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Upload credential document</Label>
            <div className="mt-1">
              <MediaUpload
                value={form.document ? { media_url: form.document.media_url, media_type: form.document.media_type } : null}
                onChange={(v) => setForm({ ...form, document: v.media_url ? { ...v, id: v.id } : null })}
                label="Photo or scan (PDF rendered as image, JPG, PNG)"
              />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-4">
            <div className="overline mb-2">Insurance (optional but recommended)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="overline">Carrier</Label>
                <Input value={form.insurance_carrier} onChange={(e) => setForm({ ...form, insurance_carrier: e.target.value })} data-testid="cred-ins-carrier" className="mt-1" />
              </div>
              <div>
                <Label className="overline">Policy #</Label>
                <Input value={form.insurance_policy_number} onChange={(e) => setForm({ ...form, insurance_policy_number: e.target.value })} data-testid="cred-ins-policy" className="mt-1" />
              </div>
            </div>
            <div className="mt-3">
              <Label className="overline">Insurance expiry</Label>
              <Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} data-testid="cred-ins-expiry" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="overline">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="cred-notes" className="mt-1" />
          </div>
          <Button type="submit" disabled={busy || !form.kind} className="w-full bg-slate-900 hover:bg-slate-800" data-testid="cred-submit">
            {busy ? "Submitting…" : "Submit for review"}
          </Button>
          <p className="text-xs text-slate-500">
            Lumo will review your submission. While pending you cannot accept restricted-category jobs (medical, legal).
          </p>
        </form>

        <div className="lg:col-span-7">
          <div className="overline">My credentials ({creds.length})</div>
          <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="credentials-list">
            {creds.length === 0 && <div className="p-6 text-sm text-slate-500">No credentials added yet.</div>}
            {creds.map((c) => (
              <React.Fragment key={c.id}>
              <div className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`cred-row-${c.id}`}>
                <div className="col-span-5">
                  <div className="font-display font-bold">{KIND_LABEL[c.kind] || c.kind}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">
                    {c.category}{c.state ? ` · ${c.state}` : ""}{c.license_number ? ` · #${c.license_number}` : ""}
                    {c.expiry_date ? ` · expires ${c.expiry_date}` : ""}
                  </div>
                </div>
                <div className="col-span-3 text-xs font-mono">
                  {c.insurance_carrier ? (
                    <span className="text-slate-700">{c.insurance_carrier}{c.insurance_expiry ? ` · ${c.insurance_expiry}` : ""}</span>
                  ) : (
                    <span className="text-slate-400">No insurance</span>
                  )}
                </div>
                <div className="col-span-2">
                  <span className={`text-[10px] font-mono uppercase tracking-widest border px-2 py-1 ${STATUS_STYLES[c.status] || "border-slate-200 text-slate-500"}`} data-testid={`cred-status-${c.id}`}>
                    {c.status === "verified" ? <><CheckCircle2 className="inline w-3 h-3 mr-1" />verified</> : c.status === "submitted" ? <><ShieldAlert className="inline w-3 h-3 mr-1" />pending</> : <><ShieldAlert className="inline w-3 h-3 mr-1" />{c.status}</>}
                  </span>
                </div>
                <div className="col-span-2 text-right flex justify-end gap-1">
                  {c.document_media_id && c.status !== "verified" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAiVerify(c.id)}
                      disabled={aiBusy === c.id}
                      className="h-7 px-2 text-xs border-teal-300 text-teal-800 hover:bg-teal-50"
                      data-testid={`cred-ai-verify-${c.id}`}
                      title="Run AI document verification (Claude → Gemini fallback)"
                    >
                      <Sparkles className="w-3 h-3 mr-1" /> {aiBusy === c.id ? "Checking…" : "AI verify"}
                    </Button>
                  )}
                  {c.status !== "verified" && (
                    <Button size="sm" variant="outline" onClick={() => devVerify(c.id)} className="h-7 px-2 text-xs" data-testid={`cred-dev-verify-${c.id}`} title="Demo only — would be admin-only in production">
                      <ShieldCheck className="w-3 h-3 mr-1" /> Verify
                    </Button>
                  )}
                  <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-600" data-testid={`cred-delete-${c.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {(aiResults[c.id] || c.ai_verification) && (
                <AiVerdictPanel result={aiResults[c.id] || c.ai_verification} testId={`cred-ai-panel-${c.id}`} />
              )}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3 font-mono">
            Demo note: the &quot;Verify&quot; button approves your credential instantly so you can test. In production this is admin / compliance only.
          </p>
        </div>
      </div>
    </div>
  );
}
