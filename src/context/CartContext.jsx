import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useCartTracker } from '../hooks/useCartTracker';
import { publicSupabase } from '../lib/supabase';
import { fetchActivePromos, findBestCartPromo } from '../lib/promoOffers';
import { trackAddToCart } from '../lib/analytics';

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

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
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
        return prev.map(i => i.id === product.id ? { ...i, ...product, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });

    trackAddToCart({
      id: product.id,
      name: product.name,
      price: product.price,
    });
  }, []);

  const syncCartWithDbProducts = useCallback((dbProductsMap) => {
    if (!dbProductsMap || typeof dbProductsMap.get !== 'function') return;
    setItems(prev => {
      let changed = false;
      const next = prev.map(item => {
        const dbProd = dbProductsMap.get(String(item.id));
        if (!dbProd) return item;
        const hasDbPreorderFields = dbProd.preorder_enabled !== undefined && (dbProd.preorder_enabled || dbProd.preorder_release_date);
        const hasDbDispatchFields = dbProd.dispatch_surcharge_enabled !== undefined;
        if (!hasDbPreorderFields && !hasDbDispatchFields) return item;

        const nextPreorderEnabled = hasDbPreorderFields ? dbProd.preorder_enabled : item.preorder_enabled;
        const nextPreorderRelease = hasDbPreorderFields ? dbProd.preorder_release_date : item.preorder_release_date;
        const nextPreorderMode = hasDbPreorderFields ? dbProd.preorder_scheduling_mode : item.preorder_scheduling_mode;
        const nextPreorderMsg = hasDbPreorderFields ? dbProd.preorder_message : item.preorder_message;

        const shouldUpdate =
          item.preorder_enabled !== nextPreorderEnabled ||
          item.preorder_release_date !== nextPreorderRelease ||
          item.preorder_scheduling_mode !== nextPreorderMode ||
          item.preorder_message !== nextPreorderMsg ||
          (hasDbDispatchFields && item.dispatch_surcharge_enabled !== dbProd.dispatch_surcharge_enabled);
        if (!shouldUpdate) return item;
        changed = true;
        return {
          ...item,
          preorder_enabled: nextPreorderEnabled,
          preorder_open_at: dbProd.preorder_open_at ?? item.preorder_open_at,
          preorder_release_date: nextPreorderRelease,
          preorder_close_at: dbProd.preorder_close_at ?? item.preorder_close_at,
          preorder_status: dbProd.preorder_status ?? item.preorder_status,
          preorder_scheduling_mode: nextPreorderMode,
          preorder_max_capacity: dbProd.preorder_max_capacity ?? item.preorder_max_capacity,
          preorder_reserved_qty: dbProd.preorder_reserved_qty ?? item.preorder_reserved_qty,
          preorder_message: nextPreorderMsg,
          is_preorder: Boolean(nextPreorderEnabled || item.is_preorder),
          dispatch_surcharge_enabled: dbProd.dispatch_surcharge_enabled ?? item.dispatch_surcharge_enabled,
          dispatch_threshold_qty: dbProd.dispatch_threshold_qty ?? item.dispatch_threshold_qty,
          dispatch_threshold_unit: dbProd.dispatch_threshold_unit ?? item.dispatch_threshold_unit,
          dispatch_threshold_operator: dbProd.dispatch_threshold_operator ?? item.dispatch_threshold_operator,
          dispatch_fee_multiplier: dbProd.dispatch_fee_multiplier ?? item.dispatch_fee_multiplier,
          dispatch_fixed_surcharge: dbProd.dispatch_fixed_surcharge ?? item.dispatch_fixed_surcharge,
          dispatch_aggregation_mode: dbProd.dispatch_aggregation_mode ?? item.dispatch_aggregation_mode,
          dispatch_customer_message: dbProd.dispatch_customer_message ?? item.dispatch_customer_message,
        };
      });
      return changed ? next : prev;
    });
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
      syncCartWithDbProducts,
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
      syncCartWithDbProducts,
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
