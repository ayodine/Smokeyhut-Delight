import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Checkout from './Checkout';

let mockItems = [];

// Mock contexts
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({
    items: mockItems,
    total: mockItems.reduce((sum, i) => sum + i.price * i.qty, 0),
    itemCount: mockItems.reduce((sum, i) => sum + i.qty, 0),
    clearCart: vi.fn(),
    promoRewardItem: null,
    promoProgress: null,
    cartSessionId: 'test-session',
    captureContact: vi.fn(),
    markConverted: vi.fn(),
    checkStock: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      delivery_cutoff_enabled: false,
    },
  }),
}));

vi.mock('../../context/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({
    customer: null,
  }),
}));

vi.mock('../../lib/supabase', () => ({
  publicSupabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  customerSupabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

vi.mock('../../lib/deliveryMatcher', () => ({
  fetchDeliveryZones: vi.fn().mockResolvedValue([]),
  matchDeliveryZone: vi.fn().mockReturnValue([]),
}));

vi.mock('../../lib/deliveryPromo', () => ({
  fetchDeliveryPromo: vi.fn().mockResolvedValue(null),
  getPromoDeliveryFee: vi.fn().mockReturnValue(null),
}));

vi.mock('../../lib/analytics', () => ({
  trackInitiateCheckout: vi.fn(),
  trackAddPaymentInfo: vi.fn(),
  trackPurchase: vi.fn(),
  splitFullName: vi.fn().mockReturnValue({ firstName: '', lastName: '' }),
}));

vi.mock('../../lib/attribution', () => ({
  getAttribution: vi.fn().mockReturnValue({}),
  formatAttributionForNotes: vi.fn().mockReturnValue(''),
}));

describe('Checkout component rendering', () => {
  it('renders empty cart state cleanly', () => {
    mockItems = [];
    const html = renderToString(
      <MemoryRouter>
        <Checkout />
      </MemoryRouter>
    );

    expect(html).toBeDefined();
    expect(html).toContain('Cart is');
    expect(html).toContain('Empty');
  });

  it('renders full checkout form and order summary cleanly with cart items', () => {
    mockItems = [
      { id: '1', name: 'Full Smokey Guineafowl', price: 12500, qty: 2 }
    ];
    const html = renderToString(
      <MemoryRouter>
        <Checkout />
      </MemoryRouter>
    );

    expect(html).toBeDefined();
    expect(html).toContain('Full Smokey Guineafowl');
  });
});
