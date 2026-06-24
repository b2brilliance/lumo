import React, { useEffect, useState } from "react";
import { api, ALL_CATEGORIES, formatApiError } from "@/lib/api";
import { CREDENTIAL_KINDS_BY_CATEGORY, kindsForCategory, KIND_LABEL, REQUIRED_CATEGORIES } from "@/lib/credentialKinds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MediaUpload from "@/components/MediaUpload";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Trash2, CheckCircle2 } from "lucide-react";

const US_STATES = "AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,DC".split(",");

const STATUS_STYLES = {
  submitted: "text-amber-700 bg-amber-50 border-amber-200",
  verified: "text-teal-800 bg-teal-50 border-teal-200",
  rejected: "text-red-700 bg-red-50 border-red-200",
};

export default function CredentialsPage() {
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

  // Build category options that filter only those with explicit kinds + any "required" ones
  const catOptions = ALL_CATEGORIES.filter((c) => CREDENTIAL_KINDS_BY_CATEGORY[c.value]);

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-10">
      <div className="overline">Provider credentials</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Licenses, certifications & insurance.</h1>
      <p className="text-slate-600 mt-3 text-sm max-w-2xl">
        Upload a credential for each category you work in. Medical and legal jobs require a verified credential before you can accept or quote. Other categories are optional but strongly recommended — verified providers get a trust badge that customers can see.
      </p>

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
              <div key={c.id} className="p-4 grid grid-cols-12 gap-3 items-center" data-testid={`cred-row-${c.id}`}>
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
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3 font-mono">
            Demo note: the "Verify" button approves your credential instantly so you can test. In production this is admin / compliance only.
          </p>
        </div>
      </div>
    </div>
  );
}
