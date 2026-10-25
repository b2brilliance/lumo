import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, IdCard, Award, Wrench, Wallet } from "lucide-react";
import { api, ALL_CATEGORIES } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import MediaUpload from "@/components/MediaUpload";
import StripeConnectCard from "@/components/StripeConnectCard";

const STEPS = [
  { key: "skills", title: "Skills & job types", Icon: Wrench },
  { key: "id", title: "Identification", Icon: IdCard },
  { key: "certs", title: "Certifications", Icon: Award },
  { key: "payouts", title: "Payouts", Icon: Wallet },
];
const WORK_TYPES = [["on_demand", "On-demand gigs"], ["temp", "Temporary shifts"], ["employee", "Part/full-time roles"]];

function SkillsStep({ onDone }) {
  const { user, updateMe } = useAuth();
  const [cats, setCats] = useState(user.categories || []);
  const [types, setTypes] = useState(user.employment_types || ["on_demand"]);
  const [skills, setSkills] = useState((user.provider_profile?.skills || []).join(", "));
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const save = async () => {
    if (!cats.length) return toast.error("Pick at least one type of job");
    await updateMe({ categories: cats, employment_types: types,
      provider_profile: { ...(user.provider_profile || {}), skills: skills.split(",").map((s) => s.trim()).filter(Boolean) } });
    onDone();
  };
  return (
    <div className="space-y-5" data-testid="worker-step-skills">
      <div>
        <div className="text-sm font-semibold mb-2">Jobs you're willing to do</div>
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((c) => (
            <button key={c.value} onClick={() => toggle(cats, setCats, c.value)} className={`h-9 px-3.5 rounded-full text-sm border ${cats.includes(c.value) ? "bg-slate-900 text-white border-slate-900" : "border-slate-200"}`} data-testid={`worker-cat-${c.value}`}>{c.label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold mb-2">Kinds of work</div>
        <div className="flex flex-wrap gap-2">
          {WORK_TYPES.map(([v, l]) => (
            <button key={v} onClick={() => toggle(types, setTypes, v)} className={`h-9 px-3.5 rounded-full text-sm border ${types.includes(v) ? "bg-slate-900 text-white border-slate-900" : "border-slate-200"}`} data-testid={`worker-type-${v}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold mb-2">Your skills</div>
        <textarea value={skills} onChange={(e) => setSkills(e.target.value)} rows={3} placeholder="e.g. forklift, deep cleaning, drywall repair, Spanish" className="w-full rounded-2xl border border-slate-200 p-3 text-sm" data-testid="worker-skills" />
      </div>
      <button onClick={save} className="w-full h-12 rounded-full bg-slate-900 text-white font-semibold" data-testid="worker-skills-save">Save and continue</button>
    </div>
  );
}

function UploadStep({ kind, onDone }) {
  const isId = kind === "id";
  const [media, setMedia] = useState(null);
  const [f, setF] = useState({ kind: isId ? "drivers_license" : "", license_number: "", expiry_date: "" });
  const save = async () => {
    if (!media?.id) return toast.error("Upload a photo first");
    if (!isId && !f.kind.trim()) return toast.error("Name the certification");
    await api.post("/credentials", {
      kind: f.kind.trim(), category: isId ? "identity" : "general", license_number: f.license_number || null,
      expiry_date: f.expiry_date || null, document_media_id: media.id,
    });
    toast.success(isId ? "ID submitted for review" : "Certification added");
    onDone();
  };
  const input = "w-full h-11 px-3 rounded-xl border border-slate-200 text-sm";
  return (
    <div className="space-y-3" data-testid={`worker-step-${kind}`}>
      <p className="text-sm text-slate-500">{isId ? "Upload a clear photo of your government ID. Only the Lumo team can see it." : "Add licenses or certificates (food handler, CDL, notary, trade license…). Skip if you don't have any."}</p>
      {isId ? (
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={input} data-testid="worker-id-type">
          <option value="drivers_license">Driver's license</option><option value="passport">Passport</option><option value="state_id">State or national ID</option>
        </select>
      ) : (
        <input value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} placeholder="Certification name" className={input} data-testid="worker-cert-name" />
      )}
      <input value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} placeholder={isId ? "ID number" : "License / certificate number"} className={input} data-testid={`worker-${kind}-number`} />
      <input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} className={input} data-testid={`worker-${kind}-expiry`} />
      <MediaUpload value={media} onChange={setMedia} aiCheck={false} label={isId ? "Photo of your ID" : "Photo of the certificate"} />
      <button onClick={save} className="w-full h-12 rounded-full bg-slate-900 text-white font-semibold" data-testid={`worker-${kind}-save`}>Submit</button>
      {!isId && <button onClick={onDone} className="w-full h-10 text-sm text-slate-500" data-testid="worker-certs-skip">Skip for now</button>}
    </div>
  );
}

export default function WorkerSetup() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [creds, setCreds] = useState([]);
  useEffect(() => { api.get("/credentials/mine").then(({ data }) => setCreds(data || [])).catch(() => {}); }, [step]);
  const next = () => setStep((s) => s + 1);
  const cur = STEPS[step];

  return (
    <div className="px-4 pt-4 pb-8 max-w-xl mx-auto" data-testid="worker-setup">
      <h1 className="font-display text-2xl font-black tracking-tight">Set up your worker profile</h1>
      <div className="mt-4 grid grid-cols-4 gap-1.5" data-testid="worker-steps">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)} className={`h-1.5 rounded-full ${i <= step ? "bg-slate-900" : "bg-slate-200"}`} aria-label={s.title} data-testid={`worker-stepbar-${s.key}`} />
        ))}
      </div>
      {cur ? (
        <>
          <div className="mt-5 flex items-center gap-2 font-semibold"><cur.Icon className="w-5 h-5" /> {cur.title}</div>
          <div className="mt-4">
            {cur.key === "skills" && <SkillsStep onDone={next} />}
            {cur.key === "id" && <UploadStep kind="id" onDone={next} />}
            {cur.key === "certs" && <UploadStep kind="certs" onDone={next} />}
            {cur.key === "payouts" && (
              <div className="space-y-4" data-testid="worker-step-payouts">
                <p className="text-sm text-slate-500">Connect your bank account so your earnings (90% of every job) are paid out to you.</p>
                <StripeConnectCard />
                <button onClick={next} className="w-full h-12 rounded-full bg-slate-900 text-white font-semibold" data-testid="worker-payouts-done">Continue</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mt-10 text-center" data-testid="worker-setup-done">
          <div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto flex items-center justify-center"><Check className="w-7 h-7 text-emerald-700" /></div>
          <div className="font-display text-xl font-bold mt-4">You're all set</div>
          <p className="text-sm text-slate-500 mt-1">{creds.length} document{creds.length === 1 ? "" : "s"} submitted. We'll let you know once they're verified.</p>
          <button onClick={() => nav("/provider")} className="mt-6 w-full h-12 rounded-full bg-slate-900 text-white font-semibold" data-testid="worker-setup-finish">Find jobs</button>
        </div>
      )}
    </div>
  );
}
