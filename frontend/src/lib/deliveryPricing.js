// Delivery pricing engine — used by:
//  - Customer service-request form for category = "delivery" or "courier"
//  - Store / restaurant order dialog (mile-only mode)
//
// Rates are intentionally conservative for v1.

export const DELIVERY_RATES = {
  base_fee: 5.0,             // flat base for any delivery
  per_mile: 1.5,             // $/mi
  // Item size base fee (per item)
  size_fee: {
    envelope: 1.5,
    small_box: 3.0,
    medium_box: 6.0,
    large_box: 12.0,
    furniture: 25.0,
    appliance: 35.0,
    vehicle_parts: 20.0,
    groceries: 8.0,
    other: 5.0,
  },
  // Per-pound bump beyond first 5 lbs
  per_lb_over_5: 0.5,
  // Multiplier for fragile / handle-with-care
  fragile_multiplier: 1.2,
  // Each item beyond the first counts at 50% of the size base
  extra_item_multiplier: 0.5,
  // Stores & restaurants: simpler — mile-only
  store_base: 4.0,
  store_per_mile: 1.5,
};

// Haversine miles between two {lat,lng} points
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

/**
 * Compute a delivery quote for a P2P courier / delivery service request.
 * @param {Object} args
 *   miles, item_size, quantity, weight_estimate, fragile
 */
export function computeDeliveryQuote({ miles, item_size = "other", quantity = 1, weight_estimate = 0, fragile = false } = {}) {
  const r = DELIVERY_RATES;
  const distanceFee = miles != null ? Math.max(0, miles) * r.per_mile : 0;
  const sizeBase = r.size_fee[item_size] || r.size_fee.other;
  const extras = Math.max(0, (quantity || 1) - 1) * sizeBase * r.extra_item_multiplier;
  const weightFee = Math.max(0, (weight_estimate || 0) - 5) * r.per_lb_over_5;
  let subtotal = r.base_fee + distanceFee + sizeBase + extras + weightFee;
  if (fragile) subtotal *= r.fragile_multiplier;
  const total = Math.round(subtotal * 100) / 100;
  return {
    miles: miles != null ? Math.round(miles * 10) / 10 : null,
    base_fee: r.base_fee,
    distance_fee: Math.round(distanceFee * 100) / 100,
    size_fee: sizeBase,
    extra_items_fee: Math.round(extras * 100) / 100,
    weight_fee: Math.round(weightFee * 100) / 100,
    fragile_multiplier: fragile ? r.fragile_multiplier : 1.0,
    total,
  };
}

/**
 * Per-mile-only quote for stores & restaurants.
 */
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
