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
    // Base visit fee by property size (bedroom count).
    base_by_size: {
      studio: 90,
      "1br": 115,
      "2br": 145,
      "3br": 180,
      "4br_plus": 225,
    },
    // Multiplier by property type (apartments cheaper, offices/houses more).
    property_type_mult: {
      apartment: 1.00,
      townhouse: 1.05,
      house: 1.10,
      airbnb: 1.10,
      office: 1.20,
    },
    per_bathroom: 20,
    per_extra_room: 12,          // Attention factor per selected room
    // Cleaning-type multipliers on the labor subtotal
    subcategory_mult: {
      standard: 1.00,
      deep: 1.50,
      move_in_out: 1.70,
      post_construction: 2.00,
      recurring: 0.85,
      other: 1.00,
    },
    // Heavy-task add-ons keyed by CLEANING_TASKS `value`s
    task_addons: {
      fridge: 25,
      oven: 30,
      windows: 35,
      dishes: 12,
    },
    per_laundry_load: 18,
    supplies_by_provider: 15,    // Provider brings supplies
    pet_hair: { dog: 15, cat: 10, both: 20, other: 10 },
  },
  handyman: {
    hourly_typical: 85,
    minimum_charge: 85,     // 1-hr minimum on most calls
    truck_charge: 25,       // If materials pickup needed
    typical_hours_by_sub: {
      repair: 1.5,
      installation: 2,
      assembly: 2,
      mounting: 1.5,
      painting: 3,
      plumbing_minor: 1.5,
      electrical_minor: 1.5,
      other: 1.5,
    },
  },
  notary: {
    per_signature: 15,      // Federal cap in most states is $10-$25
    mobile_trip: 45,        // Travel fee
    loan_signing: 200,      // Full loan doc package flat rate
    apostille: 100,
    real_estate_flat: 200,
    urgency_surcharge: { now: 40, today: 20, this_week: 0, scheduled: 0 },
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
    dogwalking: 30,
    petsitting: 45,          // per visit
    boarding: 55,            // per night
    training: 75,            // per session
    grooming_small: 60,
    grooming_large: 95,
    veterinary_visit: 65,    // house-call visit fee (excludes exam)
    per_extra_animal: 12,
    temperament_reactive: 15,
  },
  landscaping: {
    lawn_small: 45,         // <1/8 acre
    lawn_medium: 70,        // 1/8-1/4 acre
    lawn_large: 120,        // 1/4-1/2 acre
    lawn_xl: 180,           // 1/2+ acre
    per_task: 22,           // per selected side task (edge, weed, mulch, etc.)
    frequency_mult: { one_time: 1.0, weekly: 0.75, biweekly: 0.85, monthly: 0.95 },
  },
  appliance_repair: {
    diagnostic: 90,
    per_hour_labor: 100,
    typical_hours_by_sub: {
      refrigerator: 2, washer: 1.5, dryer: 1.5, dishwasher: 1.5,
      oven_range: 2, microwave: 1, ac_unit: 2.5, water_heater: 2,
      garbage_disposal: 1, ice_maker: 1, small_appliance: 0.5,
      vacuum: 0.5, other: 1.5,
    },
  },
  errand: {
    per_hour: 35,
    minimum: 35,
    typical_hours_by_sub: {
      grocery_shop: 1.5, pharmacy: 0.5, package_dropoff: 0.5,
      package_pickup: 0.5, dry_cleaning: 0.5, dmv_govt: 2,
      gift_buy: 1, return_item: 0.5, grocery_delivery: 0.75,
      misc_pickup: 0.75, wait_in_line: 2, other: 1,
    },
    urgency_surcharge: { now: 10, today: 0, scheduled: 0 },
  },
};

// ── Per-category quote functions ──────────────────────────────────────

function quoteCleaning(details) {
  const r = RATES.cleaning;
  const sub = details.subcategory || "standard";
  const size = details.property_size || "1br";
  const type = details.property_type || "apartment";
  const rooms = Array.isArray(details.rooms) ? details.rooms : [];
  const tasks = Array.isArray(details.tasks) ? details.tasks : [];
  const bathrooms = Math.max(0, parseInt(details.num_bathrooms ?? 1, 10));
  const laundryLoads = Math.max(0, parseInt(details.laundry_loads || 0, 10));

  const baseVisit = r.base_by_size[size] ?? r.base_by_size["1br"];
  const typeMult = r.property_type_mult[type] ?? 1.0;
  const bathAmt = bathrooms * r.per_bathroom;
  const extraRoomsAmt = rooms.length * r.per_extra_room;

  const breakdown = [
    { label: `Base visit (${size.replace("_plus", "+").replace("br", " bedroom")})`, amount: baseVisit },
  ];
  if (typeMult !== 1.0) {
    const bump = Math.round(baseVisit * (typeMult - 1));
    breakdown.push({ label: `${type.replace(/_/g, " ")} adjustment`, amount: bump });
  }
  if (bathAmt > 0) {
    breakdown.push({
      label: `${bathrooms} bathroom${bathrooms !== 1 ? "s" : ""} × $${r.per_bathroom}`,
      amount: bathAmt,
    });
  }
  if (extraRoomsAmt > 0) {
    breakdown.push({
      label: `${rooms.length} room${rooms.length !== 1 ? "s" : ""} × $${r.per_extra_room}`,
      amount: extraRoomsAmt,
    });
  }

  let subtotal = Math.round(baseVisit * typeMult) + bathAmt + extraRoomsAmt;

  // Cleaning-type multiplier on labor subtotal
  const subMult = r.subcategory_mult[sub] ?? 1.0;
  if (subMult !== 1.0) {
    const bump = Math.round(subtotal * (subMult - 1));
    if (bump !== 0) {
      const label =
        sub === "recurring" ? "Recurring discount" :
        sub === "deep" ? "Deep clean surcharge" :
        sub === "move_in_out" ? "Move-in/out surcharge" :
        sub === "post_construction" ? "Post-construction surcharge" :
        `${sub.replace(/_/g, " ")} adjustment`;
      breakdown.push({ label, amount: bump });
      subtotal += bump;
    }
  }

  // Heavy-task add-ons from CLEANING_TASKS multiselect
  Object.entries(r.task_addons).forEach(([taskKey, amt]) => {
    if (tasks.includes(taskKey)) {
      subtotal += amt;
      breakdown.push({ label: `Task: ${taskKey.replace(/_/g, " ")}`, amount: amt });
    }
  });
  if (tasks.includes("laundry") && laundryLoads > 0) {
    const amt = laundryLoads * r.per_laundry_load;
    subtotal += amt;
    breakdown.push({
      label: `${laundryLoads} laundry load${laundryLoads !== 1 ? "s" : ""} × $${r.per_laundry_load}`,
      amount: amt,
    });
  }

  // Supplies provided by cleaner
  if (details.supplies === "provider") {
    subtotal += r.supplies_by_provider;
    breakdown.push({ label: "Provider brings supplies", amount: r.supplies_by_provider });
  }

  // Pet-hair surcharge
  const pet = details.pets_in_home;
  if (pet && pet !== "no" && r.pet_hair[pet]) {
    subtotal += r.pet_hair[pet];
    breakdown.push({ label: `Pet-hair (${pet})`, amount: r.pet_hair[pet] });
  }

  return { total: Math.max(0, Math.round(subtotal)), breakdown, unit: "flat" };
}

function quoteHandyman(details) {
  const r = RATES.handyman;
  const sub = details.subcategory || "repair";
  const defaultHours = r.typical_hours_by_sub[sub] ?? 1.5;
  const hours = Math.max(0.5, parseFloat(details.est_hours || defaultHours));
  const rate = r.hourly_typical;
  const labor = Math.round(hours * rate);
  let total = Math.max(r.minimum_charge, labor);
  const breakdown = [
    { label: `${hours} hr × $${rate}/hr (${sub.replace(/_/g, " ")})`, amount: labor },
  ];
  if (labor < r.minimum_charge) {
    breakdown.push({ label: "1-hr minimum applied", amount: r.minimum_charge - labor });
  }
  if (details.materials_provided === "provider") {
    total += r.truck_charge;
    breakdown.push({ label: "Materials pickup", amount: r.truck_charge });
  }
  return { total: Math.round(total), breakdown, unit: "flat" };
}

function quoteNotary(details) {
  const r = RATES.notary;
  const sub = details.subcategory;
  const signers = Math.max(1, parseInt(details.num_signers || 1, 10));
  const docs = Math.max(1, parseInt(details.num_documents || 1, 10));
  const where = details.mobile_or_office;
  const urgency = details.urgency;

  let total = 0;
  const breakdown = [];

  if (sub === "loan_signing") {
    total = r.loan_signing;
    breakdown.push({ label: "Loan signing (full package)", amount: r.loan_signing });
  } else if (sub === "apostille") {
    total = r.apostille;
    breakdown.push({ label: "Apostille service", amount: r.apostille });
  } else if (sub === "real_estate") {
    total = r.real_estate_flat;
    breakdown.push({ label: "Real estate / mortgage closing", amount: r.real_estate_flat });
  } else {
    // Per-signature × signers × documents
    const sigs = signers * docs;
    total = sigs * r.per_signature;
    breakdown.push({
      label: `${signers} signer${signers !== 1 ? "s" : ""} × ${docs} doc${docs !== 1 ? "s" : ""} × $${r.per_signature}`,
      amount: total,
    });
  }

  if (where === "mobile") {
    total += r.mobile_trip;
    breakdown.push({ label: "Mobile trip fee", amount: r.mobile_trip });
  }
  const urgAmt = r.urgency_surcharge[urgency] || 0;
  if (urgAmt > 0) {
    total += urgAmt;
    breakdown.push({ label: `Urgency: ${urgency}`, amount: urgAmt });
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
  const sub = details.subcategory || "dogwalking";
  const animalType = details.animal_type;
  const temperament = details.temperament;

  let base = 0;
  let label = sub.replace(/_/g, " ");
  if (sub === "grooming") {
    const large = animalType === "dog" && ["large", "xl"].includes((details.pet_size || "").toLowerCase());
    base = large ? r.grooming_large : r.grooming_small;
    label = `Grooming (${large ? "large" : "small/medium"})`;
  } else if (sub === "veterinary") {
    base = r.veterinary_visit;
    label = "House-call visit fee";
  } else if (sub === "petsitting") {
    base = r.petsitting;
    label = "Pet-sitting (per visit)";
  } else if (sub === "dogwalking") {
    base = r.dogwalking;
    label = "Dog walking (30-min)";
  } else if (sub === "boarding") {
    base = r.boarding;
    label = "Boarding (per night)";
  } else if (sub === "training") {
    base = r.training;
    label = "Training session";
  } else {
    return null;
  }
  const breakdown = [{ label, amount: base }];
  let total = base;
  if (temperament === "reactive") {
    total += r.temperament_reactive;
    breakdown.push({ label: "Reactive/nervous surcharge", amount: r.temperament_reactive });
  }
  return { total: Math.round(total), breakdown, unit: "flat" };
}

function quoteLandscaping(details) {
  const r = RATES.landscaping;
  const size = details.lawn_size || "medium";
  const base = { small: r.lawn_small, medium: r.lawn_medium, large: r.lawn_large, xl: r.lawn_xl }[size] || r.lawn_medium;
  const services = Array.isArray(details.services) ? details.services : [];
  const freq = details.frequency || "one_time";
  const freqMult = r.frequency_mult[freq] ?? 1.0;

  const breakdown = [{ label: `${size} lawn service`, amount: base }];
  let subtotal = base;
  // Extra tasks beyond a plain mow: charge per selected side task (excluding "mow" which is already covered by base)
  const sideTasks = services.filter((s) => s !== "mow");
  if (sideTasks.length > 0) {
    const amt = sideTasks.length * r.per_task;
    subtotal += amt;
    breakdown.push({
      label: `${sideTasks.length} extra task${sideTasks.length !== 1 ? "s" : ""}`,
      amount: amt,
    });
  }
  if (freqMult !== 1.0) {
    const bump = Math.round(subtotal * (freqMult - 1));
    if (bump !== 0) {
      breakdown.push({ label: `${freq.replace(/_/g, " ")} recurring discount`, amount: bump });
      subtotal += bump;
    }
  }
  return { total: Math.max(0, Math.round(subtotal)), breakdown, unit: "flat" };
}

function quoteApplianceRepair(details) {
  const r = RATES.appliance_repair;
  const sub = details.subcategory || "other";
  const defaultHours = r.typical_hours_by_sub[sub] ?? 1.5;
  const hours = Math.max(0.5, parseFloat(details.est_hours || defaultHours));
  const labor = Math.round(hours * r.per_hour_labor);
  const total = r.diagnostic + labor;
  return {
    total: Math.round(total),
    breakdown: [
      { label: "Diagnostic", amount: r.diagnostic },
      { label: `${hours} hr labor × $${r.per_hour_labor}/hr (${sub.replace(/_/g, " ")})`, amount: labor },
    ],
    unit: "flat",
  };
}

function quoteErrand(details) {
  const r = RATES.errand;
  const sub = details.subcategory || "misc_pickup";
  const defaultHours = r.typical_hours_by_sub[sub] ?? 1;
  const hours = Math.max(0.5, parseFloat(details.est_hours || defaultHours));
  const labor = Math.round(hours * r.per_hour);
  let total = Math.max(r.minimum, labor);
  const breakdown = [
    { label: `${hours} hr × $${r.per_hour}/hr (${sub.replace(/_/g, " ")})`, amount: labor },
  ];
  if (labor < r.minimum) {
    breakdown.push({ label: "Minimum applied", amount: r.minimum - labor });
  }
  const urgAmt = r.urgency_surcharge[details.urgency] || 0;
  if (urgAmt > 0) {
    total += urgAmt;
    breakdown.push({ label: `Urgency: ${details.urgency}`, amount: urgAmt });
  }
  return { total: Math.round(total), breakdown, unit: "flat" };
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
