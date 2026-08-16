import { useEffect, useRef, useCallback } from 'react';
import { publicSupabase } from '../lib/supabase';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { profileToPrefill } from '../lib/customerProfile';

const SESSION_COOKIE_NAME = 'smokeyhut_cart_session';
const SESSION_STORAGE_KEY = 'smokeyhut_cart_session';
const COOKIE_EXPIRY_DAYS = 7;
const DEBOUNCE_DELAY_MS = 1200;

function getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function setCookie(name, value, days) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
  } catch {
    // Ignore cookie write failure (e.g. storage disabled)
  }
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateCartSessionId() {
  let id = getCookie(SESSION_COOKIE_NAME);
  if (!id) {
    try {
      id = localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
  }

  if (!id) {
    id = generateUUID();
  }

  // Ensure both cookie & storage are in sync
  setCookie(SESSION_COOKIE_NAME, id, COOKIE_EXPIRY_DAYS);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // localStorage unavailable
  }

  return id;
}

export function clearCartSessionId() {
  setCookie(SESSION_COOKIE_NAME, '', -1);
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

export function useCartTracker() {
  const customerAuth = useCustomerAuth();
  const user = customerAuth?.user || null;

  const sessionIdRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const currentStageRef = useRef('cart');
  const contactInfoRef = useRef({});
  const latestCartRef = useRef({ items: [], total: 0, itemCount: 0 });

  // Initialize or restore session ID
  useEffect(() => {
    sessionIdRef.current = getOrCreateCartSessionId();
  }, []);

  // Stitch identity if signed-in customer is available
  useEffect(() => {
    if (!user) return;
    const pre = profileToPrefill(user);
    contactInfoRef.current = {
      ...contactInfoRef.current,
      name: `${pre.firstName || ''} ${pre.lastName || ''}`.trim(),
      email: pre.email || user.email || '',
    };
  }, [user]);

  // Direct sync function to Supabase
  const syncToSupabase = useCallback(async (overrides = {}) => {
    const sessionId = sessionIdRef.current || getOrCreateCartSessionId();
    const cart = latestCartRef.current;
    const contact = contactInfoRef.current;

    const payload = {
      session_id: sessionId,
      customer_name: overrides.name || contact.name || null,
      customer_phone: overrides.phone || contact.phone || null,
      customer_email: overrides.email || contact.email || null,
      delivery_zone: overrides.deliveryZone || contact.deliveryZone || null,
      delivery_address: overrides.deliveryAddress || contact.deliveryAddress || null,
      items: cart.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        image: item.image || null,
      })),
      item_count: cart.itemCount,
      cart_total: cart.total,
      stage: overrides.stage || currentStageRef.current || 'cart',
      metadata: {
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        url: typeof window !== 'undefined' ? window.location.pathname : '',
        ...(overrides.metadata || {}),
      },
    };

    try {
      await publicSupabase.rpc('upsert_cart_session', { p: payload });
    } catch {
      // Fire-and-forget: do not block UI on tracking errors
    }
  }, []);

  // Debounced sync for cart item modifications
  const trackCartChange = useCallback((items, total, itemCount) => {
    latestCartRef.current = { items, total, itemCount };

    if (!items || items.length === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      syncToSupabase();
    }, DEBOUNCE_DELAY_MS);
  }, [syncToSupabase]);

  // Stage promotion (e.g. reached 'checkout')
  const promoteStage = useCallback((newStage, extraData = {}) => {
    currentStageRef.current = newStage;
    if (extraData) {
      contactInfoRef.current = {
        ...contactInfoRef.current,
        ...extraData,
      };
    }
    syncToSupabase({ stage: newStage, ...extraData });
  }, [syncToSupabase]);

  // Capture progressive contact details from checkout form fields
  const captureContact = useCallback((details) => {
    contactInfoRef.current = {
      ...contactInfoRef.current,
      ...details,
    };

    if (currentStageRef.current === 'cart' || currentStageRef.current === 'checkout') {
      currentStageRef.current = 'contact_captured';
    }

    syncToSupabase({
      ...details,
      stage: currentStageRef.current,
    });
  }, [syncToSupabase]);

  // Mark session as converted when order completes
  const markConverted = useCallback(async (orderId) => {
    const sessionId = sessionIdRef.current || getCookie(SESSION_COOKIE_NAME);
    if (!sessionId) return;

    try {
      await publicSupabase.rpc('convert_cart_session', {
        p_session_id: sessionId,
        p_order_id: orderId || null,
      });
    } catch {
      // Silent error
    }

    // Reset session ID for fresh visitor state on future visits
    clearCartSessionId();
    sessionIdRef.current = generateUUID();
    setCookie(SESSION_COOKIE_NAME, sessionIdRef.current, COOKIE_EXPIRY_DAYS);
    currentStageRef.current = 'cart';
    contactInfoRef.current = {};
  }, []);

  // Flush on page unload if there are items
  useEffect(() => {
    const handleBeforeUnload = () => {
      const cart = latestCartRef.current;
      if (!cart.items || cart.items.length === 0) return;

      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      const payload = {
        session_id: sessionId,
        customer_name: contactInfoRef.current.name || null,
        customer_phone: contactInfoRef.current.phone || null,
        customer_email: contactInfoRef.current.email || null,
        items: cart.items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        item_count: cart.itemCount,
        cart_total: cart.total,
        stage: currentStageRef.current,
      };

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_cart_session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ p: payload }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return {
    sessionId: sessionIdRef.current,
    trackCartChange,
    promoteStage,
    captureContact,
    markConverted,
  };
}
