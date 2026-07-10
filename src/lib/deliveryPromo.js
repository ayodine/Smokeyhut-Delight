/**
 * Delivery-fee promo overlay.
 *
 * Config lives in app_settings under key 'delivery_promo':
 *   { enabled: boolean, product_ids: [], area_fees: { "<area name, lowercased>": fee } }
 *
 * The promo never touches delivery_zones/delivery_areas — checkout swaps in the
 * promo fee only when the promo is enabled, the cart contains a promo product,
 * and the matched area has an override. Fee 0 means free delivery.
 */

export async function fetchDeliveryPromo(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('app_settings')
    .select('value')
    .eq('key', 'delivery_promo')
    .maybeSingle();
  if (error || !data) return null;
  return data.value || null;
}

/**
 * Returns the promo delivery fee (number, 0 = free) or null when no override applies.
 * Qualification: the cart contains at least one promo product (other items are fine).
 * Never returns more than normalPrice, so the promo can only lower a fee.
 */
export function getPromoDeliveryFee(promo, cartItems, areaName, normalPrice) {
  if (!promo?.enabled) return null;
  const productIds = (promo.product_ids || []).map(String);
  if (productIds.length === 0) return null;
  if (!Array.isArray(cartItems) || cartItems.length === 0) return null;
  if (!cartItems.some(i => productIds.includes(String(i.id)))) return null;

  const key = (areaName || '').toLowerCase().trim();
  const fee = promo.area_fees?.[key];
  if (typeof fee !== 'number' || fee < 0) return null;

  const normal = typeof normalPrice === 'number' ? normalPrice : Infinity;
  return Math.min(fee, normal);
}
