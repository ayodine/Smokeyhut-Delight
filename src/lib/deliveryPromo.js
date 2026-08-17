/**
 * Delivery-fee promo overlay.
 *
 * Config lives in app_settings under key 'delivery_promo':
 *   { enabled: boolean, product_ids: [], area_fees: { "<area name, lowercased>": fee } }
 *
 * The promo never touches delivery_zones/delivery_areas — checkout swaps in the
 * promo fee only when the promo is enabled, the cart contains qualifying Guinea Fowl products (3+),
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
 * Checks the bird count multiplier for an item.
 * - Multi-bird packs/combos (Hangout Pack = 3, Triple Delight Combo = 3, Stock Up = 5, Party Pack = 10)
 * - Single whole Guinea Fowl items (Full, King Size, Extra Dry, Travel Standard, etc.) = 1
 * - Non-bird items (Guinea Fowl Rice, drinks, sides, bowls) = 0
 */
export function getGuineaFowlBirdCount(item) {
  if (!item) return 0;
  const name = (item.name || '').toLowerCase();

  // Explicit non-bird exclusions
  if (name.includes('rice') || name.includes('bowl') || name.includes('drink') || name.includes('palm wine') || name.includes('zobo')) {
    return 0;
  }

  // Packs & Combos that contain multiple guinea fowl birds
  if (name.includes('party pack')) return 10;
  if (name.includes('stock up') || name.includes('stock-up')) return 5;
  if (name.includes('triple delight') || name.includes('hangout')) return 3;

  // Single Guinea Fowl birds (Full Smokey Guineafowl, King Size, Extra Dry, Travel Standard, etc.)
  if (name.includes('guineafowl') || name.includes('guinea fowl') || name.includes('guinea')) {
    return 1;
  }

  return 0;
}

export function isQualifyingGuineaFowl(item) {
  return getGuineaFowlBirdCount(item) > 0;
}

/**
 * Calculates the total quantity of qualifying Guinea Fowl birds in the cart.
 * If specific promo product IDs are configured, those match with bird multipliers; otherwise uses bird count.
 */
export function getQualifyingGuineaFowlQty(cartItems, promo) {
  if (!Array.isArray(cartItems)) return 0;
  const productIds = (promo?.product_ids || []).map(String);
  const hasConfiguredProducts = promo?.enabled && productIds.length > 0;

  return cartItems.reduce((acc, item) => {
    const qty = Number(item.qty) || 0;
    if (hasConfiguredProducts && productIds.includes(String(item.id))) {
      const birdsPerItem = Math.max(1, getGuineaFowlBirdCount(item));
      return acc + (qty * birdsPerItem);
    }
    const birdsPerItem = getGuineaFowlBirdCount(item);
    return acc + (qty * birdsPerItem);
  }, 0);
}

export function getPromoDeliveryFee(promo, cartItems, areaName, normalPrice) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return null;

  // Qualification requires 3 or more qualifying Guinea Fowl birds
  const qualifyingQty = getQualifyingGuineaFowlQty(cartItems, promo);
  if (qualifyingQty < 3) return null;

  const normal = typeof normalPrice === 'number' ? normalPrice : Infinity;
  const key = (areaName || '').toLowerCase().trim();
  const fee = promo?.area_fees?.[key];

  if (typeof fee === 'number' && fee >= 0) {
    return Math.min(fee, normal);
  }

  // Fallback discount for 3+ Guinea Fowls: 50% off normal delivery fee
  return Math.round(normal * 0.5);
}

