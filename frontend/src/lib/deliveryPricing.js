// Delivery pricing engine — used by:
//  - Customer service-request form for category = "delivery" or "courier"
//  - Store / restaurant order dialog (mile-only mode)
//
// Formula (P2P delivery / courier):
//   base_fee (by size)
//   + short-distance: min(miles, 50) * per_mile_short (by size)
//   + long-distance: max(0, miles - 50) * per_mile_long (per_mile_short + $0.75)
//   + long-haul surcharge $25 if miles > 50
//   + extra items: each beyond the first × 50% of base
//   + weight: ($0.50 × every pound over 5)
//   × 1.2 if fragile
//
// Stores & restaurants: simpler per-mile-only ($4 base + $1.50/mi).

export const SIZE_PRICING = {
  envelope:       { base: 7,  per_mile: 1.00, label: "Envelope / documents" },
  small_box:      { base: 7,  per_mile: 1.00, label: "Small box (≤ shoebox)" },
  medium_box:     { base: 10, per_mile: 1.25, label: "Medium box (≤ moving box)" },
  large_box:      { base: 15, per_mile: 1.50, label: "Large box / suitcase" },
  furniture:      { base: 30, per_mile: 2.00, label: "Furniture" },
  appliance:      { base: 40, per_mile: 2.25, label: "Appliance" },
  vehicle_parts:  { base: 22, per_mile: 1.75, label: "Vehicle parts" },
  groceries:      { base: 9,  per_mile: 1.25, label: "Groceries / food" },
  other:          { base: 8,  per_mile: 1.25, label: "Other" },
};

export const DELIVERY_RATES = {
  long_distance_threshold_miles: 50,
  long_haul_premium_per_mile: 0.75,   // added on top of per-size per-mile
  long_haul_flat_surcharge: 25,        // flat fee added when miles > threshold
  per_lb_over_5: 0.5,                  // per pound over the first 5 lbs
  fragile_multiplier: 1.2,
  extra_item_multiplier: 0.5,          // each item beyond first counts at 50% of base
  // Stores & restaurants (per-mile-only mode)
  store_base: 4.0,
  store_per_mile: 1.5,
};

// Lumo platform fee — used to show providers what they actually take home.
// Customer-facing UI should never mention this.
export const LUMO_COMMISSION_RATE = 0.10;

/**
 * Provider-facing earnings breakdown. Tax is collected from the customer at
 * checkout and does NOT reduce the provider's take-home, so we surface it
 * informationally only.
 */
export function providerEarningsBreakdown({
  customerCost = 0,
  taxRate = null,
  taxAmount = null,
} = {}) {
  const gross = Math.max(0, Number(customerCost) || 0);
  const lumoCommission = Math.round(gross * LUMO_COMMISSION_RATE * 100) / 100;
  const net = Math.round((gross - lumoCommission) * 100) / 100;
  const computedTaxAmount = taxAmount != null
    ? Number(taxAmount)
    : (taxRate != null ? Math.round(gross * Number(taxRate) * 100) / 100 : null);
  return {
    customer_pays: Math.round(gross * 100) / 100,
    lumo_commission_rate: LUMO_COMMISSION_RATE,
    lumo_commission: lumoCommission,
    tax_rate: taxRate,
    tax_amount: computedTaxAmount,
    net_to_provider: net,
  };
}

// Haversine miles
export function milesBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function computeDeliveryQuote({ miles, item_size = "other", quantity = 1, weight_estimate = 0, fragile = false } = {}) {
  const r = DELIVERY_RATES;
  const sz = SIZE_PRICING[item_size] || SIZE_PRICING.other;
  const m = miles != null ? Math.max(0, miles) : 0;

  const shortMiles = Math.min(m, r.long_distance_threshold_miles);
  const longMiles = Math.max(0, m - r.long_distance_threshold_miles);
  const shortDistanceFee = shortMiles * sz.per_mile;
  const longDistanceFee = longMiles * (sz.per_mile + r.long_haul_premium_per_mile);
  const longHaulSurcharge = m > r.long_distance_threshold_miles ? r.long_haul_flat_surcharge : 0;

  const extras = Math.max(0, (quantity || 1) - 1) * sz.base * r.extra_item_multiplier;
  const weightFee = Math.max(0, (weight_estimate || 0) - 5) * r.per_lb_over_5;

  let subtotal = sz.base + shortDistanceFee + longDistanceFee + longHaulSurcharge + extras + weightFee;
  if (fragile) subtotal *= r.fragile_multiplier;

  const total = Math.round(subtotal * 100) / 100;
  return {
    miles: miles != null ? Math.round(miles * 10) / 10 : null,
    is_long_distance: m > r.long_distance_threshold_miles,
    base_fee: sz.base,
    size_label: sz.label,
    short_distance_fee: Math.round(shortDistanceFee * 100) / 100,
    short_distance_miles: Math.round(shortMiles * 10) / 10,
    short_per_mile: sz.per_mile,
    long_distance_fee: Math.round(longDistanceFee * 100) / 100,
    long_distance_miles: Math.round(longMiles * 10) / 10,
    long_per_mile: Math.round((sz.per_mile + r.long_haul_premium_per_mile) * 100) / 100,
    long_haul_surcharge: longHaulSurcharge,
    extra_items_fee: Math.round(extras * 100) / 100,
    weight_fee: Math.round(weightFee * 100) / 100,
    fragile_multiplier: fragile ? r.fragile_multiplier : 1.0,
    total,
  };
}

export function computeStoreDeliveryQuote({ miles } = {}) {
  const r = DELIVERY_RATES;
  const distanceFee = miles != null ? Math.max(0, miles) * r.store_per_mile : 0;
  const total = Math.round((r.store_base + distanceFee) * 100) / 100;
  return {
    miles: miles != null ? Math.round(miles * 10) / 10 : null,
    base_fee: r.store_base,
    distance_fee: Math.round(distanceFee * 100) / 100,
    total,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Moving — pickup → drop-off with size, movers, stairs, packing, distance.
// ────────────────────────────────────────────────────────────────────────────
export const MOVING_PROPERTY_BASE = {
  studio:    120,
  "1br":     180,
  "2br":     260,
  "3br":     360,
  "4br_plus":500,
};

// Multiplier relative to 2-mover baseline
export const MOVING_MOVER_MULT = {
  1: 0.7, 2: 1.0, 3: 1.4, 4: 1.8, 5: 2.2, 6: 2.6,
};

export const MOVING_STAIRS_FEE = {
  no: 0, yes_origin: 40, yes_dest: 40, yes_both: 75,
};

export const MOVING_PACKING_FEE = {
  no: 0, partial: 80, full: 200,
};

export const MOVING_RATES = {
  per_mile_short: 1.50,
  per_mile_long: 2.50,
  long_haul_surcharge: 60,
  long_distance_type_premium: 100, // extra base bump if move_type=long_distance
  single_item_base: 50,            // overrides property base when move_type=single_item
  labor_only_per_mover_hour: 45,
  labor_only_default_hours: 2,
  long_distance_threshold_miles: 50,
};

export function computeMovingQuote({
  miles, move_type = "local", property_size = "1br",
  num_movers = 2, has_stairs = "no", packing_needed = "no",
  duration_hours = null,
} = {}) {
  const r = MOVING_RATES;
  const m = miles != null ? Math.max(0, miles) : 0;
  const movers = Math.max(1, Math.min(6, Number(num_movers) || 2));

  // Labor-only: hourly per mover, no distance.
  if (move_type === "labor_only") {
    const hours = duration_hours != null && duration_hours > 0 ? Number(duration_hours) : r.labor_only_default_hours;
    const labor = movers * r.labor_only_per_mover_hour * hours;
    const stairs = MOVING_STAIRS_FEE[has_stairs] || 0;
    const total = Math.round((labor + stairs) * 100) / 100;
    return {
      mode: "labor_only", miles: 0, is_long_distance: false,
      movers, hours, labor_fee: Math.round(labor * 100) / 100,
      stairs_fee: stairs, packing_fee: 0, base_fee: 0,
      short_distance_fee: 0, short_distance_miles: 0, short_per_mile: 0,
      long_distance_fee: 0, long_distance_miles: 0, long_per_mile: 0, long_haul_surcharge: 0,
      total,
    };
  }

  // Property base — single_item overrides
  let base = move_type === "single_item"
    ? r.single_item_base
    : (MOVING_PROPERTY_BASE[property_size] ?? MOVING_PROPERTY_BASE["1br"]);

  // Mover multiplier on base
  const moverMult = MOVING_MOVER_MULT[movers] ?? 1.0;
  base = base * moverMult;

  // Long-distance move type premium (on top of mileage rules)
  if (move_type === "long_distance") base += r.long_distance_type_premium;

  // Stairs + packing
  const stairs = MOVING_STAIRS_FEE[has_stairs] || 0;
  const packing = MOVING_PACKING_FEE[packing_needed] || 0;

  // Distance
  const shortMiles = Math.min(m, r.long_distance_threshold_miles);
  const longMiles = Math.max(0, m - r.long_distance_threshold_miles);
  const shortDistanceFee = shortMiles * r.per_mile_short;
  const longDistanceFee = longMiles * r.per_mile_long;
  const longHaulSurcharge = m > r.long_distance_threshold_miles ? r.long_haul_surcharge : 0;

  const total = Math.round((base + stairs + packing + shortDistanceFee + longDistanceFee + longHaulSurcharge) * 100) / 100;
  return {
    mode: move_type,
    miles: miles != null ? Math.round(miles * 10) / 10 : null,
    is_long_distance: m > r.long_distance_threshold_miles,
    movers,
    base_fee: Math.round(base * 100) / 100,
    base_property: property_size,
    mover_multiplier: moverMult,
    short_distance_fee: Math.round(shortDistanceFee * 100) / 100,
    short_distance_miles: Math.round(shortMiles * 10) / 10,
    short_per_mile: r.per_mile_short,
    long_distance_fee: Math.round(longDistanceFee * 100) / 100,
    long_distance_miles: Math.round(longMiles * 10) / 10,
    long_per_mile: r.per_mile_long,
    long_haul_surcharge: longHaulSurcharge,
    stairs_fee: stairs,
    packing_fee: packing,
    total,
  };
}
