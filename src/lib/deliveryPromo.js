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

export function getPromoDeliveryFee(promo, cartItems, areaName, normalPrice) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return null;

  // 1. Calculate total Guinea Fowl quantity
  const guineaFowlQty = cartItems.reduce((acc, item) => {
    const name = (item.name || '').toLowerCase();
    return (name.includes('guinea') || name.includes('guineafowl')) ? acc + (item.qty || 0) : acc;
  }, 0);

  // 2. Qualification: 3+ Guinea Fowls OR promo active in settings with matching promo product
  const productIds = (promo?.product_ids || []).map(String);
  const matchesProduct = promo?.enabled && productIds.length > 0 && cartItems.some(i => productIds.includes(String(i.id)));
  const qualifies = guineaFowlQty >= 3 || matchesProduct;

  if (!qualifies) return null;

  const normal = typeof normalPrice === 'number' ? normalPrice : Infinity;
  const key = (areaName || '').toLowerCase().trim();
  const fee = promo?.area_fees?.[key];

  if (typeof fee === 'number' && fee >= 0) {
    return Math.min(fee, normal);
  }

  // Fallback discount for 3+ Guinea Fowls: 50% off normal delivery fee
  return Math.round(normal * 0.5);
}
