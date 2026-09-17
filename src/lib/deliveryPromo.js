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

import { isQualifyingGuineaFowlBird, getPromoBirdCount } from './promoOffers';

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
 * Delegates to getPromoBirdCount (e.g. 10 for Party Pack, 5 for Stock Up, 3 for Hangout/Triple Delight, 1 for whole bird, 0 for excluded items).
 */
export function getGuineaFowlBirdCount(item) {
  return getPromoBirdCount(item);
}

export function isQualifyingGuineaFowl(item) {
  return isQualifyingGuineaFowlBird(item);
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
  if (!promo?.enabled) return null;
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

