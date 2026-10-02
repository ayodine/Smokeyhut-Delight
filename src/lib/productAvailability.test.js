import { describe, it, expect, vi } from 'vitest';
import { verifyCartItemsAvailability } from './productAvailability';

describe('verifyCartItemsAvailability', () => {
  const createMockSupabase = (products, error = null) => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: products,
          error,
        }),
      })),
    })),
  });

  it('returns valid for empty items array', async () => {
    const res = await verifyCartItemsAvailability([]);
    expect(res.isValid).toBe(true);
    expect(res.unavailableItems).toEqual([]);
    expect(res.errorSummary).toBe('');
  });

  it('ignores items with null or undefined id (e.g. promo gifts)', async () => {
    const res = await verifyCartItemsAvailability([
      { id: null, name: 'Free Promo Guinea Fowl', qty: 1 }
    ]);
    expect(res.isValid).toBe(true);
    expect(res.unavailableItems).toEqual([]);
  });

  it('validates active products with adequate stock', async () => {
    const mockDb = createMockSupabase([
      { id: 101, name: 'Smoked Guinea Fowl', is_active: true, deleted_at: null, stock: 15 },
      { id: 102, name: 'Jollof Rice', is_active: true, deleted_at: null, stock: null },
    ]);

    const items = [
      { id: 101, name: 'Smoked Guinea Fowl', qty: 2 },
      { id: 102, name: 'Jollof Rice', qty: 3 },
    ];

    const res = await verifyCartItemsAvailability(items, mockDb);
    expect(res.isValid).toBe(true);
    expect(res.unavailableItems.length).toBe(0);
  });

  it('identifies hidden products (is_active === false)', async () => {
    const mockDb = createMockSupabase([
      { id: 101, name: 'Smoked Guinea Fowl', is_active: false, deleted_at: null, stock: 10 },
      { id: 102, name: 'Jollof Rice', is_active: true, deleted_at: null, stock: 20 },
    ]);

    const items = [
      { id: 101, name: 'Smoked Guinea Fowl', qty: 1 },
      { id: 102, name: 'Jollof Rice', qty: 2 },
    ];

    const res = await verifyCartItemsAvailability(items, mockDb);
    expect(res.isValid).toBe(false);
    expect(res.unavailableItems.length).toBe(1);
    expect(res.unavailableItems[0].id).toBe(101);
    expect(res.unavailableItems[0].reason).toBe('hidden');
    expect(res.errorSummary).toContain('Smoked Guinea Fowl is currently out of stock / unavailable');
  });

  it('identifies soft-deleted products (deleted_at IS NOT NULL)', async () => {
    const mockDb = createMockSupabase([
      { id: 101, name: 'Discontinued Item', is_active: true, deleted_at: '2026-10-01T12:00:00Z', stock: 10 },
    ]);

    const items = [{ id: 101, name: 'Discontinued Item', qty: 1 }];

    const res = await verifyCartItemsAvailability(items, mockDb);
    expect(res.isValid).toBe(false);
    expect(res.unavailableItems[0].reason).toBe('deleted');
    expect(res.unavailableItems[0].message).toContain('no longer available');
  });

  it('identifies products missing from database', async () => {
    const mockDb = createMockSupabase([]); // No products found

    const items = [{ id: 999, name: 'Ghost Product', qty: 1 }];

    const res = await verifyCartItemsAvailability(items, mockDb);
    expect(res.isValid).toBe(false);
    expect(res.unavailableItems[0].reason).toBe('not_found');
    expect(res.unavailableItems[0].message).toContain('Ghost Product is no longer available');
  });

  it('identifies insufficient stock when total requested exceeds stock', async () => {
    const mockDb = createMockSupabase([
      { id: 101, name: 'Party Pack', is_active: true, deleted_at: null, stock: 2 },
    ]);

    const items = [
      { id: 101, name: 'Party Pack', qty: 2 },
      { id: 101, name: 'Party Pack', qty: 2 }, // Duplicate line item -> sum is 4
    ];

    const res = await verifyCartItemsAvailability(items, mockDb);
    expect(res.isValid).toBe(false);
    expect(res.unavailableItems[0].reason).toBe('out_of_stock');
    expect(res.unavailableItems[0].message).toContain('Only 2 left of Party Pack (you have 4 in bag)');
  });

  it('handles database query errors gracefully by failing safely', async () => {
    const mockDb = createMockSupabase(null, new Error('Network error'));

    const items = [{ id: 101, name: 'Item', qty: 1 }];

    const res = await verifyCartItemsAvailability(items, mockDb);
    expect(res.isValid).toBe(false);
    expect(res.unavailableItems[0].reason).toBe('error');
    expect(res.errorSummary).toContain('Could not verify product availability');
  });
});
