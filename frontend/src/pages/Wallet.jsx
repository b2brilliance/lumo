import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownCircle } from "lucide-react";

export default function Wallet() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState({ balance: 0, transactions: [] });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/wallet");
    setData(data);
  };
  useEffect(() => { load(); }, []);

  const withdraw = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/wallet/withdraw", { amount: parseFloat(amount), method: "bank_transfer" });
      toast.success("Withdrawal requested");
      setAmount("");
      await refresh();
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-screen-md mx-auto px-6 py-10">
      <div className="overline">Wallet</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">In-app balance.</h1>
      <div className="grid md:grid-cols-2 gap-px bg-slate-200 mt-6 border border-slate-200">
        <div className="bg-white p-6">
          <div className="overline flex items-center gap-2"><WalletIcon className="w-4 h-4" /> Available</div>
          <div className="font-display text-5xl font-black mt-2" data-testid="wallet-balance">${Number(data.balance || 0).toFixed(2)}</div>
        </div>
        <form onSubmit={withdraw} className="bg-white p-6 space-y-3">
          <div className="overline flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-teal-700" /> Withdraw</div>
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0.00" required data-testid="withdraw-amount" className="col-span-2" />
            <Button type="submit" disabled={busy || !amount} className="bg-teal-700 hover:bg-teal-800" data-testid="withdraw-submit">Request</Button>
          </div>
          <p className="text-xs text-slate-500">Requests are processed manually within 1–2 business days.</p>
        </form>
      </div>

      <div className="mt-10">
        <div className="overline">Activity ({data.transactions.length})</div>
        <div className="mt-3 border border-slate-200 divide-y divide-slate-200" data-testid="wallet-txns">
          {data.transactions.length === 0 && <div className="p-6 text-sm text-slate-500">No transactions yet.</div>}
          {data.transactions.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between text-sm" data-testid={`txn-${t.id}`}>
              <div>
                <div className="font-display font-bold">{t.reason}</div>
                <div className="font-mono text-xs text-slate-500">{new Date(t.created_at).toLocaleString()}</div>
              </div>
              <div className={`font-mono font-bold ${t.amount > 0 ? "text-teal-700" : "text-red-600"}`}>
                {t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
