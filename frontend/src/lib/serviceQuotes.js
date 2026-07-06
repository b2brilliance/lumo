/**
 * Market-rate quote calculators for on-demand service categories.
 *
 * We estimate a reasonable starting price so the customer isn't left
 * guessing a budget. Providers can still counter-offer. All rates are
 * ballpark US national medians (2026) — good enough for a "starting from"
 * anchor. Location-specific pricing lives on the provider side.
 *
 * Every function returns { total, breakdown[], detailed_units } or null
 * when a calculation isn't possible for the given inputs.
 */

// ── Market-rate baselines (US national medians, 2026) ─────────────────
const RATES = {
  cleaning: {
    base_visit: 90,     // Studio flat rate
    per_bedroom: 25,
    per_bathroom: 20,
    deep_clean_multiplier: 1.6,
    move_in_out_multiplier: 1.8,
    add_ons: { fridge: 25, oven: 30, windows_interior: 35, laundry: 20 },
  },
  handyman: {
    hourly_min: 65,
    hourly_typical: 85,
    minimum_charge: 85,     // 1-hr minimum on most calls
    truck_charge: 25,       // If materials pickup needed
  },
  notary: {
    per_signature: 15,      // Federal cap in most states is $10-$25
    mobile_trip: 45,        // Travel fee
    loan_signing: 200,      // Full loan doc package flat rate
    apostille: 100,
  },
  roadside: {
    jump_start: 75,
    tire_change: 100,
    lockout: 85,
    fuel_delivery: 75,
    winch_out: 200,
  },
  towing: {
    hookup: 95,
    per_mile_light: 5,      // Sedans / SUVs
    per_mile_medium: 7,     // Pickups / larger
    heavy_duty_flat: 400,   // Commercial vehicles start here
  },
  pet_care: {
    walk_30min: 22,
    walk_60min: 35,
    boarding_night: 55,
    grooming_small: 60,
    grooming_large: 95,
    daycare_day: 40,
  },
  landscaping: {
    lawn_small: 45,         // <1/4 acre
    lawn_medium: 70,        // 1/4–1/2 acre
    lawn_large: 120,        // >1/2 acre
    hedge_trim_hour: 55,
    leaf_removal_hour: 65,
  },
  appliance_repair: {
    diagnostic: 90,
    typical_repair: 200,
    per_hour_labor: 100,
  },
  errand: {
    per_hour: 35,
    minimum: 20,
  },
};

// ── Per-category quote functions ──────────────────────────────────────

function quoteCleaning(details) {
  const r = RATES.cleaning;
  const bedrooms = Math.max(0, parseInt(details.bedrooms || 0, 10));
  const bathrooms = Math.max(0, parseInt(details.bathrooms || 1, 10));
  let total = r.base_visit + bedrooms * r.per_bedroom + bathrooms * r.per_bathroom;
  const breakdown = [
    { label: "Base visit", amount: r.base_visit },
    ...(bedrooms > 0 ? [{ label: `${bedrooms} bedroom${bedrooms > 1 ? "s" : ""}`, amount: bedrooms * r.per_bedroom }] : []),
    { label: `${bathrooms} bathroom${bathrooms > 1 ? "s" : ""}`, amount: bathrooms * r.per_bathroom },
  ];
  if (details.subcategory === "deep_clean") {
    const extra = Math.round(total * (r.deep_clean_multiplier - 1));
    total += extra;
    breakdown.push({ label: "Deep clean surcharge", amount: extra });
  }
  if (details.subcategory === "move_in_out") {
    const extra = Math.round(total * (r.move_in_out_multiplier - 1));
    total += extra;
    breakdown.push({ label: "Move-in/out surcharge", amount: extra });
  }
  ["fridge", "oven", "windows_interior", "laundry"].forEach((key) => {
    if (details[key] === "yes" || details.add_ons?.[key]) {
      total += r.add_ons[key];
      breakdown.push({ label: `Add-on: ${key.replace(/_/g, " ")}`, amount: r.add_ons[key] });
    }
  });
  return { total: Math.round(total), breakdown, unit: "flat" };
}

function quoteHandyman(details) {
  const r = RATES.handyman;
  const hours = Math.max(1, parseFloat(details.hours || 1));
  const rate = r.hourly_typical;
  let total = Math.max(r.minimum_charge, hours * rate);
  const breakdown = [
    { label: `${hours} hr × $${rate}/hr`, amount: hours * rate },
  ];
  if (hours * rate < r.minimum_charge) {
    breakdown.push({ label: "1-hr minimum applied", amount: r.minimum_charge - hours * rate });
  }
  if (details.materials_provided_by === "provider") {
    total += r.truck_charge;
    breakdown.push({ label: "Materials pickup", amount: r.truck_charge });
  }
  return { total: Math.round(total), breakdown, unit: "flat" };
}

function quoteNotary(details) {
  const r = RATES.notary;
  const sub = details.subcategory;
  let total = 0;
  const breakdown = [];
  if (sub === "loan_signing") {
    total = r.loan_signing;
    breakdown.push({ label: "Loan signing (full package)", amount: r.loan_signing });
  } else if (sub === "apostille") {
    total = r.apostille;
    breakdown.push({ label: "Apostille service", amount: r.apostille });
  } else {
    const sigs = Math.max(1, parseInt(details.signatures || 1, 10));
    total = sigs * r.per_signature;
    breakdown.push({ label: `${sigs} signature${sigs > 1 ? "s" : ""} × $${r.per_signature}`, amount: sigs * r.per_signature });
  }
  if (details.mobile === "yes" || details.subcategory === "mobile") {
    total += r.mobile_trip;
    breakdown.push({ label: "Mobile trip fee", amount: r.mobile_trip });
  }
  return { total: Math.round(total), breakdown, unit: "flat" };
}

function quoteRoadside(details) {
  const r = RATES.roadside;
  const sub = details.subcategory || "jump_start";
  const flat = r[sub];
  if (!flat) return null;
  return {
    total: flat,
    breakdown: [{ label: sub.replace(/_/g, " "), amount: flat }],
    unit: "flat",
  };
}

function quoteTowing(details, miles = 0) {
  const r = RATES.towing;
  const vehType = details.vehicle_class || "light";
  if (vehType === "heavy") {
    return { total: r.heavy_duty_flat, breakdown: [{ label: "Heavy-duty tow (starting)", amount: r.heavy_duty_flat }], unit: "flat" };
  }
  const perMile = vehType === "medium" ? r.per_mile_medium : r.per_mile_light;
  const est = Math.max(0, miles || parseFloat(details.estimated_miles || 10));
  const total = r.hookup + est * perMile;
  return {
    total: Math.round(total),
    breakdown: [
      { label: "Hook-up", amount: r.hookup },
      { label: `${est.toFixed(1)} mi × $${perMile}/mi`, amount: Math.round(est * perMile) },
    ],
    unit: "flat",
  };
}

function quotePetCare(details) {
  const r = RATES.pet_care;
  const sub = details.subcategory;
  const key = {
    walk: "walk_30min", walk_short: "walk_30min", walk_long: "walk_60min",
    boarding: "boarding_night", daycare: "daycare_day",
    grooming: (details.pet_size === "large" ? "grooming_large" : "grooming_small"),
  }[sub] || "walk_30min";
  const flat = r[key];
  if (!flat) return null;
  return { total: flat, breakdown: [{ label: sub.replace(/_/g, " "), amount: flat }], unit: "flat" };
}

function quoteLandscaping(details) {
  const r = RATES.landscaping;
  const size = details.lawn_size || "medium";
  const base = { small: r.lawn_small, medium: r.lawn_medium, large: r.lawn_large }[size] || r.lawn_medium;
  return { total: base, breakdown: [{ label: `${size} lawn service`, amount: base }], unit: "flat" };
}

function quoteApplianceRepair(details) {
  const r = RATES.appliance_repair;
  const hours = Math.max(1, parseFloat(details.est_hours || 1.5));
  const total = r.diagnostic + hours * r.per_hour_labor;
  return {
    total: Math.round(total),
    breakdown: [
      { label: "Diagnostic", amount: r.diagnostic },
      { label: `${hours} hr labor × $${r.per_hour_labor}/hr`, amount: hours * r.per_hour_labor },
    ],
    unit: "flat",
  };
}

function quoteErrand(details) {
  const r = RATES.errand;
  const hours = Math.max(0.5, parseFloat(details.hours || 1));
  const total = Math.max(r.minimum, hours * r.per_hour);
  return {
    total: Math.round(total),
    breakdown: [{ label: `${hours} hr × $${r.per_hour}/hr`, amount: hours * r.per_hour }],
    unit: "flat",
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────

const CALCULATORS = {
  cleaning: quoteCleaning,
  handyman: quoteHandyman,
  notary: quoteNotary,
  roadside: quoteRoadside,
  towing: quoteTowing,
  pet_care: quotePetCare,
  landscaping: quoteLandscaping,
  appliance_repair: quoteApplianceRepair,
  errand: quoteErrand,
  // delivery + moving have their own bespoke Haversine + moving calculators
  // that live in /lib/deliveryPricing.js — this file supplements the rest.
};

/**
 * Try to compute a market-rate quote for the given category+details.
 * Returns null if the category is not calculable — the UI should then
 * hide the budget input and show "Providers will quote you".
 */
export function computeMarketQuote(category, details, extraCtx = {}) {
  const fn = CALCULATORS[category];
  if (!fn) return null;
  try {
    return fn(details || {}, extraCtx.miles);
  } catch (e) {
    return null;
  }
}

/**
 * Categories where we intentionally suppress the budget input entirely
 * because no reasonable calculation is possible and a customer-set budget
 * would just anchor providers into low-balling. Providers will send quotes.
 */
export const NO_BUDGET_CATEGORIES = new Set([
  "medical", "legal", "financial", "marketing", "business_admin",
  "digital_tech", "it_support", "remote_work", "research", "education",
  "personal_care", "events", "auto", "ride_share", "security",
  "locksmith", "other",
]);
