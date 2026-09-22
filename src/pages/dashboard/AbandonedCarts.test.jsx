import { describe, it, expect } from 'vitest';
import { safeItems } from './AbandonedCarts';

describe('Abandoned Carts Helpers', () => {
  describe('safeItems', () => {
    it('returns array as-is when already an array', () => {
      const items = [{ name: 'Item A', qty: 2, price: 1000 }];
      expect(safeItems(items)).toEqual(items);
    });

    it('parses valid JSON string into array', () => {
      const jsonStr = JSON.stringify([{ name: 'Item B', qty: 1, price: 500 }]);
      expect(safeItems(jsonStr)).toEqual([{ name: 'Item B', qty: 1, price: 500 }]);
    });

    it('returns empty array when JSON is an object instead of array', () => {
      const jsonStr = JSON.stringify({ item: 'not an array' });
      expect(safeItems(jsonStr)).toEqual([]);
    });

    it('returns empty array for malformed JSON string without throwing', () => {
      expect(safeItems('{bad json')).toEqual([]);
    });

    it('returns empty array for null or undefined', () => {
      expect(safeItems(null)).toEqual([]);
      expect(safeItems(undefined)).toEqual([]);
    });
  });
});
