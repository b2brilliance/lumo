import React from "react";
import { CATEGORY_COLORS } from "@/lib/api";

export default function CategoryBadge({ group, isRemote, size = "sm" }) {
  const g = isRemote ? "remote_jobs" : group;
  const c = CATEGORY_COLORS[g] || CATEGORY_COLORS.local_services;
  const cls = size === "sm"
    ? "text-[10px] tracking-[0.2em] uppercase px-1.5 py-0.5"
    : "text-xs tracking-[0.2em] uppercase px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono ${cls} text-white`}
      style={{ background: c.hex }}
      data-testid={`category-badge-${g}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
      {c.label}
    </span>
  );
}
