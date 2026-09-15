/**
 * Analytics helper for Meta (Facebook) Pixel and Snapchat Pixel tracking.
 * Safe to execute in browser and SSR/test environments (guards against missing window/globals).
 */

function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * Track page view across all active ad pixels
 */
export function trackPageView() {
  if (!isBrowser()) return;

  if (window.fbq) {
    try {
      window.fbq('track', 'PageView');
    } catch (e) {
      console.warn('[Analytics] Meta Pixel PageView error:', e);
    }
  }

  if (window.snaptr) {
    try {
      window.snaptr('track', 'PAGE_VIEW');
    } catch (e) {
      console.warn('[Analytics] Snap Pixel PAGE_VIEW error:', e);
    }
  }
}

/**
 * Track catalog/product group or item viewing
 */
export function trackViewContent({ category = 'Shop Catalog', name = 'Shop Catalog' } = {}) {
  if (!isBrowser()) return;

  if (window.fbq) {
    try {
      window.fbq('track', 'ViewContent', {
        content_type: 'product_group',
        content_name: name,
      });
    } catch (e) {
      console.warn('[Analytics] Meta Pixel ViewContent error:', e);
    }
  }

  if (window.snaptr) {
    try {
      window.snaptr('track', 'VIEW_CONTENT', {
        item_category: category,
        description: name,
      });
    } catch (e) {
      console.warn('[Analytics] Snap Pixel VIEW_CONTENT error:', e);
    }
  }
}

/**
 * Track adding an item to the shopping cart
 */
export function trackAddToCart({ id, name, price = 0, currency = 'NGN' } = {}) {
  if (!isBrowser()) return;

  const numPrice = Number(price) || 0;

  if (window.fbq) {
    try {
      window.fbq('track', 'AddToCart', {
        content_name: name,
        content_ids: id != null ? [String(id)] : [],
        content_type: 'product',
        value: numPrice,
        currency,
      });
    } catch (e) {
      console.warn('[Analytics] Meta Pixel AddToCart error:', e);
    }
  }

  if (window.snaptr) {
    try {
      window.snaptr('track', 'ADD_CART', {
        item_category: 'product',
        item_ids: id != null ? [String(id)] : [],
        description: name,
        price: numPrice,
        currency,
        number_items: 1,
      });
    } catch (e) {
      console.warn('[Analytics] Snap Pixel ADD_CART error:', e);
    }
  }
}

/**
 * Track starting checkout
 */
export function trackInitiateCheckout({ total = 0, itemsCount = 0, currency = 'NGN' } = {}) {
  if (!isBrowser()) return;

  const numTotal = Number(total) || 0;
  const numItems = Number(itemsCount) || 0;

  if (window.fbq) {
    try {
      window.fbq('track', 'InitiateCheckout', {
        content_type: 'product',
        num_items: numItems,
        value: numTotal,
        currency,
      });
    } catch (e) {
      console.warn('[Analytics] Meta Pixel InitiateCheckout error:', e);
    }
  }

  if (window.snaptr) {
    try {
      window.snaptr('track', 'START_CHECKOUT', {
        price: numTotal,
        currency,
        number_items: numItems,
      });
    } catch (e) {
      console.warn('[Analytics] Snap Pixel START_CHECKOUT error:', e);
    }
  }
}

/**
 * Track adding payment info (e.g. proceeding to card payment)
 */
export function trackAddPaymentInfo({ total = 0, itemsCount = 0, currency = 'NGN' } = {}) {
  if (!isBrowser()) return;

  const numTotal = Number(total) || 0;
  const numItems = Number(itemsCount) || 0;

  if (window.fbq) {
    try {
      window.fbq('track', 'AddPaymentInfo', {
        content_type: 'product',
        value: numTotal,
        currency,
        num_items: numItems,
      });
    } catch (e) {
      console.warn('[Analytics] Meta Pixel AddPaymentInfo error:', e);
    }
  }

  if (window.snaptr) {
    try {
      window.snaptr('track', 'ADD_BILLING', {
        price: numTotal,
        currency,
        number_items: numItems,
      });
    } catch (e) {
      console.warn('[Analytics] Snap Pixel ADD_BILLING error:', e);
    }
  }
}

/**
 * Track order purchase completion
 */
export function trackPurchase({ orderId, total, itemsCount, currency = 'NGN' } = {}) {
  if (!isBrowser()) return;

  const numTotal = total != null ? Number(total) : undefined;
  const numItems = itemsCount != null ? Number(itemsCount) : undefined;

  if (window.fbq) {
    try {
      const fbPayload = {
        content_type: 'product',
        currency,
      };
      if (numTotal != null) fbPayload.value = numTotal;
      if (numItems != null) fbPayload.num_items = numItems;
      if (orderId != null) fbPayload.order_id = String(orderId);

      window.fbq('track', 'Purchase', fbPayload);
    } catch (e) {
      console.warn('[Analytics] Meta Pixel Purchase error:', e);
    }
  }

  if (window.snaptr) {
    try {
      const snapPayload = {
        currency,
      };
      if (numTotal != null) snapPayload.price = numTotal;
      if (numItems != null) snapPayload.number_items = numItems;
      if (orderId != null) snapPayload.transaction_id = String(orderId);

      window.snaptr('track', 'PURCHASE', snapPayload);
    } catch (e) {
      console.warn('[Analytics] Snap Pixel PURCHASE error:', e);
    }
  }
}
