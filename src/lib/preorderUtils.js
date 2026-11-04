/**
 * Pre-Order Management & Delivery Scheduling Utilities
 *
 * Pure domain logic shared across the customer storefront and /admin dashboard:
 * - Product-level pre-order window & capacity evaluation
 * - Release/processing date formatting & customer delivery-date validation
 * - Cart & mixed-cart pre-order evaluation
 * - Homepage pre-order promotion eligibility & priority ordering
 * - Admin pre-order operational stage derivation
 */

/**
 * Returns the current YYYY-MM-DD date string in Africa/Lagos timezone.
 */
export function getLagosDateString(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fallback
  }
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a YYYY-MM-DD date string into a readable label (e.g. "Dec 1, 2026" or "Tuesday, Dec 1, 2026").
 */
export function formatReleaseDate(dateStr, includeWeekday = false) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const clean = dateStr.slice(0, 10);
  const d = new Date(`${clean}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    ...(includeWeekday ? { weekday: 'short' } : {}),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Evaluates a product's pre-order state at a given timestamp.
 *
 * Distinct dates preserved:
 * - openAt: when customers can begin placing pre-orders
 * - releaseDate: earliest date processing/fulfilment can begin (and earliest selectable customer delivery date)
 * - closeAt: optional last date/time customers may place a pre-order
 */
export function getPreorderState(product, now = new Date()) {
  if (!product || !product.preorder_enabled) {
    return {
      enabled: false,
      isPreorderEnabled: false,
      isPreorderActive: false,
      windowState: 'disabled', // 'disabled' | 'upcoming' | 'scheduled' | 'open' | 'closed' | 'capacity_full' | 'capacity_reached' | 'completed'
      openAt: null,
      closeAt: null,
      releaseDate: null,
      formattedReleaseDate: '',
      schedulingMode: 'schedule_after_release',
      maxCapacity: null,
      reservedQty: 0,
      remainingCapacity: null,
      customerMessage: '',
      ctaLabel: 'Add to Cart',
      badgeLabel: null,
      badgeText: null,
    };
  }

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const openAt = product.preorder_open_at ? new Date(product.preorder_open_at) : null;
  const closeAt = product.preorder_close_at ? new Date(product.preorder_close_at) : null;
  const releaseDate = product.preorder_release_date ? String(product.preorder_release_date).slice(0, 10) : null;
  const status = String(product.preorder_status || 'open').toLowerCase();
  const schedulingMode = product.preorder_scheduling_mode === 'schedule_at_checkout'
    ? 'schedule_at_checkout'
    : 'schedule_after_release';

  const rawMaxCap = product.preorder_max_capacity != null && product.preorder_max_capacity !== ''
    ? Number(product.preorder_max_capacity)
    : (product.preorder_max_qty != null && product.preorder_max_qty !== '' ? Number(product.preorder_max_qty) : null);
  const maxCapacity = rawMaxCap != null && rawMaxCap > 0 ? rawMaxCap : null;
  const reservedQty = Math.max(0, Number(product.preorder_reserved_qty) || 0);
  const remainingCapacity = maxCapacity != null ? Math.max(0, maxCapacity - reservedQty) : null;

  let windowState = 'open';

  if (status === 'completed') {
    windowState = 'completed';
  } else if (status === 'closed') {
    windowState = 'closed';
  } else if (openAt && !isNaN(openAt.getTime()) && nowMs < openAt.getTime()) {
    windowState = 'scheduled';
  } else if (closeAt && !isNaN(closeAt.getTime()) && nowMs > closeAt.getTime()) {
    windowState = 'closed';
  } else if (maxCapacity != null && remainingCapacity <= 0) {
    windowState = 'capacity_reached';
  } else {
    windowState = 'open';
  }

  const isPreorderActive = windowState === 'open';
  const formattedReleaseDate = formatReleaseDate(releaseDate);
  const ctaLabel = isPreorderActive
    ? (product.homepage_promo_cta_label && String(product.homepage_promo_cta_label).trim()) || 'Pre-order Now'
    : windowState === 'scheduled'
      ? 'Pre-order Upcoming'
      : windowState === 'capacity_reached'
        ? 'Pre-order Sold Out'
        : windowState === 'closed' || windowState === 'completed'
          ? 'Pre-order Closed'
          : 'Add to Cart';

  return {
    enabled: true,
    isPreorderEnabled: true,
    isPreorderActive,
    windowState,
    openAt: product.preorder_open_at || null,
    closeAt: product.preorder_close_at || null,
    releaseDate,
    formattedReleaseDate,
    schedulingMode,
    maxCapacity,
    reservedQty,
    remainingCapacity,
    customerMessage: product.preorder_message ? String(product.preorder_message).trim() : '',
    ctaLabel,
    badgeLabel: isPreorderActive ? 'Pre-Order' : null,
    badgeText: isPreorderActive ? 'PRE-ORDER' : (windowState === 'scheduled' ? 'PRE-ORDER SOON' : 'PRE-ORDER CLOSED'),
  };
}

/**
 * Validates product-level pre-order configuration in the Admin Add/Edit Product form.
 * Returns { valid: boolean, error: string | null }.
 */
export function validateProductPreorderConfig(form) {
  if (!form) return { valid: true, isValid: true, error: null, errors: [] };
  const errors = [];

  if (form.preorder_enabled) {
    if (!form.preorder_release_date || !String(form.preorder_release_date).trim()) {
      errors.push('Release date is required when Pre-order is enabled.');
    }

    const releaseDateStr = form.preorder_release_date ? String(form.preorder_release_date).slice(0, 10) : '';
    const releaseEndMs = releaseDateStr ? new Date(`${releaseDateStr}T23:59:59`).getTime() : NaN;

    if (form.preorder_open_at && !isNaN(releaseEndMs)) {
      const openMs = new Date(form.preorder_open_at).getTime();
      if (!isNaN(openMs) && openMs > releaseEndMs) {
        errors.push('Pre-order opening date/time cannot be later than the release date.');
      }
    }

    if (form.preorder_open_at && form.preorder_close_at) {
      const openMs = new Date(form.preorder_open_at).getTime();
      const closeMs = new Date(form.preorder_close_at).getTime();
      if (!isNaN(openMs) && !isNaN(closeMs) && closeMs <= openMs) {
        errors.push('Pre-order closing date/time must be after the opening date/time.');
      }
    }

    if (form.preorder_close_at && !isNaN(releaseEndMs)) {
      const closeMs = new Date(form.preorder_close_at).getTime();
      if (!isNaN(closeMs) && closeMs > releaseEndMs) {
        errors.push('Pre-order closing date/time cannot be after the release/processing date.');
      }
    }

    const maxCapVal = form.preorder_max_capacity !== '' && form.preorder_max_capacity != null
      ? form.preorder_max_capacity
      : form.preorder_max_qty;
    if (maxCapVal !== '' && maxCapVal != null) {
      const cap = Number(maxCapVal);
      if (isNaN(cap) || cap < 1 || !Number.isInteger(cap)) {
        errors.push('Maximum pre-order capacity must be a whole number of at least 1.');
      }
    }

    if (form.homepage_promo_enabled && form.homepage_promo_start_at && form.homepage_promo_end_at) {
      const startMs = new Date(form.homepage_promo_start_at).getTime();
      const endMs = new Date(form.homepage_promo_end_at).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs <= startMs) {
        errors.push('Homepage promotion end date/time must be after the start date/time.');
      }
    }
  }

  if (form.dispatch_surcharge_enabled) {
    const qty = Number(form.dispatch_threshold_qty);
    if (isNaN(qty) || qty < 1) {
      errors.push('Dispatch-capacity threshold quantity must be at least 1.');
    }
    const mult = Number(form.dispatch_fee_multiplier);
    if (isNaN(mult) || mult < 1) {
      errors.push('Dispatch-capacity delivery fee multiplier must be 1 or greater (e.g. 2 for 2x delivery fee).');
    }
  }

  return {
    valid: errors.length === 0,
    isValid: errors.length === 0,
    error: errors[0] || null,
    errors,
  };
}

export const validateAdminPreorderConfig = validateProductPreorderConfig;

/**
 * Evaluates pre-order state across all items currently in the cart.
 */
export function evaluateCartPreorders(cartItems = [], dbProductsMap = null, now = new Date()) {
  const effectiveNow = dbProductsMap instanceof Date ? dbProductsMap : now;
  const paidItems = (cartItems || []).filter(i => !i.is_promo_reward);
  const preorderItems = [];
  const regularItems = [];
  let latestReleaseDate = null;
  let effectiveSchedulingMode = 'schedule_after_release';

  for (const rawItem of paidItems) {
    const dbProd = dbProductsMap && !(dbProductsMap instanceof Date) && rawItem?.id != null
      ? dbProductsMap[String(rawItem.id)]
      : null;
    const item = dbProd ? { ...rawItem, ...dbProd } : rawItem;
    const pState = getPreorderState(item, effectiveNow);
    const isPreorder = Boolean(item.is_preorder || pState.isPreorderActive);
    if (isPreorder) {
      const rel = item.preorder_release_date || pState.releaseDate || null;
      const mode = item.preorder_scheduling_mode || pState.schedulingMode || 'schedule_after_release';
      preorderItems.push({
        ...item,
        preorderReleaseDate: rel,
        formattedReleaseDate: formatReleaseDate(rel),
        preorderSchedulingMode: mode,
        preorderMessage: item.preorder_message || pState.customerMessage || '',
      });
      if (rel && (!latestReleaseDate || rel > latestReleaseDate)) {
        latestReleaseDate = rel;
      }
      if (mode === 'schedule_at_checkout') {
        effectiveSchedulingMode = 'schedule_at_checkout';
      }
    } else {
      regularItems.push(item);
    }
  }

  const hasPreorder = preorderItems.length > 0;
  const hasRegular = regularItems.length > 0;
  const isMixedCart = hasPreorder && hasRegular;
  const todayLagos = getLagosDateString(effectiveNow);
  const minDeliveryDate = latestReleaseDate && latestReleaseDate > todayLagos
    ? latestReleaseDate
    : todayLagos;

  return {
    hasPreorder,
    hasRegular,
    isMixedCart,
    preorderItems,
    regularItems,
    latestReleaseDate,
    formattedLatestReleaseDate: formatReleaseDate(latestReleaseDate),
    effectiveSchedulingMode,
    minDeliveryDate,
    mixedCartNotice: isMixedCart
      ? `Your cart contains both a pre-order item (available from ${formatReleaseDate(latestReleaseDate) || 'its release date'}) and regular menu item(s). Combined orders are fulfilled together on or after ${formatReleaseDate(latestReleaseDate) || 'the release date'}. For immediate delivery of regular items, please place them in a separate order.`
      : null,
  };
}

export const analyzeCartPreorders = evaluateCartPreorders;

/**
 * Validates a customer-selected delivery date for a pre-order.
 * Supports both:
 * - Object signature: `validatePreorderDeliveryDate({ selectedDate, releaseDate, schedulingMode, isPostOrderCustomerScheduling, isAdminOverride, now })`
 * - Positional signature: `validatePreorderDeliveryDate(selectedDate, cartPreordersOrOptions, now)`
 */
export function validatePreorderDeliveryDate(arg1, arg2 = null, arg3 = new Date()) {
  let selectedDate;
  let releaseDate;
  let schedulingMode = 'schedule_after_release';
  let isPostOrderCustomerScheduling = false;
  let isAdminOverride = false;
  let now = arg3 instanceof Date ? arg3 : new Date();

  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    selectedDate = arg1.selectedDate;
    releaseDate = arg1.releaseDate;
    schedulingMode = arg1.schedulingMode || 'schedule_after_release';
    isPostOrderCustomerScheduling = Boolean(arg1.isPostOrderCustomerScheduling);
    isAdminOverride = Boolean(arg1.isAdminOverride);
    now = arg1.now || now;
  } else {
    selectedDate = arg1;
    if (arg2 && typeof arg2 === 'object') {
      releaseDate = arg2.latestReleaseDate || arg2.releaseDate || null;
      schedulingMode = arg2.effectiveSchedulingMode || arg2.schedulingMode || 'schedule_after_release';
      isPostOrderCustomerScheduling = Boolean(arg2.isPostOrderCustomerScheduling);
      isAdminOverride = Boolean(arg2.isAdminOverride);
    } else if (typeof arg2 === 'string') {
      releaseDate = arg2;
    }
  }

  const todayLagos = getLagosDateString(now);
  const cleanRelease = releaseDate ? String(releaseDate).slice(0, 10) : null;
  const cleanSelected = selectedDate ? String(selectedDate).slice(0, 10) : null;

  if (
    isPostOrderCustomerScheduling &&
    !isAdminOverride &&
    schedulingMode === 'schedule_after_release' &&
    cleanRelease &&
    todayLagos < cleanRelease
  ) {
    const error = `Delivery scheduling will open on ${formatReleaseDate(cleanRelease)}.`;
    return { valid: false, isValid: false, error };
  }

  if (!cleanSelected) {
    if (schedulingMode === 'schedule_at_checkout' && !isPostOrderCustomerScheduling) {
      const error = `Please select a delivery date on or after ${formatReleaseDate(cleanRelease) || 'the release date'}.`;
      return { valid: false, isValid: false, error };
    }
    if (isPostOrderCustomerScheduling) {
      const error = 'Please select a delivery date.';
      return { valid: false, isValid: false, error };
    }
    return { valid: true, isValid: true, error: null };
  }

  if (cleanRelease && cleanSelected < cleanRelease) {
    const error = `Selected delivery date cannot be earlier than the release date (${formatReleaseDate(cleanRelease)}).`;
    return { valid: false, isValid: false, error };
  }

  if (!isAdminOverride && cleanSelected < todayLagos) {
    const error = 'Selected delivery date cannot be in the past.';
    return { valid: false, isValid: false, error };
  }

  return { valid: true, isValid: true, error: null };
}

/**
 * Returns active homepage pre-order promotions ordered by priority DESC.
 * Automatically excludes disabled products, closed/exhausted pre-orders, or promotions outside their start/end window.
 */
export function getActiveHomepagePromotions(products = [], now = new Date()) {
  if (!Array.isArray(products) || products.length === 0) return [];
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  return products
    .filter(p => {
      if (!p || p.is_active === false || p.deleted_at) return false;
      if (!p.preorder_enabled || !p.homepage_promo_enabled) return false;

      const pState = getPreorderState(p, now);
      if (!pState.isPreorderActive) return false;

      if (p.homepage_promo_start_at) {
        const startMs = new Date(p.homepage_promo_start_at).getTime();
        if (!isNaN(startMs) && nowMs < startMs) return false;
      }
      if (p.homepage_promo_end_at) {
        const endMs = new Date(p.homepage_promo_end_at).getTime();
        if (!isNaN(endMs) && nowMs > endMs) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const prioDiff = (Number(b.homepage_promo_priority) || 0) - (Number(a.homepage_promo_priority) || 0);
      if (prioDiff !== 0) return prioDiff;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    })
    .map(p => {
      const pState = getPreorderState(p, now);
      return {
        product: p,
        preorderState: pState,
        headline: (p.homepage_promo_headline && String(p.homepage_promo_headline).trim()) || p.name,
        description:
          (p.homepage_promo_description && String(p.homepage_promo_description).trim()) ||
          pState.customerMessage ||
          p.short_desc ||
          p.description ||
          '',
        ctaLabel:
          (p.homepage_promo_cta_label && String(p.homepage_promo_cta_label).trim()) ||
          'Pre-order Now',
        releaseDate: pState.releaseDate,
        formattedReleaseDate: pState.formattedReleaseDate,
      };
    });
}

/**
 * Maps a pre-order record to its operational stage(s) for /admin/orders filtering and badges.
 */
export function deriveAdminPreorderInfo(order, now = new Date()) {
  if (!order) {
    return {
      isPreorder: false,
      stageKey: 'none',
      stageLabel: 'Standard Order',
      badgeClass: 'info',
      isOverdue: false,
      isReleaseReached: false,
      hasSelectedDate: false,
    };
  }

  const todayLagos = getLagosDateString(now);
  const noteReleaseMatch = order.notes ? String(order.notes).match(/\[Pre-Order:\s*Release\s*(\d{4}-\d{2}-\d{2})/i) : null;
  const inferredIsPreorder = Boolean(
    order.is_preorder ||
    noteReleaseMatch ||
    (Array.isArray(order.order_items) && order.order_items.some(it => it && it.is_preorder_item))
  );
  const releaseDate = order.preorder_release_date
    ? String(order.preorder_release_date).slice(0, 10)
    : (noteReleaseMatch ? noteReleaseMatch[1] : null);
  const selectedDate = order.scheduled_delivery_date ? String(order.scheduled_delivery_date).slice(0, 10) : null;
  const hasSelectedDate = Boolean(selectedDate);
  const isReleaseReached = releaseDate ? todayLagos >= releaseDate : true;
  const status = String(order.status || 'pending').toLowerCase();
  const explicitPreorderStatus = String(order.preorder_status || '').toLowerCase();

  // Check if overdue / requires attention:
  // 1) Release-date conflict flagged when product release date moved later than selected delivery date
  // 2) Release date was reached > 2 days ago and customer still has not selected a delivery date
  // 3) Selected delivery date has passed and order is still pending/processing
  let isOverdue = Boolean(order.preorder_date_conflict_flagged);
  if (!isOverdue && releaseDate && !hasSelectedDate && status !== 'cancelled' && status !== 'delivered') {
    const relMs = new Date(`${releaseDate}T00:00:00`).getTime();
    const todayMs = new Date(`${todayLagos}T00:00:00`).getTime();
    if (!isNaN(relMs) && !isNaN(todayMs) && (todayMs - relMs) >= 2 * 86400000) {
      isOverdue = true;
    }
  }
  if (!isOverdue && selectedDate && selectedDate < todayLagos && !['shipped', 'delivered', 'cancelled'].includes(status)) {
    isOverdue = true;
  }

  let stageKey = 'awaiting_release';
  let stageLabel = 'Awaiting Release Date';
  let badgeClass = 'pending';

  if (status === 'cancelled' || explicitPreorderStatus === 'cancelled') {
    stageKey = 'cancelled';
    stageLabel = 'Cancelled';
    badgeClass = 'cancelled';
  } else if (status === 'delivered' || explicitPreorderStatus === 'delivered') {
    stageKey = 'delivered';
    stageLabel = 'Delivered';
    badgeClass = 'delivered';
  } else if (status === 'shipped' || explicitPreorderStatus === 'dispatched') {
    stageKey = 'dispatched';
    stageLabel = 'Dispatched';
    badgeClass = 'shipped';
  } else if (explicitPreorderStatus === 'ready_for_dispatch') {
    stageKey = 'ready_for_dispatch';
    stageLabel = 'Ready for Dispatch';
    badgeClass = 'info';
  } else if (status === 'processing' && hasSelectedDate && isReleaseReached) {
    stageKey = 'processing';
    stageLabel = 'Processing';
    badgeClass = 'processing';
  } else if (hasSelectedDate) {
    stageKey = 'date_selected';
    stageLabel = 'Delivery Date Selected';
    badgeClass = 'info';
  } else if (isReleaseReached) {
    stageKey = 'awaiting_customer_date';
    stageLabel = 'Awaiting Customer Date';
    badgeClass = 'pending';
  } else {
    stageKey = 'awaiting_release';
    stageLabel = 'Awaiting Release Date';
    badgeClass = 'pending';
  }

  return {
    isPreorder: inferredIsPreorder,
    stageKey,
    stageLabel,
    badgeClass,
    isOverdue,
    isReleaseReached,
    hasSelectedDate,
    releaseDate,
    formattedReleaseDate: formatReleaseDate(releaseDate),
    selectedDate,
    formattedSelectedDate: formatReleaseDate(selectedDate, true),
  };
}

/**
 * Checks whether an order matches a specific /admin/orders Pre-orders tab filter.
 */
export function matchesAdminPreorderFilter(order, preFilter = 'all', now = new Date()) {
  if (!order) return false;
  const info = deriveAdminPreorderInfo(order, now);
  if (!info.isPreorder) return false;
  if (preFilter === 'all') return order.status !== 'pending_payment';

  switch (preFilter) {
    case 'awaiting_release':
      return !info.isReleaseReached && info.stageKey !== 'cancelled';
    case 'release_reached':
      return info.isReleaseReached && !['delivered', 'cancelled'].includes(info.stageKey);
    case 'awaiting_customer_date':
      return !info.hasSelectedDate && !['delivered', 'cancelled'].includes(info.stageKey);
    case 'date_selected':
      return info.hasSelectedDate && !['delivered', 'cancelled'].includes(info.stageKey);
    case 'processing':
      return info.stageKey === 'processing' || order.status === 'processing';
    case 'ready_for_dispatch':
      return info.stageKey === 'ready_for_dispatch';
    case 'dispatched':
      return info.stageKey === 'dispatched' || order.status === 'shipped';
    case 'delivered':
      return info.stageKey === 'delivered' || order.status === 'delivered';
    case 'cancelled':
      return info.stageKey === 'cancelled' || order.status === 'cancelled';
    case 'overdue':
      return info.isOverdue && !['delivered', 'cancelled'].includes(info.stageKey);
    default:
      return true;
  }
}

export const PREORDER_ADMIN_FILTERS = [
  { key: 'all', label: 'All pre-orders' },
  { key: 'awaiting_release', label: 'Awaiting release date' },
  { key: 'release_reached', label: 'Release date reached' },
  { key: 'awaiting_customer_date', label: 'Awaiting customer delivery-date selection' },
  { key: 'date_selected', label: 'Delivery date selected' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready_for_dispatch', label: 'Ready for dispatch' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'overdue', label: 'Overdue / requires attention' },
];

export const PREORDER_STATUS_OPTIONS = [
  { value: 'awaiting_release', label: 'Awaiting Release Date' },
  { value: 'awaiting_customer_date', label: 'Awaiting Customer Date' },
  { value: 'date_selected', label: 'Delivery Date Selected' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_dispatch', label: 'Ready for Dispatch' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];
