// Map medical job's `details.license_required` enum → set of acceptable credential kinds.
// Kept in sync with backend MEDICAL_LICENSE_MAP.

export const MEDICAL_LICENSE_MAP = {
  rn_lpn: ["rn", "lpn"],
  cna_hha: ["cna", "hha"],
  pt: ["dpt", "pta"],
  ot: ["ot"],
  slp: ["slp"],
  rt: ["rt"],
  phlebotomist: ["cpt"],
  mental_health: ["lcsw", "lmft", "psychologist", "md_do_np_pa"],
  ibclc: ["ibclc"],
  doula: ["doula"],
  md_do_np_pa: ["md_do_np_pa"],
  rad_tech: ["rad_tech"],
  other: [],
};

export function acceptableKindsFor(category, licenseRequired) {
  if (category === "medical" && licenseRequired) {
    const set = MEDICAL_LICENSE_MAP[licenseRequired];
    return set && set.length > 0 ? set : null;  // null = any verified medical cred OK
  }
  return null;
}

/**
 * Check if a provider's verified credentials match a job's license requirement.
 * @param {Array} creds — verified credential list for the provider (from /api/credentials/user/:id or /credentials/mine filtered to verified)
 * @param {string} category
 * @param {string} licenseRequired
 * @returns { matched: boolean, kind?: string }
 */
export function checkCredentialMatch(creds, category, licenseRequired) {
  if (!creds || creds.length === 0) return { matched: false };
  const sameCat = creds.filter((c) => c.category === category && (c.status === "verified" || !c.status));
  if (sameCat.length === 0) return { matched: false };
  const acceptable = acceptableKindsFor(category, licenseRequired);
  if (!acceptable) return { matched: true, kind: sameCat[0].kind };  // any same-category cred works
  const found = sameCat.find((c) => acceptable.includes(c.kind));
  return found ? { matched: true, kind: found.kind } : { matched: false };
}
