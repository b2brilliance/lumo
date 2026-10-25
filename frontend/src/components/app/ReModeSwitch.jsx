import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const MODES = [
  { v: "seeking", label: "Buy or rent", to: "/real-estate" },
  { v: "listing", label: "Sell or rent out", to: "/real-estate/mine" },
];

export default function ReModeSwitch() {
  const { user, updateMe } = useAuth();
  const nav = useNavigate();
  if (!user || user.role !== "real_estate") return null;
  const mode = user.re_mode || "seeking";

  const pick = async (m) => {
    if (m.v !== mode) await updateMe({ re_mode: m.v });
    nav(m.to);
  };

  return (
    <div className="grid grid-cols-2 p-1 rounded-full bg-slate-100" data-testid="re-mode-switch">
      {MODES.map((m) => (
        <button key={m.v} onClick={() => pick(m)} className={`h-10 rounded-full text-sm font-semibold transition-colors ${mode === m.v ? "bg-white shadow text-slate-900" : "text-slate-500"}`} data-testid={`re-mode-${m.v}`}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
