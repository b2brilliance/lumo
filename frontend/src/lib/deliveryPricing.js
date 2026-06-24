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
