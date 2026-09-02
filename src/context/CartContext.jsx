import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useCartTracker } from '../hooks/useCartTracker';
import { publicSupabase } from '../lib/supabase';
import { fetchActivePromos, findBestCartPromo } from '../lib/promoOffers';

const CartContext = createContext(null);

const CART_KEY = 'smokeyhut_cart';

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  });

  const [activePromos, setActivePromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(true);

  const loadPromos = useCallback(async () => {
    try {
      const data = await fetchActivePromos(publicSupabase);
      setActivePromos(data || []);
    } catch {
      setActivePromos([]);
    } finally {
      setPromosLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromos();

    // Auto-refresh when tab gains focus
    const onFocus = () => loadPromos();
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);

    // Realtime listener for live promo updates
    const channel = publicSupabase
      .channel('promo-offers-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_offers' }, () => {
        loadPromos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_redemptions' }, () => {
        loadPromos();
      })
      .subscribe();

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
      publicSupabase.removeChannel(channel);
    };
  }, [loadPromos]);

  const {
    sessionId,
    trackCartChange,
    promoteStage,
    captureContact,
    markConverted,
  } = useCartTracker();

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  // Evaluated promo based on current cart
  const bestPromoMatch = useMemo(() => {
    return findBestCartPromo(activePromos, items);
  }, [activePromos, items]);

  const promoOffer = bestPromoMatch?.promo || null;
  const promoEvaluation = bestPromoMatch?.evaluation || null;
  const promoRewardItem = promoEvaluation?.qualifies ? promoEvaluation.rewardItem : null;

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // localStorage unavailable (iOS Private Browsing) or quota exceeded — cart stays in memory
    }
    trackCartChange(items, total, itemCount);
  }, [items, total, itemCount, trackCartChange]);

  const addItem = useCallback((product) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });

    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'AddToCart', {
        content_name: product.name,
        content_ids: [String(product.id)],
        content_type: 'product',
        value: Number(product.price),
        currency: 'NGN'
      });
    }
  }, []);

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) { setItems(prev => prev.filter(i => i.id !== id)); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      itemCount,
      total,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      sessionId,
      promoteStage,
      captureContact,
      markConverted,
      activePromos,
      promosLoading,
      promoOffer,
      promoEvaluation,
      promoRewardItem,
      refreshPromos: loadPromos,
    }),
    [
      items,
      itemCount,
      total,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      sessionId,
      promoteStage,
      captureContact,
      markConverted,
      activePromos,
      promosLoading,
      promoOffer,
      promoEvaluation,
      promoRewardItem,
      loadPromos,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
