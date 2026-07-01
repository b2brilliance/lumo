import React from "react";

/* Reusable page-hero banner for top-level category pages. Renders a full-
 * width image with a dark overlay and page title/subtitle on top. Keeps
 * every category page visually anchored to its content.               */
export default function PageHero({ image, overline, title, subtitle, action, height = "sm" }) {
  const heights = {
    xs: "h-28 sm:h-32",
    sm: "h-40 sm:h-56",
    md: "h-52 sm:h-72",
  };
  return (
    <div className={`relative overflow-hidden ${heights[height] || heights.sm} mb-6`} data-testid="page-hero">
      <img
        src={image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900/85 via-slate-900/60 to-slate-900/30" />
      <div className="relative h-full max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-end pb-4 sm:pb-6">
        <div className="text-white max-w-2xl">
          {overline && <p className="text-[11px] font-mono tracking-[0.2em] uppercase opacity-80">{overline}</p>}
          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tight mt-1">{title}</h1>
          {subtitle && <p className="text-sm sm:text-base opacity-90 mt-1 max-w-xl">{subtitle}</p>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}
