import { publicSupabase } from './supabase';

/**
 * Checks cart items directly against live database products (bypassing client-side caches).
 * Validates whether items are:
 * 1. Active (is_active !== false)
 * 2. Not soft-deleted (deleted_at IS NULL)
 *
 * NOTE: The store does NOT use product numerical stock.
 * Hidden at the backend (is_active === false) means out of stock.
 * Visible (is_active !== false) means available.
 *
 * @param {Array} items - Cart items with { id, name, qty, ... }
 * @param {object} supabaseClient - Supabase client instance (defaults to publicSupabase)
 * @returns {Promise<{ isValid: boolean, unavailableItems: Array<{ id: any, name: string, reason: string, message: string, availableStock: number|null, requestedQty: number }>, errorSummary: string }>}
 */
export async function verifyCartItemsAvailability(items = [], supabaseClient = publicSupabase) {
  if (!items || !items.length) {
    return { isValid: true, unavailableItems: [], errorSummary: '' };
  }

  // Aggregate quantities needed per product ID, ignoring free promo gifts without a catalog ID
  const qtyNeeded = {};
  const itemNames = {};

  items.forEach(item => {
    if (item && item.id !== null && item.id !== undefined && item.id !== '') {
      const idStr = String(item.id);
      qtyNeeded[idStr] = (qtyNeeded[idStr] || 0) + Number(item.qty || 1);
      if (!itemNames[idStr] && item.name) {
        itemNames[idStr] = item.name;
      }
    }
  });

  const productIds = Object.keys(qtyNeeded);
  if (productIds.length === 0) {
    return { isValid: true, unavailableItems: [], errorSummary: '' };
  }

  try {
    const { data: dbProducts, error } = await supabaseClient
      .from('products')
      .select('id, name, is_active, deleted_at')
      .in('id', productIds);

    if (error) {
      console.error('Error verifying product availability:', error);
      return {
        isValid: false,
        unavailableItems: [{
          id: null,
          name: 'Cart verification error',
          reason: 'error',
          message: 'Could not verify product availability. Please check your connection and try again.',
          availableStock: null,
          requestedQty: 0
        }],
        errorSummary: 'Could not verify product availability. Please check your connection and try again.'
      };
    }

    const prodMap = new Map((dbProducts || []).map(p => [String(p.id), p]));
    const unavailableItems = [];

    for (const idStr of productIds) {
      const dbProd = prodMap.get(idStr);
      const name = dbProd?.name || itemNames[idStr] || 'Item';
      const requested = qtyNeeded[idStr];

      if (!dbProd) {
        unavailableItems.push({
          id: idStr,
          name,
          reason: 'not_found',
          message: `${name} is no longer available`,
          availableStock: 0,
          requestedQty: requested
        });
      } else if (dbProd.deleted_at !== null && dbProd.deleted_at !== undefined) {
        unavailableItems.push({
          id: dbProd.id,
          name: dbProd.name || name,
          reason: 'deleted',
          message: `${dbProd.name || name} is no longer available`,
          availableStock: 0,
          requestedQty: requested
        });
      } else if (dbProd.is_active === false) {
        unavailableItems.push({
          id: dbProd.id,
          name: dbProd.name || name,
          reason: 'hidden',
          message: `${dbProd.name || name} is currently out of stock / unavailable`,
          availableStock: 0,
          requestedQty: requested
        });
      }
    }

    return {
      isValid: unavailableItems.length === 0,
      unavailableItems,
      errorSummary: unavailableItems.map(u => u.message).join(' · ')
    };
  } catch (err) {
    console.error('Unexpected error checking product availability:', err);
    return {
      isValid: false,
      unavailableItems: [{
        id: null,
        name: 'Verification Error',
        reason: 'error',
        message: 'Could not verify product availability. Please try again.',
        availableStock: null,
        requestedQty: 0
      }],
      errorSummary: 'Could not verify product availability. Please try again.'
    };
  }
}
