import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const FIELDS = [
  { key: "base_pct", label: "Starting rate (%)", step: "0.01" },
  { key: "step_pct", label: "Increase per step (%)", step: "0.01" },
  { key: "step_jobs", label: "Jobs per step", step: "1" },
  { key: "max_pct", label: "Max rate (%)", step: "0.01" },
];

export default function RecruitersTab() {
  const [cfg, setCfg] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get("/referrals/program").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/referrals/admin/leaderboard").then((r) => setRows(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, Number(cfg[f.key])]));
      const { data } = await api.put("/referrals/admin/program", body);
      setCfg((c) => ({ ...c, ...data }));
      toast.success("Recruiter program updated");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!cfg) return null;
  return (
    <div className="space-y-8" data-testid="admin-recruiters-tab">
      <section className="border border-slate-200 p-6">
        <div className="overline">Recruiter commission ladder</div>
        <p className="text-xs text-slate-500 mt-1">Paid out of Lumo's 10% commission, as a % of each job's price.</p>
        <div className="grid sm:grid-cols-4 gap-4 mt-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input type="number" step={f.step} value={cfg[f.key]}
                onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
                data-testid={`recruiter-config-${f.key}`} />
            </div>
          ))}
        </div>
        <Button onClick={save} className="mt-4 rounded-none" data-testid="recruiter-config-save">Save</Button>
      </section>
      <section className="border border-slate-200" data-testid="recruiter-leaderboard">
        <div className="p-4 overline border-b border-slate-200">Top recruiters</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr><th className="p-3">Recruiter</th><th>Recruits</th><th>Recruit jobs</th><th>Rate</th><th>Earned</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No recruiter earnings yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t border-slate-100" data-testid={`recruiter-row-${r.user_id}`}>
                <td className="p-3"><div className="font-bold">{r.name}</div><div className="text-xs text-slate-500">{r.email}</div></td>
                <td>{r.recruits}</td><td>{r.recruit_jobs}</td><td>{r.rate_pct.toFixed(2)}%</td><td>${r.earned.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
