/**
 * Promo Offers Engine & Helpers
 *
 * Supports configurable promo offers such as:
 * - "Buy 3 Guinea Fowls, get 1 Free Guinea Fowl (first 20 customers daily)"
 * - Category-based promos
 * - Minimum spend rewards
 */

/**
 * Calculates the bird count multiplier for an item.
 * - Multi-bird packs/combos (Party Pack = 10, Stock Up = 5, Triple Delight / Hangout = 3)
 * - Single whole Guinea Fowl items (Full, King Size, Extra Dry, Travel Standard, etc.) = 1
 * - Non-bird items (Guinea Fowl Rice, drinks, sides, bowls, eggs) = 0
 */
export function getPromoBirdCount(item) {
  if (!item) return 0;
  const name = (item.name || '').toLowerCase();
  const cat = (item.category_id || item.category || '').toLowerCase();

  // Explicit exclusions (rice, bowls, eggs, drinks, sides, kilishi, rabbit)
  if (
    name.includes('rice') ||
    name.includes('egg') ||
    name.includes('bowl') ||
    name.includes('drink') ||
    name.includes('palm wine') ||
    name.includes('palmwine') ||
    name.includes('zobo') ||
    name.includes('bag') ||
    name.includes('gizzard') ||
    name.includes('kilishi') ||
    name.includes('rabbit') ||
    cat === 'drinks' ||
    cat === 'sides'
  ) {
    return 0;
  }

  // Packs & Combos containing multiple guinea fowl birds
  if (name.includes('party pack')) return 10;
  if (name.includes('stock up') || name.includes('stock-up')) return 5;
  if (name.includes('triple delight') || name.includes('hangout')) return 3;

  // Single Guinea Fowl birds (including "GUINEAFOWL", "Full Smokey Guineafowl", "Travel standard Dry Guineafowl", "King size", etc.)
  if (name.includes('guineafowl') || name.includes('guinea fowl') || name.includes('guinea') || cat === 'guineafowl') {
    return 1;
  }

  return 0;
}

/**
 * Calculates the total qualifying quantity or amount in the cart for a given promo.
 */
export function getCartQualifyingQty(cartItems, promo) {
  if (!Array.isArray(cartItems) || cartItems.length === 0 || !promo) return 0;

  const qualifyingType = promo.qualifying_type || 'guinea_fowl_birds';

  if (qualifyingType === 'guinea_fowl_birds') {
    return cartItems.reduce((acc, item) => {
      const qty = Number(item.qty) || 0;
      const birdsPerItem = getPromoBirdCount(item);
      return acc + (qty * birdsPerItem);
    }, 0);
  }

  if (qualifyingType === 'specific_products') {
    const productIds = (promo.qualifying_product_ids || []).map(String);
    return cartItems.reduce((acc, item) => {
      const itemId = String(item.id || item.productId || '');
      if (productIds.includes(itemId)) {
        return acc + (Number(item.qty) || 0);
      }
      return acc;
    }, 0);
  }

  if (qualifyingType === 'category') {
    return cartItems.reduce((acc, item) => {
      const itemCat = String(item.category_id || item.category || '').toLowerCase();
      const promoCat = String(promo.qualifying_category_id || '').toLowerCase();
      if (itemCat === promoCat) {
        return acc + (Number(item.qty) || 0);
      }
      return acc;
    }, 0);
  }

  if (qualifyingType === 'min_amount') {
    return cartItems.reduce((acc, item) => acc + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);
  }

  return 0;
}

/**
 * Evaluates a promo against the current cart items.
 */
export function evaluateCartPromo(promo, cartItems) {
  if (!promo || !Array.isArray(cartItems)) {
    return {
      qualifies: false,
      currentQty: 0,
      requiredQty: 0,
      remainingQtyNeeded: 0,
      progressPercent: 0,
      rewardItem: null,
      isQuotaExhausted: false,
      statusMessage: '',
      remainingToday: 0,
    };
  }

  const isQuotaExhausted = typeof promo.remaining_today === 'number' && promo.remaining_today <= 0;
  const currentQty = getCartQualifyingQty(cartItems, promo);
  const isMinAmount = promo.qualifying_type === 'min_amount';
  const requiredQty = isMinAmount
    ? (Number(promo.min_order_amount) || 1)
    : (Number(promo.min_qualifying_qty) || 1);

  const remainingQtyNeeded = Math.max(0, requiredQty - currentQty);
  const progressPercent = requiredQty > 0 ? Math.min(100, Math.round((currentQty / requiredQty) * 100)) : 100;
  const qualifies = currentQty >= requiredQty && !isQuotaExhausted;

  let rewardItem = null;
  if (qualifies && promo.reward_type === 'free_product') {
    rewardItem = {
      id: promo.reward_product_id ? `promo-${promo.reward_product_id}` : `promo-reward-${promo.id}`,
      productId: promo.reward_product_id || null,
      name: promo.reward_product_name || 'Free Guinea Fowl (Daily Promo Reward)',
      price: 0,
      qty: Number(promo.reward_qty) || 1,
      is_promo_reward: true,
      promo_id: promo.id,
    };
  }

  const rewardName = promo.reward_product_name || 'Free Guinea Fowl';
  const rewardQty = Number(promo.reward_qty) || 1;
  let statusMessage = '';

  if (isQuotaExhausted) {
    statusMessage = "Today's daily promo limit has been reached.";
  } else if (qualifies) {
    statusMessage = `Promo Unlocked: ${rewardQty}× ${rewardName} added to your order!`;
  } else if (currentQty > 0) {
    if (isMinAmount) {
      statusMessage = `Spend ₦${remainingQtyNeeded.toLocaleString()} more to get ${rewardQty}× ${rewardName} FREE!`;
    } else if (promo.qualifying_type === 'guinea_fowl_birds') {
      statusMessage = `Add ${remainingQtyNeeded} more Guinea Fowl${remainingQtyNeeded > 1 ? 's' : ''} to get ${rewardQty}× ${rewardName} FREE!`;
    } else {
      statusMessage = `Add ${remainingQtyNeeded} more item${remainingQtyNeeded > 1 ? 's' : ''} to get ${rewardQty}× ${rewardName} FREE!`;
    }
  } else {
    if (isMinAmount) {
      statusMessage = `Spend ₦${requiredQty.toLocaleString()} or more and get ${rewardQty}× ${rewardName} FREE!`;
    } else if (promo.qualifying_type === 'guinea_fowl_birds') {
      statusMessage = `Order ${requiredQty} or more Guinea Fowls and get ${rewardQty}× ${rewardName} FREE!`;
    } else {
      statusMessage = `Buy ${requiredQty} qualifying items and get ${rewardQty}× ${rewardName} FREE!`;
    }
  }

  return {
    promoId: promo.id,
    promoTitle: promo.title,
    qualifies,
    currentQty,
    requiredQty,
    remainingQtyNeeded,
    progressPercent,
    rewardItem,
    isQuotaExhausted,
    statusMessage,
    remainingToday: promo.remaining_today ?? promo.daily_quota,
  };
}

/**
 * Finds the most relevant active promo for the cart.
 */
export function findBestCartPromo(activePromos, cartItems) {
  if (!Array.isArray(activePromos) || activePromos.length === 0) return null;

  // Filter to auto-applicable promos.
  // NOTE: The RPC `get_active_promo_offers` only returns active promos and does not
  // include the `is_active` field in its result set. The table fallback DOES include it.
  // So we check: if is_active is explicitly false, exclude — otherwise treat as active.
  const candidates = activePromos.filter(p => p.is_active !== false && p.auto_apply !== false);
  if (candidates.length === 0) return null;

  let bestEvaluation = null;

  for (const promo of candidates) {
    const evaluation = evaluateCartPromo(promo, cartItems);
    if (evaluation.qualifies) {
      return { promo, evaluation };
    }
    if (!bestEvaluation || evaluation.currentQty > bestEvaluation.evaluation.currentQty) {
      bestEvaluation = { promo, evaluation };
    }
  }

  return bestEvaluation;
}

/**
 * Fetches active promo offers from Supabase.
 */
export async function fetchActivePromos(supabaseClient) {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient.rpc('get_active_promo_offers');
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[PromoOffers] RPC fetch failed, trying table fallback:', err);
  }

  // Fallback direct table query if RPC is not yet registered or returned empty
  try {
    const { data, error } = await supabaseClient
      .from('promo_offers')
      .select('*')
      .eq('is_active', true);
    if (!error && Array.isArray(data)) {
      return data.map(d => ({
        ...d,
        claimed_today: 0,
        remaining_today: d.daily_quota ?? 999999,
      }));
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error('[PromoOffers] Direct table query failed:', err);
  }

  return [];
}
