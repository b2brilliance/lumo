import React, { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";

/**
 * Dedicated landing route for Google-Jobs / external "Apply" buttons.
 * /jobs/apply/:category[/:city] → forwards to the passwordless SMS sign-in
 * with a `next=` pointer to the full Register form so the user can finish
 * their provider profile once they've claimed the account in 10 seconds.
 *
 * Pure redirect — no UI.
 */
export default function JobApply() {
  const { category, city } = useParams();
  const regQs = new URLSearchParams({ role: "provider" });
  if (category) regQs.set("job_category", category);
  if (city) regQs.set("city", city);
  const next = `/register?${regQs.toString()}`;
  useEffect(() => { /* analytics hook can fire here later */ }, []);
  return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />;
}
