/**
 * Dispatch-Capacity Pricing Engine
 *
 * Handles configurable dispatch-box capacity thresholds and delivery fee surcharges
 * (e.g. Guinea Fowl orders > 5 packs occupy a full dispatch box and double the normal delivery fee).
 */

import { getPromoBirdCount } from './promoOffers';

export const DEFAULT_DISPATCH_CAPACITY_MESSAGE =
  "Your order exceeds the standard dispatch-box capacity. It will occupy the full dispatch box (requiring 2 dispatch boxes), so the rider cannot carry other customers' orders alongside it. The delivery fee for this order is therefore doubled.";

/**
 * Determines whether a product is subject to dispatch-capacity surcharge rules:
 * - Either `dispatch_surcharge_enabled === true` is explicitly configured on the product
 * - Or `dispatch_surcharge_enabled` is not explicitly set to `false` AND the product is a Guinea Fowl item (`guinea fowl` in name).
 */
export function isDispatchSurchargeTargetProduct(item) {
  if (!item) return false;
  if (item.dispatch_surcharge_enabled === true) return true;
  if (item.dispatch_surcharge_enabled === false) return false;
  const name = String(item.name || '').toLowerCase();
  return name.includes('guinea fowl') || name.includes('guineafowl');
}

/**
 * Calculates the unit count of a cart item according to the configured dispatch_threshold_unit:
 * - 'packs' | 'items': uses the item's cart quantity (`item.qty`)
 * - 'birds': uses `item.qty * Math.max(1, getPromoBirdCount(item))`
 */
export function getItemDispatchUnitQty(item, unit = 'packs') {
  const qty = Math.max(0, Number(item?.qty) || 0);
  if (qty === 0) return 0;
  if (unit === 'birds') {
    const birdsPerPack = Math.max(1, getPromoBirdCount(item));
    return qty * birdsPerPack;
  }
  return qty;
}

/**
 * Checks whether a numeric quantity meets the configured threshold operator ('gt' for > or 'gte' for >=).
 */
export function meetsDispatchThreshold(qty, thresholdQty, operator = 'gt') {
  const numQty = Number(qty) || 0;
  const numThreshold = Number(thresholdQty) || 5;
  if (operator === 'gte') {
    return numQty >= numThreshold;
  }
  return numQty > numThreshold;
}

/**
 * Evaluates the current cart items against product-level dispatch-capacity pricing rules.
 *
 * Explicit Precedence Rule:
 * When an order triggers the dispatch-capacity surcharge (`triggered = true`) because it occupies
 * an entire dispatch box, standard free-shipping flags or multi-bird delivery discount overlays
 * do NOT waive the dedicated dispatch surcharge; `baseZoneFee * multiplier + fixedSurcharge`
 * is applied for delivery orders.
 *
 * @param {Array} cartItems - Items in the cart (each hydrated with product fields)
 * @param {number} baseZoneFee - Standard delivery fee for the customer's selected delivery zone/area
 * @param {string} deliveryType - 'delivery' | 'pickup'
 */
export function evaluateDispatchCapacitySurcharge(cartItems = [], baseZoneFee = 0, deliveryType = 'delivery') {
  const normalFee = Math.max(0, Number(baseZoneFee) || 0);

  if (deliveryType === 'pickup' || !Array.isArray(cartItems) || cartItems.length === 0) {
    return {
      triggered: false,
      requiresDedicatedDispatch: false,
      qualifyingQty: 0,
      baseFee: normalFee,
      baseDeliveryFee: normalFee,
      finalFee: deliveryType === 'pickup' ? 0 : normalFee,
      finalDeliveryFee: deliveryType === 'pickup' ? 0 : normalFee,
      surchargeAmount: 0,
      multiplier: 1,
      appliedMultiplier: 1,
      fixedSurcharge: 0,
      triggeringItems: [],
      customerMessage: '',
      warningMessage: null,
      snapshot: null,
    };
  }

  const paidItems = cartItems.filter(i => !i.is_promo_reward);
  const triggeringItems = [];
  let maxMultiplier = 1;
  let totalFixedSurcharge = 0;
  let primaryMessage = '';

  // Group compatible items configured with 'combined_compatible' (default for Guinea Fowl)
  const combinedItems = [];

  for (const item of paidItems) {
    if (!isDispatchSurchargeTargetProduct(item)) continue;

    const thresholdQty = Number(item.dispatch_threshold_qty) > 0 ? Number(item.dispatch_threshold_qty) : 5;
    const operator = item.dispatch_threshold_operator === 'gte' ? 'gte' : 'gt';
    const unit = item.dispatch_threshold_unit || 'packs';
    const multiplier = Number(item.dispatch_fee_multiplier) >= 1 ? Number(item.dispatch_fee_multiplier) : 2;
    const fixedSurcharge = Math.max(0, Number(item.dispatch_fixed_surcharge) || 0);
    const aggregationMode = item.dispatch_aggregation_mode || 'combined_compatible';
    const itemUnitQty = getItemDispatchUnitQty(item, unit);

    if (aggregationMode === 'combined_compatible') {
      combinedItems.push({
        item,
        thresholdQty,
        operator,
        unit,
        multiplier,
        fixedSurcharge,
        itemUnitQty,
      });
      continue;
    }

    if (meetsDispatchThreshold(itemUnitQty, thresholdQty, operator)) {
      if (multiplier > maxMultiplier) maxMultiplier = multiplier;
      totalFixedSurcharge += fixedSurcharge;
      if (!primaryMessage && item.dispatch_customer_message) {
        primaryMessage = String(item.dispatch_customer_message).trim();
      }
      triggeringItems.push({
        product_id: item.id,
        name: item.name,
        qty: Number(item.qty) || 0,
        evaluated_qty: itemUnitQty,
        threshold_qty: thresholdQty,
        threshold_operator: operator,
        threshold_unit: unit,
        multiplier,
        fixed_surcharge: fixedSurcharge,
      });
    }
  }

  if (combinedItems.length > 0) {
    const totalCombinedQty = combinedItems.reduce((sum, entry) => sum + entry.itemUnitQty, 0);
    const ruleSource = combinedItems[0];
    if (meetsDispatchThreshold(totalCombinedQty, ruleSource.thresholdQty, ruleSource.operator)) {
      for (const entry of combinedItems) {
        if (entry.multiplier > maxMultiplier) maxMultiplier = entry.multiplier;
        if (!primaryMessage && entry.item.dispatch_customer_message) {
          primaryMessage = String(entry.item.dispatch_customer_message).trim();
        }
        triggeringItems.push({
          product_id: entry.item.id,
          name: entry.item.name,
          qty: Number(entry.item.qty) || 0,
          evaluated_qty: totalCombinedQty,
          threshold_qty: entry.thresholdQty,
          threshold_operator: entry.operator,
          threshold_unit: entry.unit,
          multiplier: entry.multiplier,
          fixed_surcharge: entry.fixedSurcharge,
          aggregation_mode: 'combined_compatible',
        });
      }
      totalFixedSurcharge += ruleSource.fixedSurcharge;
    }
  }

  const totalQualifyingQty = combinedItems.reduce((sum, entry) => sum + entry.itemUnitQty, 0) +
    triggeringItems.filter(t => t.aggregation_mode !== 'combined_compatible').reduce((sum, t) => sum + t.evaluated_qty, 0);

  const triggered = triggeringItems.length > 0;
  if (!triggered) {
    return {
      triggered: false,
      requiresDedicatedDispatch: false,
      qualifyingQty: totalQualifyingQty,
      baseFee: normalFee,
      baseDeliveryFee: normalFee,
      finalFee: normalFee,
      finalDeliveryFee: normalFee,
      surchargeAmount: 0,
      multiplier: 1,
      appliedMultiplier: 1,
      fixedSurcharge: 0,
      triggeringItems: [],
      customerMessage: '',
      warningMessage: null,
      snapshot: null,
    };
  }

  const finalFee = Math.round((normalFee * maxMultiplier) + totalFixedSurcharge);
  const surchargeAmount = Math.max(0, finalFee - normalFee);
  const customerMessage = primaryMessage || DEFAULT_DISPATCH_CAPACITY_MESSAGE;

  return {
    triggered: true,
    requiresDedicatedDispatch: true,
    qualifyingQty: totalQualifyingQty,
    baseFee: normalFee,
    baseDeliveryFee: normalFee,
    finalFee,
    finalDeliveryFee: finalFee,
    surchargeAmount,
    multiplier: maxMultiplier,
    appliedMultiplier: maxMultiplier,
    fixedSurcharge: totalFixedSurcharge,
    triggeringItems,
    customerMessage,
    warningMessage: customerMessage,
    snapshot: {
      base_delivery_fee: normalFee,
      multiplier: maxMultiplier,
      fixed_surcharge: totalFixedSurcharge,
      final_delivery_fee: finalFee,
      surcharge_amount: surchargeAmount,
      customer_message: customerMessage,
      triggering_items: triggeringItems,
    },
  };
}

/**
 * Convenience wrapper accepting either an options object `{ cartItems, baseDeliveryFee, deliveryMode }`
 * or positional arguments `(cartItems, baseDeliveryFee, deliveryMode)`.
 */
export function calculateDispatchCapacityPricing(arg1, baseZoneFee = 0, deliveryType = 'delivery') {
  if (arg1 && !Array.isArray(arg1) && typeof arg1 === 'object') {
    return evaluateDispatchCapacitySurcharge(
      arg1.cartItems || [],
      arg1.baseDeliveryFee ?? arg1.baseZoneFee ?? 0,
      arg1.deliveryMode || arg1.deliveryType || 'delivery'
    );
  }
  return evaluateDispatchCapacitySurcharge(arg1, baseZoneFee, deliveryType);
}
