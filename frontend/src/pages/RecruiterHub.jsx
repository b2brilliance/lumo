import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { HubStats } from "@/components/recruiter/HubStats";
import { HubRecruits } from "@/components/recruiter/HubRecruits";
import { HubLeaderboards } from "@/components/recruiter/HubLeaderboards";
import { MyBadges } from "@/components/recruiter/RecruiterLeaderboard";
import { Share2 } from "lucide-react";

export default function RecruiterHub() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/recruiter-hub/me").then((r) => setData(r.data)).catch(() => setData({ error: true })); }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-14" data-testid="recruiter-hub-page">
      <div className="flex flex-wrap items-end justify-between gap-6 hub-rise">
        <div>
          <div className="overline text-teal-700">Recruiter Hub</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter mt-3">Your crew, at a glance.</h1>
          <p className="mt-4 text-slate-600 max-w-xl text-sm sm:text-base">
            Everyone who joined with your link, every job they've finished, and where you stand against other recruiters.
          </p>
        </div>
        <Link to="/recruiter" className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-slate-950 text-white text-sm font-semibold hover:bg-teal-700 transition-colors" data-testid="hub-share-link-btn">
          <Share2 className="w-4 h-4" /> Get my invite link
        </Link>
      </div>

      {!data && <div className="mt-12 h-32 bg-slate-100 animate-pulse" data-testid="hub-loading" />}
      {data?.error && <p className="mt-12 text-sm text-red-600" data-testid="hub-error">We couldn't load your hub. Please refresh.</p>}
      {data?.summary && (
        <>
          <HubStats s={data.summary} />
          <HubRecruits rows={data.recruits} />
          <MyBadges />
          <HubLeaderboards city={data.city} />
        </>
      )}
    </div>
  );
}
