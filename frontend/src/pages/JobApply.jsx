import React, { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";

/**
 * Dedicated landing route for Google-Jobs / external "Apply" buttons.
 * /jobs/apply/:category[/:city] → forwards to the Register flow with
 * the role pre-selected as `provider` and category + city pre-filled.
 *
 * No UI — pure redirect that runs once on mount.
 */
export default function JobApply() {
  const { category, city } = useParams();
  const qs = new URLSearchParams({ role: "provider" });
  if (category) qs.set("job_category", category);
  if (city) qs.set("city", city);
  useEffect(() => { /* analytics hook can fire here later */ }, []);
  return <Navigate to={`/register?${qs.toString()}`} replace />;
}
