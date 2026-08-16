import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useCartTracker } from '../hooks/useCartTracker';

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

  const {
    sessionId,
    trackCartChange,
    promoteStage,
    captureContact,
    markConverted,
  } = useCartTracker();

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

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
      addItem,
      removeItem,
      updateQty,
      clearCart,
      total,
      itemCount,
      cartSessionId: sessionId,
      promoteStage,
      captureContact,
      markConverted,
    }),
    [items, addItem, removeItem, updateQty, clearCart, total, itemCount, sessionId, promoteStage, captureContact, markConverted]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);

