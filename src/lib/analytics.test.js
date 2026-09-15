import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackPageView,
  trackViewContent,
  trackAddToCart,
  trackInitiateCheckout,
  trackAddPaymentInfo,
  trackPurchase,
} from './analytics';

describe('analytics helper', () => {
  beforeEach(() => {
    globalThis.window = {
      fbq: vi.fn(),
      snaptr: vi.fn(),
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it('trackPageView calls both fbq and snaptr', () => {
    trackPageView();
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'PageView');
    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'PAGE_VIEW');
  });

  it('trackViewContent passes category and name to both', () => {
    trackViewContent({ category: 'Catalog', name: 'Main Menu' });
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'ViewContent', {
      content_type: 'product_group',
      content_name: 'Main Menu',
    });
    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'VIEW_CONTENT', {
      item_category: 'Catalog',
      description: 'Main Menu',
    });
  });

  it('trackAddToCart passes product details to both', () => {
    trackAddToCart({ id: 10, name: 'Full Guinea Fowl', price: 15000 });
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'AddToCart', {
      content_name: 'Full Guinea Fowl',
      content_ids: ['10'],
      content_type: 'product',
      value: 15000,
      currency: 'NGN',
    });
    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'ADD_CART', {
      item_category: 'product',
      item_ids: ['10'],
      description: 'Full Guinea Fowl',
      price: 15000,
      currency: 'NGN',
      number_items: 1,
    });
  });

  it('trackInitiateCheckout passes total and item count to both', () => {
    trackInitiateCheckout({ total: 25000, itemsCount: 3 });
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', {
      content_type: 'product',
      num_items: 3,
      value: 25000,
      currency: 'NGN',
    });
    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'START_CHECKOUT', {
      price: 25000,
      currency: 'NGN',
      number_items: 3,
    });
  });

  it('trackAddPaymentInfo passes amount and items count to both', () => {
    trackAddPaymentInfo({ total: 18000, itemsCount: 2 });
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'AddPaymentInfo', {
      content_type: 'product',
      value: 18000,
      currency: 'NGN',
      num_items: 2,
    });
    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'ADD_BILLING', {
      price: 18000,
      currency: 'NGN',
      number_items: 2,
    });
  });

  it('trackPurchase passes orderId, total, and item count to both', () => {
    trackPurchase({ orderId: 'SHD-07000', total: 20000, itemsCount: 2 });
    expect(globalThis.window.fbq).toHaveBeenCalledWith('track', 'Purchase', {
      content_type: 'product',
      currency: 'NGN',
      value: 20000,
      num_items: 2,
      order_id: 'SHD-07000',
    });
    expect(globalThis.window.snaptr).toHaveBeenCalledWith('track', 'PURCHASE', {
      currency: 'NGN',
      price: 20000,
      number_items: 2,
      transaction_id: 'SHD-07000',
    });
  });

  it('handles missing fbq and snaptr gracefully without throwing', () => {
    delete globalThis.window.fbq;
    delete globalThis.window.snaptr;
    expect(() => trackPageView()).not.toThrow();
    expect(() => trackAddToCart({ id: 1, name: 'Item', price: 100 })).not.toThrow();
    expect(() => trackPurchase({ orderId: '123' })).not.toThrow();
  });
});
