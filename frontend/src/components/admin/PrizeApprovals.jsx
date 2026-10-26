import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";

const STATUS = { pending_approval: "Waiting for you", paid: "Paid", declined: "Declined" };

export const PrizeApprovals = () => {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/referrals/admin/prizes").then((r) => setRows(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const decide = async (id, action) => {
    try {
      await api.post(`/referrals/admin/prizes/${id}/${action}`);
      toast.success(action === "approve" ? "Prize paid to their wallet" : "Prize declined");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <section className="border border-slate-200" data-testid="admin-prize-approvals">
      <div className="p-4 border-b border-slate-200">
        <div className="overline">Monthly recruiter prizes</div>
        <p className="text-xs text-slate-500 mt-1">Top 3 each month win $100 / $50 / $25. Winners are picked on the 1st; check them here, then approve to pay.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr><th className="p-3">Month</th><th>Place</th><th>Recruiter</th><th>Active recruits</th><th>Prize</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500" data-testid="prize-empty">No prize winners yet. The first winners are picked when this month ends.</td></tr>}
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-slate-100" data-testid={`prize-row-${b.id}`}>
              <td className="p-3">{b.month}</td><td>#{b.rank}</td>
              <td><div className="font-bold">{b.name}</div><div className="text-xs text-slate-500">{b.email}</div></td>
              <td>{b.active_recruits ?? "—"}</td><td>${b.prize_amount}</td>
              <td data-testid={`prize-status-${b.id}`}>{STATUS[b.prize_status] || b.prize_status}</td>
              <td className="p-3 text-right whitespace-nowrap">
                {b.prize_status === "pending_approval" && (<>
                  <button onClick={() => decide(b.id, "approve")} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold" data-testid={`prize-approve-${b.id}`}>Approve &amp; pay</button>
                  <button onClick={() => decide(b.id, "decline")} className="ml-2 px-3 py-1.5 border border-slate-300 text-xs" data-testid={`prize-decline-${b.id}`}>Decline</button>
                </>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
