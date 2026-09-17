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
 * - Genuine Guinea Fowl packs containing >= 3 birds return their respective bird count:
 *   - Party Pack / 10 birds -> 10
 *   - Buy 10 Get 11 -> 11
 *   - Stock Up Pack / 5-pack -> 5
 *   - Hangout Pack -> 3
 *   - Triple Delight Combo -> 3
 * - Individual Guinea Fowl birds -> 1
 * - Excluded items (rice, eggs, drinks, palm wine, zobo, bags, sides, rabbit, chicken, kilishi, standalone gizzard) -> 0
 */
export function getPromoBirdCount(item) {
  if (!item) return 0;
  const name = String(item.name || '').toLowerCase().trim();
  const cat = String(item.category_id || item.category || '').toLowerCase().trim();

  const hasGuineaFowlName = name.includes('guineafowl') || name.includes('guinea fowl');

  // 1. Explicit exclusions for non-bird items (rice, eggs, drinks, sides, rabbits, chicken, kilishi, bags)
  if (
    name.includes('rice') ||
    name.includes('egg') ||
    name.includes('bowl') ||
    name.includes('drink') ||
    name.includes('palm wine') ||
    name.includes('palmwine') ||
    name.includes('zobo') ||
    name.includes('bag') ||
    name.includes('kilishi') ||
    name.includes('rabbit') ||
    (name.includes('chicken') && !hasGuineaFowlName) ||
    cat === 'drinks' ||
    cat === 'sides' ||
    (cat === 'chicken' && !hasGuineaFowlName)
  ) {
    return 0;
  }

  // Standalone gizzard (not a whole bird with gizzard)
  if (name.includes('gizzard') && !hasGuineaFowlName && !name.includes('king size')) {
    return 0;
  }

  // 2. Multi-bird packs containing >= 3 Guinea Fowl birds
  if (name.includes('buy 10') || name.includes('11 bird')) {
    return 11;
  }
  if (name.includes('party pack') || name.includes('10 bird') || name.includes('10-pack') || name.includes('10 pack')) {
    return 10;
  }
  if (name.includes('stock up') || name.includes('stock-up') || name.includes('5 bird') || name.includes('5-pack') || name.includes('5 pack')) {
    return 5;
  }
  if (name.includes('hangout')) {
    return 3;
  }
  if (name.includes('triple delight') || name.includes('3 bird') || name.includes('3-pack') || name.includes('3 pack')) {
    return 3;
  }

  // Generic pack pattern: e.g. "X Birds", "X-Pack", "Pack of X"
  const birdMatch = name.match(/(\d+)\s*(?:birds?|pcs?|pieces?)/i) || name.match(/(\d+)[\s-]*pack/i);
  if (birdMatch) {
    const parsed = parseInt(birdMatch[1], 10);
    if (parsed > 0) return parsed;
  }

  // 3. Genuine individual Guinea Fowl bird
  if (
    hasGuineaFowlName ||
    name.includes('king size') ||
    cat === 'guineafowl'
  ) {
    return 1;
  }

  return 0;
}

/**
 * Determines whether an item is a genuine qualifying Guinea Fowl product (individual bird or qualifying pack).
 */
export function isQualifyingGuineaFowlBird(item) {
  return getPromoBirdCount(item) > 0;
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
      is_free_delivery: false,
      promo_id: promo.id,
    };
  } else if (qualifies && promo.reward_type === 'free_delivery') {
    rewardItem = {
      id: `promo-free-delivery-${promo.id}`,
      productId: null,
      name: promo.reward_product_name || 'Free Delivery',
      price: 0,
      qty: 1,
      is_promo_reward: true,
      is_free_delivery: true,
      promo_id: promo.id,
    };
  }

  const isFreeDelivery = promo.reward_type === 'free_delivery';
  const rewardName = isFreeDelivery
    ? (promo.reward_product_name || 'Free Delivery')
    : (promo.reward_product_name || 'Free Guinea Fowl');
  const rewardQty = Number(promo.reward_qty) || 1;
  let statusMessage = '';

  if (isQuotaExhausted) {
    statusMessage = "Today's daily promo limit has been reached.";
  } else if (qualifies) {
    statusMessage = isFreeDelivery
      ? `Promo Unlocked: ${rewardName} applied to your order!`
      : `Promo Unlocked: ${rewardQty}× ${rewardName} added to your order!`;
  } else if (currentQty > 0) {
    if (isMinAmount) {
      statusMessage = `Spend ₦${remainingQtyNeeded.toLocaleString()} more to get ${rewardName} FREE!`;
    } else if (promo.qualifying_type === 'guinea_fowl_birds') {
      statusMessage = `Add ${remainingQtyNeeded} more Guinea Fowl${remainingQtyNeeded > 1 ? 's' : ''} to unlock ${rewardName} FREE!`;
    } else {
      statusMessage = `Add ${remainingQtyNeeded} more item${remainingQtyNeeded > 1 ? 's' : ''} to unlock ${rewardName} FREE!`;
    }
  } else {
    if (isMinAmount) {
      statusMessage = `Spend ₦${requiredQty.toLocaleString()} or more and get ${rewardName} FREE!`;
    } else if (promo.qualifying_type === 'guinea_fowl_birds') {
      statusMessage = `Order ${requiredQty} or more Guinea Fowls and get ${rewardName} FREE!`;
    } else {
      statusMessage = `Buy ${requiredQty} qualifying items and get ${rewardName} FREE!`;
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
