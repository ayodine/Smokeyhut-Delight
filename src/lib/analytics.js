/**
 * Analytics helper for Meta (Facebook) Pixel and Snapchat Pixel tracking.
 * Safe to execute in browser and SSR/test environments (guards against missing window/globals).
 */

export const SNAP_PIXEL_ID = '50b7945b-504b-48b7-9802-0411c32675b2';
const TRACKED_SNAP_PURCHASES_KEY = 'smokey_snap_tracked_purchases';

function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * Normalizes email according to Snapchat requirements:
 * Trim whitespace and convert to lowercase.
 */
export function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

/**
 * Normalizes phone number according to Snapchat / E.164 requirements:
 * Remove non-digits. Ensure country code 234 without '+' for Nigerian numbers.
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  // If 11 digits starting with 0 (standard Nigerian mobile: 080..., 090...), convert to 234...
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '234' + digits.slice(1);
  } else if (digits.length === 10) {
    digits = '234' + digits;
  }
  return digits;
}

/**
 * Normalizes first or last name according to Snapchat requirements:
 * Lowercase, trimmed, punctuation removed.
 */
export function normalizeName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

/**
 * Splits full name into first and last name components.
 */
export function splitFullName(name) {
  if (!name) return { firstName: '', lastName: '' };
  const parts = String(name).trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

/**
 * Normalizes postal code:
 * Trim, lowercase, remove whitespace. Defaults to '100001' (Lagos Central) if absent.
 */
export function normalizePostalCode(code) {
  if (!code) return '100001';
  const cleaned = String(code).trim().toLowerCase().replace(/\s+/g, '');
  return cleaned || '100001';
}

/**
 * Computes SHA-256 hash using native crypto.subtle in browsers and Node.js.
 * Returns 64-character lowercase hex string.
 */
export async function sha256(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (e) {
    console.warn('[Analytics] SHA-256 error:', e);
  }
  return '';
}

// Client IP caching
let cachedClientIp = null;

export async function fetchClientIp() {
  if (cachedClientIp) return cachedClientIp;
  if (!isBrowser()) return null;

  try {
    const stored = window.sessionStorage?.getItem('smokey_client_ip');
    if (stored) {
      cachedClientIp = stored;
      return stored;
    }
  } catch {}

  // Skip network fetch in Node test environments
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return null;
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      if (data?.ip) {
        cachedClientIp = data.ip;
        try {
          window.sessionStorage?.setItem('smokey_client_ip', data.ip);
        } catch {}
        return data.ip;
      }
    }
  } catch {}

  return cachedClientIp || null;
}

export function getCachedIp() {
  if (cachedClientIp) return cachedClientIp;
  if (!isBrowser()) return null;
  try {
    cachedClientIp = window.sessionStorage?.getItem('smokey_client_ip');
  } catch {}
  return cachedClientIp || null;
}

// Auto-trigger background IP fetch in browser environments
if (isBrowser() && !(typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')) {
  setTimeout(() => {
    fetchClientIp().catch(() => {});
  }, 1000);
}

/**
 * Once-only order purchase tracking helper to prevent duplicate Snapchat events
 */
export function hasSnapPurchaseFired(orderId) {
  if (!orderId || !isBrowser()) return false;
  try {
    const raw = window.localStorage?.getItem(TRACKED_SNAP_PURCHASES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.includes(String(orderId));
  } catch {
    return false;
  }
}

export function markSnapPurchaseFired(orderId) {
  if (!orderId || !isBrowser()) return;
  try {
    const raw = window.localStorage?.getItem(TRACKED_SNAP_PURCHASES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const idStr = String(orderId);
    if (!list.includes(idStr)) {
      list.push(idStr);
      // Retain max 200 orders to keep localStorage lean
      if (list.length > 200) list.splice(0, list.length - 200);
      window.localStorage?.setItem(TRACKED_SNAP_PURCHASES_KEY, JSON.stringify(list));
    }
  } catch {}
}

/**
 * Track page view across active ad pixels
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
 * Track order purchase completion.
 * Passes comprehensive customer identifiers (normalized and SHA-256 hashed),
 * client deduplication ID, purchase value, currency and transaction ID.
 * Ensures the Snapchat Purchase event fires only once per completed order.
 */
export async function trackPurchase({
  orderId,
  total,
  itemsCount,
  currency = 'NGN',
  customer = {},
} = {}) {
  if (!isBrowser()) return;

  const numTotal = total != null ? Number(total) : undefined;
  const numItems = itemsCount != null ? Number(itemsCount) : undefined;

  // 1. Meta (Facebook) Pixel - standard tracking
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

  // 2. Snapchat Pixel - enriched tracking with customer matching & deduplication
  if (window.snaptr) {
    // Ensure the Snapchat Purchase event fires only ONCE per completed order
    if (orderId && hasSnapPurchaseFired(orderId)) {
      console.info(`[Analytics] Snap Purchase event already fired for order ${orderId}. Skipping.`);
      return;
    }

    try {
      // Normalize customer identifiers
      const emailNorm = normalizeEmail(customer?.email);
      const phoneNorm = normalizePhone(customer?.phone);
      const firstNorm = normalizeName(customer?.firstName);
      const lastNorm = normalizeName(customer?.lastName);
      const postalNorm = normalizePostalCode(customer?.postalCode || customer?.postcode);
      const ip = getCachedIp() || await fetchClientIp();

      // Compute SHA-256 hashes
      const [emailHash, phoneHash, firstHash, lastHash, postalHash] = await Promise.all([
        sha256(emailNorm),
        sha256(phoneNorm),
        sha256(firstNorm),
        sha256(lastNorm),
        sha256(postalNorm),
      ]);

      // Build customer matching parameters
      const snapUser = {};
      if (emailNorm) {
        snapUser.user_email = emailNorm;
        snapUser.user_hashed_email = emailHash;
      }
      if (phoneNorm) {
        snapUser.user_phone_number = phoneNorm;
        snapUser.user_hashed_phone_number = phoneHash;
      }
      if (firstNorm) {
        snapUser.firstname = firstNorm;
        snapUser.user_hashed_first_name = firstHash;
      }
      if (lastNorm) {
        snapUser.lastname = lastNorm;
        snapUser.user_hashed_last_name = lastHash;
      }
      if (postalNorm) {
        snapUser.geo_postal_code = postalNorm;
        snapUser.postal_code = postalNorm;
        snapUser.user_hashed_postal_code = postalHash;
      }
      if (ip) {
        snapUser.ip_address = ip;
      }

      // Update pixel user parameters for maximum Advanced Matching diagnostics coverage
      if (Object.keys(snapUser).length > 0) {
        try {
          window.snaptr('init', SNAP_PIXEL_ID, snapUser);
        } catch (initErr) {
          console.warn('[Analytics] Snap init update error:', initErr);
        }
      }

      // Build Purchase event payload with mandatory fields, customer data, and client deduplication ID
      const snapPayload = {
        currency,
        price: numTotal,
        transaction_id: String(orderId),
        client_dedup_id: String(orderId),
        client_deduplication_id: String(orderId),
        ...snapUser,
      };
      if (numItems != null) snapPayload.number_items = numItems;

      window.snaptr('track', 'PURCHASE', snapPayload);

      // Successfully fired — record orderId so it NEVER fires again
      if (orderId) {
        markSnapPurchaseFired(orderId);
      }
    } catch (e) {
      console.warn('[Analytics] Snap Pixel PURCHASE error:', e);
    }
  }
}
