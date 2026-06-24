import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { KIND_LABEL } from "@/lib/credentialKinds";
import { ShieldCheck } from "lucide-react";

const cache = new Map();

export default function TrustBadges({ userId, max = 3, size = "sm" }) {
  const [creds, setCreds] = useState(cache.get(userId) || null);

  useEffect(() => {
    if (!userId) return;
    if (cache.has(userId)) { setCreds(cache.get(userId)); return; }
    api.get(`/credentials/user/${userId}`).then(({ data }) => {
      cache.set(userId, data);
      setCreds(data);
    }).catch(() => { cache.set(userId, []); setCreds([]); });
  }, [userId]);

  if (!creds || creds.length === 0) return null;
  const shown = creds.slice(0, max);
  const more = creds.length - shown.length;

  const text = size === "sm" ? "text-[10px]" : "text-xs";
  const pad = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  return (
    <div className="inline-flex flex-wrap items-center gap-1" data-testid={`trust-badges-${userId}`}>
      {shown.map((c) => (
        <span
          key={c.id}
          className={`inline-flex items-center gap-1 ${pad} ${text} font-mono uppercase tracking-wider border border-teal-700/40 bg-teal-50 text-teal-800`}
          title={`${KIND_LABEL[c.kind] || c.kind}${c.state ? " · " + c.state : ""}${c.expiry_date ? " · expires " + c.expiry_date : ""}`}
        >
          <ShieldCheck className="w-3 h-3" />
          {KIND_LABEL[c.kind] || c.kind}
        </span>
      ))}
      {more > 0 && (
        <span className={`${pad} ${text} font-mono uppercase tracking-wider border border-slate-200 text-slate-500`}>+{more} more</span>
      )}
    </div>
  );
}
